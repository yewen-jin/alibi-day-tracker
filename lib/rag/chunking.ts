import { createHash } from "crypto"
import type {
  CompanionMessage,
  CompanionMessageInsight,
  TimeBlock,
  TimeBlockInsight,
  TimeBlockNoteVersion,
} from "@/lib/types"

export type MemorySourceType =
  | "time_block"
  | "time_block_insight"
  | "companion_message"
  | "companion_message_insight"
  | "time_block_note_version"

export interface MemoryChunkDraft {
  id: string
  userId: string
  sourceType: MemorySourceType
  sourceId: string
  sourceCreatedAt: string
  chunkIndex: number
  chunkText: string
  metadata: Record<string, unknown>
  contentHash: string
}

function compactText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function compactList(values: unknown, limit = 8) {
  return Array.isArray(values)
    ? values.map(compactText).filter(Boolean).slice(0, limit)
    : []
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function stableId(sourceType: MemorySourceType, sourceId: string, index: number) {
  return `${sourceType}:${sourceId}:${index}`
}

function chunk(
  sourceType: MemorySourceType,
  sourceId: string,
  userId: string,
  sourceCreatedAt: string,
  parts: string[],
  metadata: Record<string, unknown>,
) {
  const chunkText = parts.map(compactText).filter(Boolean).join("\n")
  if (chunkText.length < 12) return []
  return [
    {
      id: stableId(sourceType, sourceId, 0),
      userId,
      sourceType,
      sourceId,
      sourceCreatedAt,
      chunkIndex: 0,
      chunkText,
      metadata,
      contentHash: hashText(chunkText),
    },
  ] satisfies MemoryChunkDraft[]
}

export function chunksForTimeBlock(block: TimeBlock): MemoryChunkDraft[] {
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
      `saved time block: ${block.task_name ?? "unnamed block"}`,
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
      tags: block.hashtags ?? [],
      started_at: block.started_at,
      ended_at: block.ended_at,
      source_label: block.task_name ?? block.category ?? "saved block",
    },
  )
}

export function chunksForTimeBlockInsight(
  insight: TimeBlockInsight,
): MemoryChunkDraft[] {
  const claims = compactList(insight.evidence_claims, 6)
    .map((claim) =>
      typeof claim === "object" && claim && "text" in claim
        ? compactText((claim as { text?: unknown }).text)
        : "",
    )
    .filter(Boolean)

  return chunk(
    "time_block_insight",
    insight.id,
    insight.user_id,
    insight.created_at,
    [
      `note insight for block ${insight.time_block_id}`,
      compactList(insight.actions).length
        ? `actions: ${compactList(insight.actions).join(", ")}`
        : "",
      insight.emotional_tone ? `emotional tone: ${insight.emotional_tone}` : "",
      compactList(insight.friction_points).length
        ? `friction: ${compactList(insight.friction_points).join(", ")}`
        : "",
      compactList(insight.avoidance_signals).length
        ? `avoidance: ${compactList(insight.avoidance_signals).join(", ")}`
        : "",
      compactList(insight.hyperfocus_signals).length
        ? `hyperfocus: ${compactList(insight.hyperfocus_signals).join(", ")}`
        : "",
      compactList(insight.satisfaction_signals).length
        ? `satisfaction: ${compactList(insight.satisfaction_signals).join(", ")}`
        : "",
      compactList(insight.uncertainty_signals).length
        ? `uncertainty: ${compactList(insight.uncertainty_signals).join(", ")}`
        : "",
      compactList(insight.projects).length
        ? `projects: ${compactList(insight.projects).join(", ")}`
        : "",
      compactList(insight.themes).length
        ? `themes: ${compactList(insight.themes).join(", ")}`
        : "",
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

export function chunksForCompanionMessage(
  message: CompanionMessage,
): MemoryChunkDraft[] {
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

export function chunksForCompanionMessageInsight(
  insight: CompanionMessageInsight,
): MemoryChunkDraft[] {
  const claims = compactList(insight.evidence_claims, 6)
    .map((claim) =>
      typeof claim === "object" && claim && "text" in claim
        ? compactText((claim as { text?: unknown }).text)
        : "",
    )
    .filter(Boolean)

  return chunk(
    "companion_message_insight",
    insight.id,
    insight.user_id,
    insight.created_at,
    [
      `chat insight for message ${insight.message_id}`,
      compactList(insight.did_actions).length
        ? `did: ${compactList(insight.did_actions).join(", ")}`
        : "",
      compactList(insight.intended_actions).length
        ? `intended: ${compactList(insight.intended_actions).join(", ")}`
        : "",
      compactList(insight.avoided_or_deferred).length
        ? `deferred: ${compactList(insight.avoided_or_deferred).join(", ")}`
        : "",
      compactList(insight.friction_points).length
        ? `friction: ${compactList(insight.friction_points).join(", ")}`
        : "",
      compactList(insight.emotional_signals).length
        ? `emotion: ${compactList(insight.emotional_signals).join(", ")}`
        : "",
      compactList(insight.useful_drift).length
        ? `useful drift: ${compactList(insight.useful_drift).join(", ")}`
        : "",
      compactList(insight.mismatch_signals).length
        ? `mismatch: ${compactList(insight.mismatch_signals).join(", ")}`
        : "",
      compactList(insight.themes).length
        ? `themes: ${compactList(insight.themes).join(", ")}`
        : "",
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

export function chunksForTimeBlockNoteVersion(
  version: TimeBlockNoteVersion,
): MemoryChunkDraft[] {
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
