import { deriveInsightFromNotes } from "@/lib/note-insights"
import { deriveChatInsightFromMessage } from "@/lib/chat-insights"
import {
  FALLBACK_CATEGORIES,
  defaultCategoryColor,
} from "@/lib/time-block-display"
import type { CompanionDraft } from "@/lib/block-draft-utils"
import { createDemoAiUsage, type DemoAiUsage } from "@/lib/demo-token-budget"
import { attachEvidenceSourceId } from "@/lib/evidence-claims"
import type {
  ActiveTimer,
  CompanionMessageType,
  DashboardViewRecord,
  EffortLevel,
  Mood,
  Satisfaction,
  TimeBlock,
  CompanionMessageInsight,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
} from "@/lib/types"

export const DEMO_SESSION_STORAGE_KEY = "alibi_demo_session_v1"
export const DEMO_SESSION_VERSION = 5

export const DEMO_DEFAULT_CATEGORIES = FALLBACK_CATEGORIES

export interface DemoStoredBlock {
  id: string
  user_id: "demo"
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  category_id: string | null
  task_name: string | null
  category: string | null
  hashtags: string[]
  notes: string | null
  mood: Mood | null
  effort_level: EffortLevel | null
  satisfaction: Satisfaction | null
  avoidance_marker: boolean
  hyperfocus_marker: boolean
  guilt_marker: boolean
  novelty_marker: boolean
  agent_metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DemoStoredMessage {
  id: string
  role: "user" | "assistant"
  text: string
  message_type: CompanionMessageType
  related_time_block_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type DemoAiProvider = "openai_compatible" | "anthropic"

export interface DemoAiSettings {
  provider: DemoAiProvider
  base_url: string
  api_key: string
  companion_model: string
  fast_model: string
}

export interface DemoStoredSession {
  version: 5
  name: string
  active_timer: (ActiveTimer & { resumed_block?: DemoStoredBlock }) | null
  blocks: DemoStoredBlock[]
  categories: TimeBlockCategoryRecord[]
  messages: DemoStoredMessage[]
  block_threads: Record<string, DemoStoredMessage[]>
  pending_draft: CompanionDraft | null
  insights: TimeBlockInsight[]
  chat_insights: CompanionMessageInsight[]
  custom_dashboard: DemoStoredCustomDashboard | null
  ai_usage: DemoAiUsage
  ai_settings: DemoAiSettings
  updated_at: string
}

export interface DemoStoredCustomDashboard {
  view: DashboardViewRecord
  result: Record<string, unknown> | null
}

type LegacyDemoSession = {
  version?: number
  name?: unknown
  active_timer?: { started_at?: string; resumed_block?: Partial<DemoStoredBlock> } | null
  blocks?: Array<Partial<DemoStoredBlock>>
  messages?: Array<Partial<DemoStoredMessage>>
  block_threads?: Record<string, Array<Partial<DemoStoredMessage>>>
  chat_insights?: CompanionMessageInsight[]
  custom_dashboard?: DemoStoredCustomDashboard | null
  ai_usage?: Partial<DemoAiUsage>
  ai_settings?: Partial<DemoAiSettings>
  updated_at?: string
}

export function createDemoAiSettings(): DemoAiSettings {
  return {
    provider: "openai_compatible",
    base_url: "",
    api_key: "",
    companion_model: "",
    fast_model: "",
  }
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function demoDurationSeconds(startedAt: string, endedAt: string | null) {
  if (!endedAt) return null
  const seconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  return Number.isFinite(seconds) ? seconds : null
}

function normalizeBlock(block: Partial<DemoStoredBlock>): DemoStoredBlock | null {
  if (!block.id || !block.started_at) return null
  const now = new Date().toISOString()
  const insight = deriveInsightFromNotes(block.notes ?? null)

  return {
    id: block.id,
    user_id: "demo",
    started_at: block.started_at,
    ended_at: block.ended_at ?? null,
    duration_seconds: block.duration_seconds ?? demoDurationSeconds(block.started_at, block.ended_at ?? null),
    category_id: block.category_id ?? block.category ?? null,
    task_name: block.task_name ?? null,
    category: block.category ?? null,
    hashtags: Array.isArray(block.hashtags) ? block.hashtags : [],
    notes: block.notes ?? null,
    mood: block.mood ?? null,
    effort_level: block.effort_level ?? null,
    satisfaction: block.satisfaction ?? null,
    avoidance_marker: block.avoidance_marker === true || Boolean(insight?.avoidance_signals.length),
    hyperfocus_marker: block.hyperfocus_marker === true || Boolean(insight?.hyperfocus_signals.length),
    guilt_marker:
      block.guilt_marker === true ||
      insight?.emotional_tone === "self-critical" ||
      Boolean(insight?.uncertainty_signals.length),
    novelty_marker: block.novelty_marker === true,
    agent_metadata: block.agent_metadata ?? {},
    created_at: block.created_at ?? now,
    updated_at: block.updated_at ?? now,
  }
}

function normalizeMessage(message: Partial<DemoStoredMessage>): DemoStoredMessage | null {
  if (!message.id || (message.role !== "user" && message.role !== "assistant")) return null
  const text = typeof message.text === "string" ? message.text : ""
  if (!text.trim()) return null

  return {
    id: message.id,
    role: message.role,
    text,
    message_type: message.message_type ?? "chat",
    related_time_block_id: message.related_time_block_id ?? null,
    metadata: message.metadata ?? {},
    created_at: message.created_at ?? new Date().toISOString(),
  }
}

function insightForBlock(block: DemoStoredBlock): TimeBlockInsight | null {
  const derived = deriveInsightFromNotes(block.notes)
  if (!derived) return null

  return {
    id: `demo-insight-${block.id}`,
    time_block_id: block.id,
    note_version_id: null,
    user_id: "demo",
    source_notes: block.notes?.trim() || null,
    created_at: block.updated_at,
    ...derived,
    evidence_claims: attachEvidenceSourceId(derived.evidence_claims, block.id),
  }
}

export function demoChatInsightForMessage(
  message: DemoStoredMessage,
  scope: "general" | "time_block" = message.related_time_block_id ? "time_block" : "general",
): CompanionMessageInsight | null {
  if (message.role !== "user") return null
  const derived = deriveChatInsightFromMessage(message.text)
  if (!derived) return null

  return {
    id: `demo-chat-insight-${message.id}`,
    user_id: "demo",
    message_id: message.id,
    conversation_id: scope === "time_block" && message.related_time_block_id
      ? `demo-block-thread-${message.related_time_block_id}`
      : "demo-general",
    related_time_block_id: message.related_time_block_id,
    scope,
    created_at: message.created_at,
    ...derived,
    evidence_claims: attachEvidenceSourceId(derived.evidence_claims, message.id),
  }
}

export function upsertDemoChatInsight(
  insights: CompanionMessageInsight[],
  message: DemoStoredMessage,
  scope?: "general" | "time_block",
) {
  const insight = demoChatInsightForMessage(message, scope)
  const rest = insights.filter((item) => item.message_id !== message.id)
  return insight ? [insight, ...rest] : rest
}

function migrateSession(parsed: LegacyDemoSession): DemoStoredSession | null {
  if (typeof parsed.name !== "string") return null

  const blocks = (Array.isArray(parsed.blocks) ? parsed.blocks : [])
    .map(normalizeBlock)
    .filter((block): block is DemoStoredBlock => Boolean(block))

  const blockThreads = Object.fromEntries(
    Object.entries(parsed.block_threads ?? {}).map(([blockId, messages]) => [
      blockId,
      messages.map(normalizeMessage).filter((message): message is DemoStoredMessage => Boolean(message)),
    ]),
  )
  const messages = (Array.isArray(parsed.messages) ? parsed.messages : [])
    .map(normalizeMessage)
    .filter((message): message is DemoStoredMessage => Boolean(message))
  const migratedChatInsights = [
    ...messages.map((message) => demoChatInsightForMessage(message, "general")),
    ...Object.entries(blockThreads).flatMap(([blockId, thread]) =>
      thread.map((message) =>
        demoChatInsightForMessage(
          { ...message, related_time_block_id: message.related_time_block_id ?? blockId },
          "time_block",
        ),
      ),
    ),
  ].filter((insight): insight is CompanionMessageInsight => Boolean(insight))

  const customCategories = Array.from(new Set(blocks.map((block) => block.category).filter(Boolean)))
    .filter((slug): slug is string => !DEMO_DEFAULT_CATEGORIES.some((item) => item.slug === slug))
    .map((slug) => ({
      id: slug,
      user_id: "demo",
      slug,
      name: slug.replace(/_/g, " "),
      color: defaultCategoryColor(slug),
      is_default: false,
      created_at: "",
      updated_at: "",
    }))

  return {
    version: DEMO_SESSION_VERSION,
    name: parsed.name,
    active_timer: parsed.active_timer?.started_at
      ? {
          user_id: "demo",
          started_at: parsed.active_timer.started_at,
          created_at: parsed.active_timer.started_at,
          resumed_block: parsed.active_timer.resumed_block
            ? normalizeBlock(parsed.active_timer.resumed_block) ?? undefined
            : undefined,
        }
      : null,
    blocks,
    categories: [...DEMO_DEFAULT_CATEGORIES, ...customCategories],
    messages,
    block_threads: blockThreads,
    pending_draft: null,
    insights: blocks.map(insightForBlock).filter((insight): insight is TimeBlockInsight => Boolean(insight)),
    chat_insights: Array.isArray(parsed.chat_insights)
      ? parsed.chat_insights.map((insight) => ({
          ...insight,
          evidence_claims: attachEvidenceSourceId(insight.evidence_claims ?? [], insight.message_id),
        }))
      : migratedChatInsights,
    custom_dashboard: parsed.custom_dashboard ?? null,
    ai_usage: {
      ...createDemoAiUsage(),
      ...(parsed.ai_usage ?? {}),
      token_limit: parsed.ai_usage?.token_limit ?? createDemoAiUsage().token_limit,
      tokens_used: Math.max(0, parsed.ai_usage?.tokens_used ?? 0),
      updated_at: parsed.ai_usage?.updated_at ?? new Date().toISOString(),
    },
    ai_settings: {
      ...createDemoAiSettings(),
      ...(parsed.ai_settings ?? {}),
    },
    updated_at: parsed.updated_at ?? new Date().toISOString(),
  }
}

export function readDemoSession(): DemoStoredSession | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY)
    if (!raw) return null

    return migrateSession(JSON.parse(raw) as LegacyDemoSession)
  } catch {
    return null
  }
}

export function writeDemoSession(session: DemoStoredSession): void {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    DEMO_SESSION_STORAGE_KEY,
    JSON.stringify({
      ...session,
      updated_at: new Date().toISOString(),
    }),
  )
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return

  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY)
}

export function demoBlockToTimeBlock(block: DemoStoredBlock): TimeBlock {
  return {
    id: block.id,
    user_id: "demo",
    started_at: block.started_at,
    ended_at: block.ended_at,
    duration_seconds: block.duration_seconds ?? demoDurationSeconds(block.started_at, block.ended_at),
    category_id: block.category_id,
    task_name: block.task_name,
    category: block.category,
    hashtags: block.hashtags,
    notes: block.notes,
    mood: block.mood,
    effort_level: block.effort_level,
    satisfaction: block.satisfaction,
    avoidance_marker: block.avoidance_marker,
    hyperfocus_marker: block.hyperfocus_marker,
    guilt_marker: block.guilt_marker,
    novelty_marker: block.novelty_marker,
    agent_metadata: block.agent_metadata,
    created_at: block.created_at,
    updated_at: block.updated_at,
  }
}

export function upsertDemoBlock(session: DemoStoredSession, block: DemoStoredBlock): DemoStoredSession {
  return {
    ...session,
    blocks: [block, ...session.blocks.filter((item) => item.id !== block.id)],
    insights: upsertDemoInsight(session.insights, block),
  }
}

export function upsertDemoInsight(insights: TimeBlockInsight[], block: DemoStoredBlock, insight?: TimeBlockInsight | null) {
  const nextInsight = insight ?? insightForBlock(block)
  const rest = insights.filter((item) => item.time_block_id !== block.id)
  return nextInsight ? [nextInsight, ...rest] : rest
}

export function makeDemoMessage(
  role: DemoStoredMessage["role"],
  text: string,
  options: Partial<Pick<DemoStoredMessage, "message_type" | "related_time_block_id" | "metadata">> = {},
): DemoStoredMessage {
  return {
    id: newId(role),
    role,
    text,
    message_type: options.message_type ?? "chat",
    related_time_block_id: options.related_time_block_id ?? null,
    metadata: options.metadata ?? {},
    created_at: new Date().toISOString(),
  }
}
