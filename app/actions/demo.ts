"use server"

import { generateText, Output } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"
import { companionModelId, extractJSON, fastModelId } from "@/lib/ai"
import {
  categoryTextForDraft,
  deriveWindow,
  getDayRange,
  resolveCategory,
  type CompanionDraft,
} from "@/lib/block-draft-utils"
import { alibiCompanionGuide } from "@/lib/companion-voice"
import {
  DEMO_COMPANION_MIN_TOKENS,
  DEMO_INSIGHT_MIN_TOKENS,
  estimateTokensFromText,
  estimateTokensFromValue,
  remainingDemoTokens,
  type DemoAiUsage,
} from "@/lib/demo-token-budget"
import { formatInsightForPrompt } from "@/lib/note-insights"
import type { DemoAiSettings } from "@/lib/demo-storage"
import type {
  CompanionMessageType,
  EffortLevel,
  Mood,
  Satisfaction,
  TimeBlock,
  TimeBlockInsight,
} from "@/lib/types"

const MOODS = ["joyful", "neutral", "flat", "anxious", "guilty", "proud"] as const satisfies readonly Mood[]
const EFFORT_LEVELS = ["easy", "medium", "hard", "grind"] as const satisfies readonly EffortLevel[]
const SATISFACTION_LEVELS = ["satisfied", "mixed", "frustrated", "unclear"] as const satisfies readonly Satisfaction[]

const draftSchema = z.object({
  task_name: z.string().nullable(),
  category: z.string().nullable(),
  hashtags: z.array(z.string()),
  notes: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  mood: z.enum(MOODS).nullable(),
  effort_level: z.enum(EFFORT_LEVELS).nullable(),
  satisfaction: z.enum(SATISFACTION_LEVELS).nullable(),
  avoidance_marker: z.boolean(),
  hyperfocus_marker: z.boolean(),
  guilt_marker: z.boolean(),
  novelty_marker: z.boolean(),
})

const routerSchema = draftSchema.extend({
  intent: z.enum(["companion_chat", "log_block", "start_timer", "stop_timer", "analyse_blocks", "clarify"]),
})

type RouterOutput = z.infer<typeof routerSchema>

const noteInsightSchema = z.object({
  actions: z.array(z.string()).default([]),
  emotional_tone: z.string().nullable().default(null),
  friction_points: z.array(z.string()).default([]),
  avoidance_signals: z.array(z.string()).default([]),
  hyperfocus_signals: z.array(z.string()).default([]),
  satisfaction_signals: z.array(z.string()).default([]),
  uncertainty_signals: z.array(z.string()).default([]),
  people: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  evidence_excerpt: z.string().nullable().default(null),
})

type DemoModels = ReturnType<typeof resolveDemoModels>
type ModelRole = "fast" | "companion"

export type DemoCompanionOperation =
  | { type: "start_timer" }
  | { type: "stop_timer"; draft: CompanionDraft }
  | {
      type: "save_block"
      block: Omit<TimeBlock, "id" | "user_id" | "created_at" | "updated_at" | "duration_seconds">
    }

export interface DemoCompanionRequest {
  text: string
  session: {
    blocks: TimeBlock[]
    active_timer: { started_at: string } | null
    messages: Array<{ role: "user" | "assistant"; text: string; created_at: string }>
    block_threads: Record<string, Array<{ role: "user" | "assistant"; text: string; created_at: string }>>
    pending_draft: CompanionDraft | null
    insights: TimeBlockInsight[]
  }
  thread: { kind: "general" } | { kind: "time_block"; relatedBlockId: string }
  timezone?: string | null
  aiUsage: DemoAiUsage
  aiSettings: DemoAiSettings
}

export interface DemoCompanionResult {
  message: string
  messageType: CompanionMessageType
  operation: DemoCompanionOperation | null
  pendingDraft: CompanionDraft | null
  tokenCost: number
}

export type DemoInsightResult =
  | {
      type: "generated"
      insight: TimeBlockInsight
      tokenCost: number
    }
  | {
      type: "skipped"
      reason: "budget_exhausted" | "empty_notes"
      tokenCost: 0
    }

function emptyDraft(): CompanionDraft {
  return {
    task_name: null,
    category: null,
    hashtags: [],
    notes: null,
    started_at: null,
    ended_at: null,
    duration_minutes: null,
    mood: null,
    effort_level: null,
    satisfaction: null,
    avoidance_marker: false,
    hyperfocus_marker: false,
    guilt_marker: false,
    novelty_marker: false,
  }
}

function cleanModelId(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && /^[a-zA-Z0-9._:/-]{3,120}$/.test(trimmed) ? trimmed : fallback
}

function cleanBaseUrl(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  if (!trimmed) return fallback

  try {
    const url = new URL(trimmed)
    return url.toString().replace(/\/$/, "")
  } catch {
    return fallback
  }
}

function resolveDemoModels(settings: DemoAiSettings | null | undefined) {
  const userKey = settings?.api_key?.trim() ?? ""
  const provider = settings?.provider === "anthropic" ? "anthropic" : "openai_compatible"
  const apiKey = userKey
    ? userKey
    : provider === "anthropic"
      ? process.env.ANTHROPIC_DEMO_API_KEY || process.env.ANTHROPIC_API_KEY || ""
      : process.env.OPENROUTER_DEMO_API_KEY || process.env.OPENROUTER_API_KEY || ""
  const openAiBaseURL = cleanBaseUrl(settings?.base_url, "https://openrouter.ai/api/v1")
  const anthropicBaseURL = cleanBaseUrl(settings?.base_url, "https://api.anthropic.com/v1")
  const openAiProvider = createOpenAICompatible({
    name: userKey ? "user-demo-openai-compatible" : "hosted-demo-openai-compatible",
    baseURL: openAiBaseURL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const fast = cleanModelId(
    settings?.fast_model,
    process.env.OPENROUTER_DEMO_FAST_MODEL || (provider === "anthropic" ? "claude-3-5-haiku-latest" : fastModelId),
  )
  const companion = cleanModelId(
    settings?.companion_model,
    process.env.OPENROUTER_DEMO_COMPANION_MODEL || (provider === "anthropic" ? "claude-haiku-4-5" : companionModelId),
  )

  return {
    provider,
    openAiProvider,
    baseURL: provider === "anthropic" ? anthropicBaseURL : openAiBaseURL,
    fastModelId: fast,
    companionModelId: companion,
    hasApiKey: Boolean(apiKey),
    usesUserKey: Boolean(userKey),
    apiKey,
  }
}

function modelIdForRole(models: DemoModels, role: ModelRole) {
  return role === "fast" ? models.fastModelId : models.companionModelId
}

function openAiModelForRole(models: DemoModels, role: ModelRole) {
  return models.openAiProvider(modelIdForRole(models, role))
}

async function generateAnthropicText({
  models,
  role,
  system,
  prompt,
  maxTokens = 900,
}: {
  models: DemoModels
  role: ModelRole
  system?: string
  prompt: string
  maxTokens?: number
}) {
  const response = await fetch(`${models.baseURL}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": models.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelIdForRole(models, role),
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`anthropic request failed: ${response.status}`)
  }

  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  return (
    body.content
      ?.map((part) => (part.type === "text" || !part.type ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim() || ""
  )
}

async function generateDemoText({
  models,
  role,
  system,
  prompt,
  maxTokens,
}: {
  models: DemoModels
  role: ModelRole
  system?: string
  prompt: string
  maxTokens?: number
}) {
  if (models.provider === "anthropic") {
    return generateAnthropicText({ models, role, system, prompt, maxTokens })
  }

  const { text } = await generateText({
    model: openAiModelForRole(models, role),
    ...(system ? { system } : {}),
    prompt,
  })
  return text
}

async function generateDemoObject<T extends z.ZodTypeAny>({
  models,
  role,
  schema,
  system,
  prompt,
}: {
  models: DemoModels
  role: ModelRole
  schema: T
  system?: string
  prompt: string
}): Promise<z.infer<T>> {
  if (models.provider !== "anthropic") {
    const { output } = await generateText({
      model: openAiModelForRole(models, role),
      output: Output.object({ schema }),
      ...(system ? { system } : {}),
      prompt,
    })
    return output
  }

  const text = await generateAnthropicText({
    models,
    role,
    system: [
      system ?? "",
      "Return exactly one valid JSON object. Do not wrap it in markdown.",
    ]
      .filter(Boolean)
      .join("\n"),
    prompt,
    maxTokens: 1200,
  })
  const parsed = extractJSON(text)
  return schema.parse(parsed)
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function cleanIso(value: unknown) {
  if (typeof value !== "string") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function cleanCategory(value: unknown) {
  const cleaned = cleanString(value)
  if (!cleaned) return null
  return cleaned
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
}

function cleanMood(value: unknown): Mood | null {
  return typeof value === "string" && (MOODS as readonly string[]).includes(value) ? (value as Mood) : null
}

function cleanEffort(value: unknown): EffortLevel | null {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value)
    ? (value as EffortLevel)
    : null
}

function cleanSatisfaction(value: unknown): Satisfaction | null {
  return typeof value === "string" && (SATISFACTION_LEVELS as readonly string[]).includes(value)
    ? (value as Satisfaction)
    : null
}

function normalizeOutput(parsed: Partial<RouterOutput> | null, fallbackText: string): RouterOutput {
  return {
    intent: parsed?.intent ?? "companion_chat",
    task_name: cleanString(parsed?.task_name) ?? (parsed ? null : fallbackText),
    category: cleanCategory(parsed?.category),
    hashtags: Array.isArray(parsed?.hashtags)
      ? parsed.hashtags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean).slice(0, 8)
      : [],
    notes: cleanString(parsed?.notes),
    started_at: cleanIso(parsed?.started_at),
    ended_at: cleanIso(parsed?.ended_at),
    duration_minutes:
      typeof parsed?.duration_minutes === "number" && parsed.duration_minutes > 0
        ? Math.round(parsed.duration_minutes)
        : null,
    mood: cleanMood(parsed?.mood),
    effort_level: cleanEffort(parsed?.effort_level),
    satisfaction: cleanSatisfaction(parsed?.satisfaction),
    avoidance_marker: parsed?.avoidance_marker === true,
    hyperfocus_marker: parsed?.hyperfocus_marker === true,
    guilt_marker: parsed?.guilt_marker === true,
    novelty_marker: parsed?.novelty_marker === true,
  }
}

function mergeDraft(base: CompanionDraft | null | undefined, next: CompanionDraft): CompanionDraft {
  return {
    task_name: next.task_name ?? base?.task_name ?? null,
    category: next.category ?? base?.category ?? null,
    hashtags: next.hashtags.length > 0 ? next.hashtags : (base?.hashtags ?? []),
    notes: next.notes ?? base?.notes ?? null,
    started_at: next.started_at ?? base?.started_at ?? null,
    ended_at: next.ended_at ?? base?.ended_at ?? null,
    duration_minutes: next.duration_minutes ?? base?.duration_minutes ?? null,
    mood: next.mood ?? base?.mood ?? null,
    effort_level: next.effort_level ?? base?.effort_level ?? null,
    satisfaction: next.satisfaction ?? base?.satisfaction ?? null,
    avoidance_marker: next.avoidance_marker || base?.avoidance_marker === true,
    hyperfocus_marker: next.hyperfocus_marker || base?.hyperfocus_marker === true,
    guilt_marker: next.guilt_marker || base?.guilt_marker === true,
    novelty_marker: next.novelty_marker || base?.novelty_marker === true,
  }
}

function formatMessage(message: { role: string; text: string; created_at: string }) {
  return `${message.role}: ${message.text} (${message.created_at})`
}

function formatBlock(block: TimeBlock) {
  const duration = block.duration_seconds ? `${Math.round(block.duration_seconds / 60)} min` : "duration unknown"
  return `- ${block.task_name ?? "unnamed block"} | ${block.category ?? "uncategorized"} | ${duration} | ${block.started_at} | note: ${block.notes ?? "(none)"}`
}

function clarificationQuestion(draft: CompanionDraft) {
  if (!deriveWindow(draft)) return "what time was that, or about how long did it take?"
  if (!draft.task_name?.trim()) return "what should i call that block?"
  if (!resolveCategory(draft).category) return "what category should i file it under?"
  return "what else should i add before i log it?"
}

async function routeMessage(input: DemoCompanionRequest, recentMessages: DemoCompanionRequest["session"]["messages"], models: DemoModels) {
  try {
    const output = await generateDemoObject({
      models,
      role: "fast",
      schema: routerSchema,
      prompt: [
        "Classify this Alibi demo message and extract structured time-block data.",
        "Valid intents: companion_chat, log_block, start_timer, stop_timer, analyse_blocks, clarify.",
        "Use companion_chat for ordinary conversation, emotional check-ins, uncertainty, venting, or anything not clearly asking to save completed work.",
        "Use log_block only when the user is recording completed work.",
        "Do not invent a time window.",
        "Resolve relative dates and times against now and the user's timezone.",
        `Current timestamp: ${new Date().toISOString()}`,
        `User timezone: ${input.timezone || "unknown"}`,
        `Prior draft: ${JSON.stringify(input.session.pending_draft ?? null)}`,
        "Recent messages:",
        recentMessages.map(formatMessage).join("\n") || "(none)",
        `User message: ${input.text}`,
      ].join("\n"),
    })

    return normalizeOutput(output, input.text)
  } catch {
    return normalizeOutput(null, input.text)
  }
}

async function writeAck(kind: "logged" | "started" | "stopped", subject: string, models: DemoModels) {
  const fallback = kind === "started" ? "timer running." : kind === "stopped" ? "timer stopped." : "logged."
  try {
    const text = await generateDemoText({
      models,
      role: "fast",
      prompt: [
        "You are Alibi. Write one short lowercase acknowledgment.",
        "Rules: 2 to 5 words, end with a period, no emojis, no exclamation marks, no praise.",
        `Action: ${kind}`,
        `Subject: ${subject}`,
      ].join("\n"),
    })
    const cleaned = text.trim().replace(/^["']|["']$/g, "").toLowerCase()
    return cleaned && cleaned.length <= 48 ? cleaned : fallback
  } catch {
    return fallback
  }
}

async function companionChat(input: DemoCompanionRequest, models: DemoModels) {
  const today = getDayRange()
  const todayBlocks = input.session.blocks.filter(
    (block) => block.ended_at && block.started_at >= today.start && block.started_at < today.end,
  )

  try {
    const text = await generateDemoText({
      models,
      role: "companion",
      system: [
        "You are Alibi: a conversational witness for a local browser-only demo workspace.",
        alibiCompanionGuide,
        "Do not behave like a form or parser.",
        "Do not ask for exact time or duration unless the user is clearly trying to log completed work.",
        "Use saved demo time blocks only as context.",
        "Stay under 70 words.",
      ].join("\n"),
      prompt: [
        `User message: ${input.text}`,
        "Recent visible messages:",
        input.session.messages.slice(-8).map(formatMessage).join("\n") || "(none)",
        "Saved demo time_blocks today:",
        todayBlocks.map(formatBlock).join("\n") || "(none)",
      ].join("\n"),
    })
    return text.trim() || "i'm here. tell me the shape of it."
  } catch {
    return "i'm here. tell me the shape of it."
  }
}

async function analyseBlocks(input: DemoCompanionRequest, models: DemoModels) {
  const context = input.session.blocks.length
    ? input.session.blocks
        .slice(0, 40)
        .map((block) => {
          const insight = input.session.insights.find((item) => item.time_block_id === block.id)
          return `${formatBlock(block)}${insight ? `\n  note-derived insight: ${formatInsightForPrompt(insight)}` : ""}`
        })
        .join("\n")
    : "(no saved demo time blocks)"

  try {
    const text = await generateDemoText({
      models,
      role: "companion",
      system: [
        "You are Alibi: the friend who remembers the user's day so they don't have to defend it to themselves.",
        alibiCompanionGuide,
        "Answer using only the provided local demo context.",
        "Use evidence in this order: notes, metadata, note-derived insights, chat.",
        "Stay under 90 words. Do not give productivity advice.",
      ].join("\n"),
      prompt: [`User asked: ${input.text}`, "Saved demo blocks:", context].join("\n"),
    })
    return text.trim() || "nothing on the record yet."
  } catch {
    return input.session.blocks.length
      ? `on the record: ${input.session.blocks.map((block) => block.task_name ?? "unnamed block").slice(0, 5).join(", ")}.`
      : "nothing on the record yet."
  }
}

async function blockChat(input: DemoCompanionRequest, block: TimeBlock, models: DemoModels) {
  const messages = input.session.block_threads[block.id] ?? []
  try {
    const text = await generateDemoText({
      models,
      role: "companion",
      system: [
        "You are Alibi: a reflective companion for one saved local demo time block.",
        alibiCompanionGuide,
        "This thread is only about the fixed block context provided below.",
        "Do not edit the block, create blocks, operate timers, or claim stored data changed.",
        "Treat the block note as the strongest evidence. Stay under 90 words.",
      ].join("\n"),
      prompt: [
        `User message: ${input.text}`,
        "Fixed time block context:",
        formatBlock(block),
        "Thread messages:",
        messages.slice(-8).map(formatMessage).join("\n") || "(none)",
      ].join("\n"),
    })
    return text.trim() || "that block has more texture than it first looks."
  } catch {
    return "that block has more texture than it first looks."
  }
}

export async function processDemoCompanionMessage(input: DemoCompanionRequest): Promise<DemoCompanionResult> {
  const trimmed = input.text.trim().slice(0, 1200)
  if (!trimmed) {
    return { message: "say something.", messageType: "error", operation: null, pendingDraft: input.session.pending_draft, tokenCost: 0 }
  }
  const models = resolveDemoModels(input.aiSettings)
  if (!models.hasApiKey) {
    return {
      message: "demo ai is not configured yet.",
      messageType: "error",
      operation: null,
      pendingDraft: input.session.pending_draft,
      tokenCost: 0,
    }
  }

  const requestEstimate =
    estimateTokensFromValue({
      text: trimmed,
      session: input.session,
      thread: input.thread,
    }) + DEMO_COMPANION_MIN_TOKENS
  const chargeHostedBudget = !models.usesUserKey

  if (chargeHostedBudget && remainingDemoTokens(input.aiUsage) < requestEstimate) {
    return {
      message: "this demo session has used its companion budget. local tracking still works.",
      messageType: "error",
      operation: null,
      pendingDraft: input.session.pending_draft,
      tokenCost: 0,
    }
  }

  input = { ...input, text: trimmed }
  const thread = input.thread

  if (thread.kind === "time_block") {
    const block = input.session.blocks.find((item) => item.id === thread.relatedBlockId)
    const message = block ? await blockChat(input, block, models) : "i can't find that demo block anymore."
    return {
      message,
      messageType: block ? "chat" : "error",
      operation: null,
      pendingDraft: input.session.pending_draft,
      tokenCost: chargeHostedBudget && block ? requestEstimate + estimateTokensFromText(message) : 0,
    }
  }

  const routed = await routeMessage(input, input.session.messages.slice(-8), models)
  const mergedDraft = mergeDraft(input.session.pending_draft, routed)

  if (routed.intent === "start_timer") {
    const ack = input.session.active_timer ? "timer already running." : await writeAck("started", "timer", models)
    return {
      message: ack,
      messageType: "ack",
      operation: input.session.active_timer ? null : { type: "start_timer" },
      pendingDraft: null,
      tokenCost: chargeHostedBudget ? requestEstimate + estimateTokensFromText(ack) : 0,
    }
  }

  if (routed.intent === "stop_timer") {
    if (!input.session.active_timer) {
      return {
        message: "no timer is running.",
        messageType: "error",
        operation: null,
        pendingDraft: mergedDraft,
        tokenCost: chargeHostedBudget ? requestEstimate : 0,
      }
    }
    const ack = await writeAck("stopped", mergedDraft.task_name ?? "timer", models)
    return {
      message: ack,
      messageType: "ack",
      operation: { type: "stop_timer", draft: mergedDraft },
      pendingDraft: null,
      tokenCost: chargeHostedBudget ? requestEstimate + estimateTokensFromText(ack) : 0,
    }
  }

  if (routed.intent === "analyse_blocks") {
    const message = await analyseBlocks(input, models)
    return {
      message,
      messageType: "analysis",
      operation: null,
      pendingDraft: mergedDraft,
      tokenCost: chargeHostedBudget ? requestEstimate + estimateTokensFromText(message) : 0,
    }
  }

  const looksLikeLog = ["log_block", "clarify"].includes(routed.intent) || Boolean(input.session.pending_draft)
  if (!looksLikeLog) {
    const message = await companionChat(input, models)
    return {
      message,
      messageType: "chat",
      operation: null,
      pendingDraft: input.session.pending_draft,
      tokenCost: chargeHostedBudget ? requestEstimate + estimateTokensFromText(message) : 0,
    }
  }

  const window = deriveWindow(mergedDraft)
  const category = resolveCategory(mergedDraft).category

  if (!window || !mergedDraft.task_name?.trim() || !category) {
    return {
      message: clarificationQuestion(mergedDraft),
      messageType: "clarification",
      operation: null,
      pendingDraft: mergedDraft,
      tokenCost: chargeHostedBudget ? requestEstimate : 0,
    }
  }

  const block = {
    started_at: window.startedAt,
    ended_at: window.endedAt,
    category_id: category,
    task_name: mergedDraft.task_name.trim(),
    category,
    hashtags: mergedDraft.hashtags,
    notes: mergedDraft.notes || categoryTextForDraft(mergedDraft) || null,
    mood: mergedDraft.mood,
    effort_level: mergedDraft.effort_level,
    satisfaction: mergedDraft.satisfaction,
    avoidance_marker: mergedDraft.avoidance_marker,
    hyperfocus_marker: mergedDraft.hyperfocus_marker,
    guilt_marker: mergedDraft.guilt_marker,
    novelty_marker: mergedDraft.novelty_marker,
    agent_metadata: { source: "demo_companion" },
  }
  const ack = await writeAck("logged", block.task_name, models)

  return {
    message: ack,
    messageType: "ack",
    operation: { type: "save_block", block },
    pendingDraft: null,
    tokenCost: chargeHostedBudget ? requestEstimate + estimateTokensFromText(ack) : 0,
  }
}

export async function generateDemoBlockInsight(
  block: TimeBlock,
  aiUsage: DemoAiUsage,
  aiSettings: DemoAiSettings,
): Promise<DemoInsightResult> {
  if (!block.notes?.trim()) {
    return { type: "skipped", reason: "empty_notes", tokenCost: 0 }
  }
  const models = resolveDemoModels(aiSettings)
  if (!models.hasApiKey) {
    return { type: "skipped", reason: "empty_notes", tokenCost: 0 }
  }

  const requestEstimate = estimateTokensFromValue(block) + DEMO_INSIGHT_MIN_TOKENS
  const chargeHostedBudget = !models.usesUserKey
  if (chargeHostedBudget && remainingDemoTokens(aiUsage) < requestEstimate) {
    return { type: "skipped", reason: "budget_exhausted", tokenCost: 0 }
  }

  try {
    const output = await generateDemoObject({
      models,
      role: "companion",
      schema: noteInsightSchema,
      system: [
        "Extract a grounded note insight for one saved Alibi time block.",
        alibiCompanionGuide,
        "Return structured evidence only. Do not infer beyond the note.",
        "Use short lowercase phrases. Empty arrays are fine.",
        "The evidence_excerpt must be a short excerpt or paraphrase from the note.",
      ].join("\n"),
      prompt: [
        `task: ${block.task_name ?? "unnamed block"}`,
        `category: ${block.category ?? "uncategorized"}`,
        `started_at: ${block.started_at}`,
        `ended_at: ${block.ended_at ?? "unknown"}`,
        "note:",
        block.notes.slice(0, 3000),
      ].join("\n"),
    })
    const insight: TimeBlockInsight = {
      id: `demo-insight-${block.id}`,
      time_block_id: block.id,
      note_version_id: null,
      user_id: "demo",
      source: "notes",
      source_notes: block.notes?.trim() || null,
      actions: output.actions.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      emotional_tone: output.emotional_tone?.trim() || null,
      friction_points: output.friction_points.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      avoidance_signals: output.avoidance_signals.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      hyperfocus_signals: output.hyperfocus_signals.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      satisfaction_signals: output.satisfaction_signals.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      uncertainty_signals: output.uncertainty_signals.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      people: output.people.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      projects: output.projects.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      themes: output.themes.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      evidence_excerpt: output.evidence_excerpt?.trim().slice(0, 220) || null,
      model_version: models.companionModelId,
      created_at: new Date().toISOString(),
    }
    return {
      type: "generated",
      insight,
      tokenCost: chargeHostedBudget ? requestEstimate + estimateTokensFromValue(insight) : 0,
    }
  } catch {
    return { type: "skipped", reason: "empty_notes", tokenCost: 0 }
  }
}
