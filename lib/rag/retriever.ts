import "server-only"

import { sql } from "kysely"
import { getDb } from "@/lib/db/client"
import { formatBlockForMemory, inferMemoryRange } from "@/lib/memory-context"
import { embedMemoryQuery } from "@/lib/rag/embedding"
import type { MemoryRange } from "@/lib/memory-context"
import type { MemorySourceType } from "@/lib/rag/chunking"
import type { TimeBlock } from "@/lib/types"

export type RagUseCase =
  | "companion_chat"
  | "companion_analysis"
  | "dashboard_create"
  | "dashboard_refresh"
  | "dashboard_update"

export interface RetrievedMemoryChunk {
  id: string
  sourceType: MemorySourceType
  sourceId: string
  sourceCreatedAt: string
  chunkText: string
  metadata: Record<string, unknown>
  similarity: number
}

export interface RetrievedMemoryContext {
  chunks: RetrievedMemoryChunk[]
  sourceSummaries: Array<{
    sourceType: MemorySourceType
    sourceId: string
    label: string
    chunkIds: string[]
  }>
  dateWindow: MemoryRange | null
  score: {
    maxSimilarity: number | null
    minSimilarity: number | null
    usedFallback: boolean
    error: string | null
  }
  promptText: string
}

export interface RetrieveMemoryContextInput {
  userId: string
  query: string
  useCase: RagUseCase
  dateRange?: { start: string; end: string; label?: string } | null
  sourceTypes?: MemorySourceType[]
  limit?: number
  minSimilarity?: number
  now?: Date
}

function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`
}

function toMemoryRange(input: RetrieveMemoryContextInput): MemoryRange | null {
  if (input.dateRange) {
    return {
      scope: "date_range",
      start: input.dateRange.start,
      end: input.dateRange.end,
      label: input.dateRange.label ?? "requested range",
    }
  }
  if (input.useCase.startsWith("companion")) {
    return inferMemoryRange(input.query, null, input.now)
  }
  return null
}

function labelFor(chunk: RetrievedMemoryChunk) {
  const label = chunk.metadata.source_label
  return typeof label === "string" && label.trim() ? label : chunk.sourceType
}

function formatPromptText(context: Omit<RetrievedMemoryContext, "promptText">) {
  if (context.chunks.length === 0) {
    return "retrieved memory:\n(none; use the recent visible chat or current dashboard packet only)"
  }

  return [
    `retrieved memory (${context.chunks.length} chunks):`,
    ...context.chunks.map((chunk, index) => {
      const date = new Date(chunk.sourceCreatedAt).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
      return [
        `[${index + 1}] id=${chunk.id} source=${chunk.sourceType} date=${date} score=${chunk.similarity.toFixed(3)}`,
        chunk.chunkText,
      ].join("\n")
    }),
  ].join("\n\n")
}

function diversify(chunks: RetrievedMemoryChunk[], limit: number) {
  const seen = new Map<string, number>()
  const selected: RetrievedMemoryChunk[] = []

  for (const chunk of chunks) {
    const key = `${chunk.sourceType}:${chunk.sourceId}`
    const count = seen.get(key) ?? 0
    if (count >= 2) continue
    selected.push(chunk)
    seen.set(key, count + 1)
    if (selected.length >= limit) break
  }

  return selected
}

async function fallbackRecentBlocks(userId: string, limit: number) {
  const rows = await getDb()
    .selectFrom("time_blocks")
    .selectAll()
    .where("user_id", "=", userId)
    .where("ended_at", "is not", null)
    .orderBy("started_at", "desc")
    .limit(Math.min(limit, 8))
    .execute()
    .catch(() => [])

  return (rows as TimeBlock[]).map((block) => ({
    id: `fallback:block:${block.id}`,
    sourceType: "time_block" as const,
    sourceId: block.id,
    sourceCreatedAt: block.started_at,
    chunkText: formatBlockForMemory(block),
    metadata: { source_label: block.task_name ?? block.category ?? "saved block" },
    similarity: 0,
  }))
}

async function logRetrieval(
  input: RetrieveMemoryContextInput,
  range: MemoryRange | null,
  context: Omit<RetrievedMemoryContext, "promptText">,
) {
  await getDb()
    .insertInto("rag_retrieval_logs")
    .values({
      user_id: input.userId,
      use_case: input.useCase,
      query: input.query.slice(0, 1000),
      source_types: input.sourceTypes ?? null,
      date_range_start: range?.start ?? null,
      date_range_end: range?.end ?? null,
      match_count: context.chunks.length,
      top_source_ids: context.chunks.slice(0, 8).map((chunk) => chunk.sourceId),
      max_similarity: context.score.maxSimilarity,
      min_similarity: context.score.minSimilarity,
      status: context.score.error ? "error" : context.score.usedFallback ? "fallback" : "success",
      error: context.score.error,
    } as any)
    .execute()
    .catch(() => undefined)
}

export async function retrieveMemoryContext(
  input: RetrieveMemoryContextInput,
): Promise<RetrievedMemoryContext> {
  const range = toMemoryRange(input)
  const limit = input.limit ?? 12
  let chunks: RetrievedMemoryChunk[] = []
  let usedFallback = false
  let error: string | null = null

  try {
    const embedding = await embedMemoryQuery(input.query)
    const rows = await sql<{
      id: string
      source_type: MemorySourceType
      source_id: string
      source_created_at: string
      chunk_text: string
      metadata: Record<string, unknown>
      similarity: number
    }>`select * from match_memory_chunks(
      ${vectorLiteral(embedding)}::vector,
      ${input.userId}::uuid,
      ${limit * 2},
      ${input.sourceTypes ?? null}::text[],
      ${range?.start ?? null}::timestamptz,
      ${range?.end ?? null}::timestamptz,
      ${input.minSimilarity ?? 0.2}
    )`.execute(getDb())

    chunks = diversify(
      rows.rows.map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        sourceCreatedAt: row.source_created_at,
        chunkText: row.chunk_text,
        metadata: row.metadata ?? {},
        similarity: Number(row.similarity),
      })),
      limit,
    )
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  if (chunks.length === 0) {
    chunks = await fallbackRecentBlocks(input.userId, Math.min(limit, 6))
    usedFallback = chunks.length > 0
  }

  const similarities = chunks.map((chunk) => chunk.similarity)
  const sourceSummaries = Array.from(
    chunks
      .reduce((map, chunk) => {
        const key = `${chunk.sourceType}:${chunk.sourceId}`
        const current = map.get(key) ?? {
          sourceType: chunk.sourceType,
          sourceId: chunk.sourceId,
          label: labelFor(chunk),
          chunkIds: [] as string[],
        }
        current.chunkIds.push(chunk.id)
        map.set(key, current)
        return map
      }, new Map<string, RetrievedMemoryContext["sourceSummaries"][number]>())
      .values(),
  )

  const base = {
    chunks,
    sourceSummaries,
    dateWindow: range,
    score: {
      maxSimilarity: similarities.length ? Math.max(...similarities) : null,
      minSimilarity: similarities.length ? Math.min(...similarities) : null,
      usedFallback,
      error,
    },
  }
  const context = { ...base, promptText: formatPromptText(base) }
  await logRetrieval(input, range, base)
  return context
}
