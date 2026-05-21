import {
  deriveWindow,
  type CompanionDraft,
} from "@/lib/block-draft-utils"
import type {
  CompanionConversation,
  CompanionMessage,
  CompanionMessageInsight,
  CompanionTimeBlockContext,
  TimeBlock,
  TimeBlockInsight,
} from "@/lib/types"

export type MemoryScope =
  | "today"
  | "yesterday"
  | "recent_days"
  | "date_range"

export interface MemoryRange {
  scope: MemoryScope
  start: string
  end: string
  label: string
}

export interface CompanionMemoryContext {
  scope: MemoryScope
  range: MemoryRange
  blocks: TimeBlock[]
  noteInsights: TimeBlockInsight[]
  linkedMessages: CompanionMessage[]
  chatInsights: CompanionMessageInsight[]
  recentMessages: CompanionMessage[]
  evidenceText: string
}

interface SupabaseClientLike {
  from: (table: string) => any
}

interface BuildMemoryContextInput {
  supabase: SupabaseClientLike
  userId: string
  message: string
  draft?: CompanionDraft | null
  conversation?: CompanionConversation | null
  recentMessages?: CompanionMessage[]
  now?: Date
  limits?: {
    blocks?: number
    noteInsights?: number
    linkedMessages?: number
    chatInsights?: number
    recentMessages?: number
  }
}

function startOfLocalDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function memoryRange(
  scope: MemoryScope,
  start: Date,
  end: Date,
  label: string,
): MemoryRange {
  return {
    scope,
    start: start.toISOString(),
    end: end.toISOString(),
    label,
  }
}

export function inferMemoryRange(
  message: string,
  draft?: CompanionDraft | null,
  now = new Date(),
): MemoryRange {
  if (draft) {
    const window = deriveWindow(draft)
    if (window) {
      return {
        scope: "date_range",
        start: window.startedAt,
        end: window.endedAt,
        label: "draft time window",
      }
    }
  }

  const normalized = message.toLowerCase()
  const todayStart = startOfLocalDay(now)
  const tomorrowStart = addDays(todayStart, 1)

  if (/\b(yesterday|last night)\b/.test(normalized)) {
    return memoryRange(
      "yesterday",
      addDays(todayStart, -1),
      todayStart,
      "yesterday",
    )
  }

  if (/\b(last|past|recent)\s+(few|couple|several)\s+days\b/.test(normalized)) {
    return memoryRange(
      "recent_days",
      addDays(todayStart, -2),
      tomorrowStart,
      "last 3 days",
    )
  }

  if (/\b(this\s+week|past\s+week|last\s+week|week)\b/.test(normalized)) {
    return memoryRange(
      "recent_days",
      addDays(todayStart, -6),
      tomorrowStart,
      "last 7 days",
    )
  }

  if (/\b(this\s+month|past\s+month|last\s+month|month)\b/.test(normalized)) {
    return memoryRange(
      "recent_days",
      addDays(todayStart, -29),
      tomorrowStart,
      "last 30 days",
    )
  }

  return memoryRange("today", todayStart, tomorrowStart, "today")
}

export function formatBlockForMemory(
  block: TimeBlock | CompanionTimeBlockContext,
) {
  const duration = block.duration_seconds
    ? `${Math.round(block.duration_seconds / 60)} min`
    : "duration unknown"
  const startedAt = new Date(block.started_at).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const task = block.task_name ?? "unnamed block"
  const category = block.category
    ? block.category.replace("_", " ")
    : "uncategorized"
  const tags = block.hashtags?.length ? ` #${block.hashtags.join(" #")}` : ""
  const notes = block.notes ? `\n  note: ${block.notes}` : ""
  const metadata = [
    block.mood ? `mood=${block.mood}` : "",
    block.effort_level ? `effort=${block.effort_level}` : "",
    block.satisfaction ? `satisfaction=${block.satisfaction}` : "",
    block.avoidance_marker ? "avoidance_marker=true" : "",
    block.hyperfocus_marker ? "hyperfocus_marker=true" : "",
    block.guilt_marker ? "guilt_marker=true" : "",
    block.novelty_marker ? "novelty_marker=true" : "",
  ].filter(Boolean)
  const meta = metadata.length ? `\n  metadata: ${metadata.join(", ")}` : ""

  return `- ${startedAt}: ${task} (${category}, ${duration})${tags}${notes}${meta}`
}

function formatMessageForMemory(message: CompanionMessage) {
  const createdAt = new Date(message.created_at).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  })
  return `- ${createdAt} ${message.role}: ${message.content}`
}

function compactList(values: string[] | null | undefined, limit = 4) {
  return (values ?? []).filter(Boolean).slice(0, limit).join(", ")
}

function compactClaimEvidence(
  claims: { source_field: string; text: string }[] | null | undefined,
  limit = 4,
) {
  return (claims ?? [])
    .filter((claim) => claim.source_field && claim.text)
    .slice(0, limit)
    .map((claim) => `${claim.source_field}="${claim.text}"`)
    .join(", ")
}

export function formatNoteInsightForMemory(insight: TimeBlockInsight) {
  const parts = [
    compactList(insight.actions)
      ? `actions=${compactList(insight.actions)}`
      : "",
    insight.emotional_tone ? `tone=${insight.emotional_tone}` : "",
    compactList(insight.friction_points)
      ? `friction=${compactList(insight.friction_points)}`
      : "",
    compactList(insight.avoidance_signals)
      ? `avoidance=${compactList(insight.avoidance_signals)}`
      : "",
    compactList(insight.hyperfocus_signals)
      ? `hyperfocus=${compactList(insight.hyperfocus_signals)}`
      : "",
    compactList(insight.satisfaction_signals)
      ? `satisfaction=${compactList(insight.satisfaction_signals)}`
      : "",
    compactList(insight.uncertainty_signals)
      ? `uncertainty=${compactList(insight.uncertainty_signals)}`
      : "",
    compactList(insight.projects)
      ? `projects=${compactList(insight.projects)}`
      : "",
    compactList(insight.themes) ? `themes=${compactList(insight.themes)}` : "",
    compactClaimEvidence(insight.evidence_claims)
      ? `claim_evidence=${compactClaimEvidence(insight.evidence_claims)}`
      : "",
    insight.evidence_excerpt ? `evidence="${insight.evidence_excerpt}"` : "",
  ].filter(Boolean)

  return `- block ${insight.time_block_id}: ${parts.join("; ") || "(no derived signals)"}`
}

export function formatChatInsightForMemory(insight: CompanionMessageInsight) {
  const parts = [
    compactList(insight.did_actions)
      ? `did=${compactList(insight.did_actions)}`
      : "",
    compactList(insight.intended_actions)
      ? `intended=${compactList(insight.intended_actions)}`
      : "",
    compactList(insight.avoided_or_deferred)
      ? `deferred=${compactList(insight.avoided_or_deferred)}`
      : "",
    compactList(insight.friction_points)
      ? `friction=${compactList(insight.friction_points)}`
      : "",
    compactList(insight.emotional_signals)
      ? `emotion=${compactList(insight.emotional_signals)}`
      : "",
    compactList(insight.useful_drift)
      ? `useful_drift=${compactList(insight.useful_drift)}`
      : "",
    compactList(insight.mismatch_signals)
      ? `mismatch=${compactList(insight.mismatch_signals)}`
      : "",
    compactList(insight.themes) ? `themes=${compactList(insight.themes)}` : "",
    compactClaimEvidence(insight.evidence_claims)
      ? `claim_evidence=${compactClaimEvidence(insight.evidence_claims)}`
      : "",
    insight.evidence_excerpt ? `evidence="${insight.evidence_excerpt}"` : "",
  ].filter(Boolean)
  const scope = insight.related_time_block_id
    ? `block ${insight.related_time_block_id}`
    : insight.scope

  return `- ${scope}: ${parts.join("; ") || "(no derived signals)"}`
}

export function formatMemoryContext(context: Omit<CompanionMemoryContext, "evidenceText">) {
  return [
    `memory scope: ${context.range.label} (${context.range.start} to ${context.range.end})`,
    "",
    "time blocks:",
    context.blocks.length
      ? context.blocks.map(formatBlockForMemory).join("\n")
      : "(none in memory scope)",
    "",
    "note-derived insights:",
    context.noteInsights.length
      ? context.noteInsights.map(formatNoteInsightForMemory).join("\n")
      : "(none in memory scope)",
    "",
    "linked companion messages for those blocks:",
    context.linkedMessages.length
      ? context.linkedMessages.map(formatMessageForMemory).join("\n")
      : "(none in memory scope)",
    "",
    "chat-derived insights:",
    context.chatInsights.length
      ? context.chatInsights.map(formatChatInsightForMemory).join("\n")
      : "(none in memory scope)",
    "",
    "recent visible messages:",
    context.recentMessages.length
      ? context.recentMessages.map(formatMessageForMemory).join("\n")
      : "(none)",
  ].join("\n")
}

async function queryRows<T>(query: PromiseLike<{ data: unknown; error: unknown }>) {
  try {
    const { data, error } = await query
    if (error) return [] as T[]
    return (Array.isArray(data) ? data : []) as T[]
  } catch {
    return [] as T[]
  }
}

// In-process memory-context cache. The result is a pure function of
// (userId, range, limits). We key on userId+range.label+limits to keep the
// cache invariant simple. Entries expire after CACHE_TTL_MS; block writes
// clear the user's entries via invalidateMemoryContextForUser.
const MEMORY_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000
const memoryContextCache = new Map<
  string,
  { context: CompanionMemoryContext; expiresAt: number; userId: string }
>()

function memoryCacheKey(
  userId: string,
  rangeLabel: string,
  limits: { blocks: number; noteInsights: number; linkedMessages: number; chatInsights: number },
) {
  return `${userId}::${rangeLabel}::${limits.blocks}-${limits.noteInsights}-${limits.linkedMessages}-${limits.chatInsights}`
}

export function invalidateMemoryContextForUser(userId: string) {
  for (const [key, entry] of memoryContextCache) {
    if (entry.userId === userId) {
      memoryContextCache.delete(key)
    }
  }
}

export async function buildCompanionMemoryContext(
  input: BuildMemoryContextInput,
): Promise<CompanionMemoryContext> {
  const limits = {
    blocks: input.limits?.blocks ?? 40,
    noteInsights: input.limits?.noteInsights ?? 40,
    linkedMessages: input.limits?.linkedMessages ?? 40,
    chatInsights: input.limits?.chatInsights ?? 24,
    recentMessages: input.limits?.recentMessages ?? 8,
  }
  const range = inferMemoryRange(input.message, input.draft, input.now)
  const recentMessages = (input.recentMessages ?? []).slice(
    -limits.recentMessages,
  )

  // The "today" scope spans the user's local day and would go stale near
  // midnight; skip cache for it. Other scopes (yesterday, recent_days,
  // date_range) are stable for the TTL window.
  const cacheable = range.scope !== "today"
  const cacheKey = cacheable ? memoryCacheKey(input.userId, range.label, limits) : null

  if (cacheKey) {
    const cached = memoryContextCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      // recentMessages is per-call (not cacheable). Merge it into a fresh wrapper.
      return {
        ...cached.context,
        recentMessages,
        evidenceText: formatMemoryContext({
          ...cached.context,
          recentMessages,
        }),
      }
    }
  }

  const blocks = await queryRows<TimeBlock>(
    input.supabase
      .from("time_blocks")
      .select("*")
      .eq("user_id", input.userId)
      .lt("started_at", range.end)
      .not("ended_at", "is", null)
      .gt("ended_at", range.start)
      .order("started_at", { ascending: true })
      .limit(limits.blocks),
  )
  const blockIds = blocks.map((block) => block.id)

  const [noteInsights, linkedMessages, chatInsights] = await Promise.all([
    blockIds.length
      ? queryRows<TimeBlockInsight>(
          input.supabase
            .from("time_block_insights")
            .select("*")
            .eq("user_id", input.userId)
            .in("time_block_id", blockIds)
            .order("created_at", { ascending: false })
            .limit(limits.noteInsights),
        )
      : Promise.resolve([] as TimeBlockInsight[]),
    blockIds.length
      ? queryRows<CompanionMessage>(
          input.supabase
            .from("companion_messages")
            .select("*")
            .eq("user_id", input.userId)
            .in("related_time_block_id", blockIds)
            .order("created_at", { ascending: true })
            .limit(limits.linkedMessages),
        )
      : Promise.resolve([] as CompanionMessage[]),
    queryRows<CompanionMessageInsight>(
      input.supabase
        .from("companion_message_insights")
        .select("*")
        .eq("user_id", input.userId)
        .gte("created_at", range.start)
        .lt("created_at", range.end)
        .order("created_at", { ascending: false })
        .limit(limits.chatInsights),
    ),
  ])

  const context = {
    scope: range.scope,
    range,
    blocks,
    noteInsights,
    linkedMessages,
    chatInsights,
    recentMessages,
  }

  const fullContext: CompanionMemoryContext = {
    ...context,
    evidenceText: formatMemoryContext(context),
  }

  if (cacheKey) {
    memoryContextCache.set(cacheKey, {
      context: fullContext,
      expiresAt: Date.now() + MEMORY_CONTEXT_CACHE_TTL_MS,
      userId: input.userId,
    })
  }

  return fullContext
}
