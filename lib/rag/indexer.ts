import "server-only"

import { sql } from "kysely"
import { getDb } from "@/lib/db/client"
import { embedMemoryTexts } from "@/lib/rag/embedding"
import {
  chunksForCompanionMessage,
  chunksForCompanionMessageInsight,
  chunksForTimeBlock,
  chunksForTimeBlockInsight,
  chunksForTimeBlockNoteVersion,
  type MemoryChunkDraft,
  type MemorySourceType,
} from "@/lib/rag/chunking"
import type {
  CompanionMessage,
  CompanionMessageInsight,
  TimeBlock,
  TimeBlockInsight,
  TimeBlockNoteVersion,
} from "@/lib/types"

function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`
}

async function markFailed(chunks: MemoryChunkDraft[], error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const db = getDb()
  await Promise.all(
    chunks.map((chunk) =>
      db
        .updateTable("memory_chunks")
        .set({ status: "failed", error: message.slice(0, 500) } as any)
        .where("id", "=", chunk.id)
        .execute()
        .catch(() => undefined),
    ),
  )
}

export async function deleteMemoryChunksForSource(
  userId: string,
  sourceType: MemorySourceType,
  sourceId: string,
) {
  await getDb()
    .deleteFrom("memory_chunks")
    .where("user_id", "=", userId)
    .where("source_type", "=", sourceType)
    .where("source_id", "=", sourceId)
    .execute()
    .catch(() => undefined)
}

export async function deleteMemoryChunksForTimeBlock(userId: string, timeBlockId: string) {
  await getDb()
    .deleteFrom("memory_chunks")
    .where("user_id", "=", userId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("source_type", "=", "time_block"),
          eb("source_id", "=", timeBlockId),
        ]),
        eb(sql`metadata ->> 'time_block_id'`, "=", timeBlockId),
      ]),
    )
    .execute()
    .catch(() => undefined)
}

export async function indexMemoryChunks(chunks: MemoryChunkDraft[]) {
  if (chunks.length === 0) return

  const db = getDb()
  try {
    await Promise.all(
      chunks.map((chunk) =>
        db
          .insertInto("memory_chunks")
          .values({
            id: chunk.id,
            user_id: chunk.userId,
            source_type: chunk.sourceType,
            source_id: chunk.sourceId,
            source_created_at: chunk.sourceCreatedAt,
            chunk_index: chunk.chunkIndex,
            chunk_text: chunk.chunkText,
            metadata: chunk.metadata as any,
            content_hash: chunk.contentHash,
            status: "pending",
            error: null,
          } as any)
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              source_created_at: chunk.sourceCreatedAt,
              chunk_text: chunk.chunkText,
              metadata: chunk.metadata as any,
              content_hash: chunk.contentHash,
              status: "pending",
              error: null,
            } as any),
          )
          .execute(),
      ),
    )
  } catch {
    return
  }

  try {
    const embeddings = await embedMemoryTexts(chunks.map((chunk) => chunk.chunkText))
    await Promise.all(
      chunks.map((chunk, index) =>
        db
          .updateTable("memory_chunks")
          .set({
            embedding: sql`${vectorLiteral(embeddings[index])}::vector`,
            status: "embedded",
            error: null,
            embedded_at: new Date().toISOString(),
          } as any)
          .where("id", "=", chunk.id)
          .where("content_hash", "=", chunk.contentHash)
          .execute(),
      ),
    )
  } catch (error) {
    await markFailed(chunks, error)
  }
}

export async function indexMemoryForTimeBlock(block: TimeBlock) {
  await indexMemoryChunks(chunksForTimeBlock(block))
}

export async function indexMemoryForTimeBlockInsight(insight: TimeBlockInsight) {
  await indexMemoryChunks(chunksForTimeBlockInsight(insight))
}

export async function indexMemoryForCompanionMessage(message: CompanionMessage) {
  await indexMemoryChunks(chunksForCompanionMessage(message))
}

export async function indexMemoryForCompanionMessageInsight(
  insight: CompanionMessageInsight,
) {
  await indexMemoryChunks(chunksForCompanionMessageInsight(insight))
}

export async function indexMemoryForTimeBlockNoteVersion(
  version: TimeBlockNoteVersion,
) {
  await indexMemoryChunks(chunksForTimeBlockNoteVersion(version))
}

export async function backfillMemoryChunksForUser(userId: string) {
  const db = getDb()
  const [blocks, noteInsights, messages, chatInsights, noteVersions] =
    await Promise.all([
      db.selectFrom("time_blocks").selectAll().where("user_id", "=", userId).execute(),
      db
        .selectFrom("time_block_insights")
        .selectAll()
        .where("user_id", "=", userId)
        .execute(),
      db
        .selectFrom("companion_messages")
        .selectAll()
        .where("user_id", "=", userId)
        .where("role", "=", "user")
        .execute(),
      db
        .selectFrom("companion_message_insights")
        .selectAll()
        .where("user_id", "=", userId)
        .execute(),
      db
        .selectFrom("time_block_note_versions")
        .selectAll()
        .where("user_id", "=", userId)
        .execute(),
    ])

  await indexMemoryChunks([
    ...blocks.flatMap((block) => chunksForTimeBlock(block as TimeBlock)),
    ...noteInsights.flatMap((insight) =>
      chunksForTimeBlockInsight(insight as TimeBlockInsight),
    ),
    ...messages.flatMap((message) =>
      chunksForCompanionMessage(message as CompanionMessage),
    ),
    ...chatInsights.flatMap((insight) =>
      chunksForCompanionMessageInsight(insight as CompanionMessageInsight),
    ),
    ...noteVersions.flatMap((version) =>
      chunksForTimeBlockNoteVersion(version as TimeBlockNoteVersion),
    ),
  ])
}
