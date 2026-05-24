import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import pg from "pg"

const { Pool } = pg

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const index = trimmed.indexOf("=")
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(".env.local")
loadEnvFile(".env")

const userArgIndex = process.argv.findIndex((arg) => arg === "--user")
const userId = userArgIndex >= 0 ? process.argv[userArgIndex + 1] : null
const model = process.env.ALIBI_EMBEDDING_MODEL || "text-embedding-3-small"
const dimensions = Number(process.env.ALIBI_EMBEDDING_DIMENSIONS || 1536)
const batchSize = Math.max(1, Number(process.env.ALIBI_EMBEDDING_BATCH_SIZE || 32))
const openAiKey = process.env.OPENAI_API_KEY
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING

if (!connectionString) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required.")
}

if (!openAiKey) {
  throw new Error("OPENAI_API_KEY is required for RAG backfill.")
}

if (dimensions !== 1536) {
  throw new Error("ALIBI_EMBEDDING_DIMENSIONS must be 1536 for this migration.")
}

function sslConfig(value) {
  if (process.env.DATABASE_SSL === "false") return undefined
  return process.env.DATABASE_SSL === "true" ||
    /[?&]sslmode=(require|prefer|verify-ca|verify-full)(?:&|$)/.test(value)
    ? { rejectUnauthorized: false }
    : undefined
}

function poolConnectionString(value, hasSslConfig) {
  if (!hasSslConfig) return value
  try {
    const url = new URL(value)
    url.searchParams.delete("sslmode")
    return url.toString()
  } catch {
    return value
  }
}

const ssl = sslConfig(connectionString)
const pool = new Pool({
  connectionString: poolConnectionString(connectionString, Boolean(ssl)),
  ssl,
})

function compactText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function compactList(values, limit = 8) {
  return Array.isArray(values) ? values.map(compactText).filter(Boolean).slice(0, limit) : []
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex")
}

function chunk(sourceType, sourceId, rowUserId, sourceCreatedAt, parts, metadata) {
  const chunkText = parts.map(compactText).filter(Boolean).join("\n")
  if (chunkText.length < 12) return []
  return [
    {
      id: `${sourceType}:${sourceId}:0`,
      userId: rowUserId,
      sourceType,
      sourceId,
      sourceCreatedAt,
      chunkIndex: 0,
      chunkText,
      metadata,
      contentHash: hashText(chunkText),
    },
  ]
}

function timeBlockChunks(block) {
  const tags = compactList(block.hashtags).map((tag) => `#${tag}`).join(" ")
  const ratings = [
    block.mood ? `mood: ${block.mood}` : "",
    block.effort_level ? `effort: ${block.effort_level}` : "",
    block.satisfaction ? `satisfaction: ${block.satisfaction}` : "",
  ].filter(Boolean)
  const markers = [
    block.avoidance_marker ? "avoidance" : "",
    block.hyperfocus_marker ? "hyperfocus" : "",
    block.guilt_marker ? "guilt" : "",
    block.novelty_marker ? "novelty" : "",
  ].filter(Boolean)

  return chunk(
    "time_block",
    block.id,
    block.user_id,
    block.started_at,
    [
      `saved time block: ${block.task_name || "unnamed block"}`,
      block.category ? `category: ${block.category}` : "",
      `started: ${block.started_at}`,
      block.ended_at ? `ended: ${block.ended_at}` : "",
      typeof block.duration_seconds === "number"
        ? `duration minutes: ${Math.round(block.duration_seconds / 60)}`
        : "",
      tags ? `tags: ${tags}` : "",
      block.notes ? `notes: ${block.notes}` : "",
      ratings.length ? `ratings: ${ratings.join(", ")}` : "",
      markers.length ? `markers: ${markers.join(", ")}` : "",
    ],
    {
      task_name: block.task_name,
      category: block.category,
      tags: block.hashtags || [],
      started_at: block.started_at,
      ended_at: block.ended_at,
      source_label: block.task_name || block.category || "saved block",
    },
  )
}

function noteInsightChunks(insight) {
  const claims = compactList(insight.evidence_claims, 6)
    .map((claim) => compactText(claim?.text))
    .filter(Boolean)

  return chunk(
    "time_block_insight",
    insight.id,
    insight.user_id,
    insight.created_at,
    [
      `note insight for block ${insight.time_block_id}`,
      compactList(insight.actions).length ? `actions: ${compactList(insight.actions).join(", ")}` : "",
      insight.emotional_tone ? `emotional tone: ${insight.emotional_tone}` : "",
      compactList(insight.friction_points).length
        ? `friction: ${compactList(insight.friction_points).join(", ")}`
        : "",
      compactList(insight.themes).length ? `themes: ${compactList(insight.themes).join(", ")}` : "",
      insight.evidence_excerpt ? `evidence: ${insight.evidence_excerpt}` : "",
      claims.length ? `evidence claims: ${claims.join("; ")}` : "",
      insight.source_notes ? `source notes: ${insight.source_notes}` : "",
    ],
    {
      time_block_id: insight.time_block_id,
      note_version_id: insight.note_version_id,
      source_label: "note insight",
    },
  )
}

function messageChunks(message) {
  if (message.role !== "user") return []
  return chunk(
    "companion_message",
    message.id,
    message.user_id,
    message.created_at,
    [`companion message: ${message.content}`],
    {
      conversation_id: message.conversation_id,
      related_time_block_id: message.related_time_block_id,
      source_label: "companion message",
    },
  )
}

function chatInsightChunks(insight) {
  const claims = compactList(insight.evidence_claims, 6)
    .map((claim) => compactText(claim?.text))
    .filter(Boolean)

  return chunk(
    "companion_message_insight",
    insight.id,
    insight.user_id,
    insight.created_at,
    [
      `chat insight for message ${insight.message_id}`,
      compactList(insight.did_actions).length ? `did: ${compactList(insight.did_actions).join(", ")}` : "",
      compactList(insight.intended_actions).length
        ? `intended: ${compactList(insight.intended_actions).join(", ")}`
        : "",
      compactList(insight.friction_points).length
        ? `friction: ${compactList(insight.friction_points).join(", ")}`
        : "",
      compactList(insight.emotional_signals).length
        ? `emotion: ${compactList(insight.emotional_signals).join(", ")}`
        : "",
      compactList(insight.themes).length ? `themes: ${compactList(insight.themes).join(", ")}` : "",
      insight.evidence_excerpt ? `evidence: ${insight.evidence_excerpt}` : "",
      claims.length ? `evidence claims: ${claims.join("; ")}` : "",
    ],
    {
      message_id: insight.message_id,
      conversation_id: insight.conversation_id,
      related_time_block_id: insight.related_time_block_id,
      source_label: "chat insight",
    },
  )
}

function noteVersionChunks(version) {
  const text = compactText(version.new_notes)
  if (text.length < 20) return []
  return chunk(
    "time_block_note_version",
    version.id,
    version.user_id,
    version.created_at,
    [`note version for block ${version.time_block_id}: ${text}`],
    {
      time_block_id: version.time_block_id,
      source: version.source,
      source_label: "note version",
    },
  )
}

async function embedTexts(values) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: values, dimensions }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI embeddings failed: ${response.status} ${text.slice(0, 500)}`)
  }

  const json = await response.json()
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding)
}

async function sourceUsers() {
  if (userId) return [userId]
  const { rows } = await pool.query(`
    select distinct user_id from (
      select user_id from time_blocks
      union select user_id from time_block_insights
      union select user_id from companion_messages
      union select user_id from companion_message_insights
      union select user_id from time_block_note_versions
    ) users
    order by user_id
  `)
  return rows.map((row) => row.user_id)
}

async function chunksForUser(rowUserId) {
  const [blocks, noteInsights, messages, chatInsights, noteVersions] = await Promise.all([
    pool.query("select * from time_blocks where user_id = $1", [rowUserId]),
    pool.query("select * from time_block_insights where user_id = $1", [rowUserId]),
    pool.query("select * from companion_messages where user_id = $1 and role = 'user'", [
      rowUserId,
    ]),
    pool.query("select * from companion_message_insights where user_id = $1", [rowUserId]),
    pool.query("select * from time_block_note_versions where user_id = $1", [rowUserId]),
  ])

  return [
    ...blocks.rows.flatMap(timeBlockChunks),
    ...noteInsights.rows.flatMap(noteInsightChunks),
    ...messages.rows.flatMap(messageChunks),
    ...chatInsights.rows.flatMap(chatInsightChunks),
    ...noteVersions.rows.flatMap(noteVersionChunks),
  ]
}

async function upsertChunk(chunk, embedding) {
  await pool.query(
    `
    insert into memory_chunks (
      id, user_id, source_type, source_id, source_created_at, chunk_index,
      chunk_text, metadata, embedding, content_hash, status, error, embedded_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::vector, $10, 'embedded', null, now())
    on conflict (id) do update set
      source_created_at = excluded.source_created_at,
      chunk_text = excluded.chunk_text,
      metadata = excluded.metadata,
      embedding = excluded.embedding,
      content_hash = excluded.content_hash,
      status = 'embedded',
      error = null,
      embedded_at = now()
    `,
    [
      chunk.id,
      chunk.userId,
      chunk.sourceType,
      chunk.sourceId,
      chunk.sourceCreatedAt,
      chunk.chunkIndex,
      chunk.chunkText,
      JSON.stringify(chunk.metadata),
      `[${embedding.join(",")}]`,
      chunk.contentHash,
    ],
  )
}

async function main() {
  const users = await sourceUsers()
  console.log(`backfilling RAG memory for ${users.length} user${users.length === 1 ? "" : "s"}`)

  for (const currentUserId of users) {
    const chunks = await chunksForUser(currentUserId)
    console.log(`${currentUserId}: ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`)

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const embeddings = await embedTexts(batch.map((item) => item.chunkText))
      await Promise.all(batch.map((item, index) => upsertChunk(item, embeddings[index])))
      console.log(`${currentUserId}: embedded ${Math.min(i + batch.length, chunks.length)}/${chunks.length}`)
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
