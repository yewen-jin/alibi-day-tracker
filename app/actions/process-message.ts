"use server";

import { after } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { anthropicCacheOptions, companionModelId } from "@/lib/ai";
import { resolveAiModelsForUser, type ResolvedAiModels } from "@/lib/ai-settings";
import {
  CATEGORIES,
  categoryTextForDraft,
  deriveWindow,
  inferCategoryFromText,
  resolveCategory,
  slugifyCategoryName,
} from "@/lib/block-draft-utils";
import type {
  CompanionDraft,
  CategoryInference,
} from "@/lib/block-draft-utils";
import { alibiCompanionGuide } from "@/lib/companion-voice";
import { generateCompanionMessageInsightRecord } from "@/lib/chat-insights";
import {
  buildCompanionMemoryContext,
  formatBlockForMemory,
} from "@/lib/memory-context";
import {
  indexMemoryForCompanionMessage,
  indexMemoryForCompanionMessageInsight,
} from "@/lib/rag/indexer";
import {
  retrieveMemoryContext,
  type RetrievedMemoryContext,
} from "@/lib/rag/retriever";
import { createClient } from "@/lib/supabase/server";
import { saveBlock, startTimer, stopTimer } from "./timer";
import type {
  ActiveTimer,
  CompanionConversation,
  CompanionConversationContextSnapshot,
  CompanionMessage,
  CompanionMessageType,
  CompanionThreadState,
  CompanionTimeBlockContext,
  EffortLevel,
  Mood,
  Satisfaction,
  SaveBlockInput,
  StartTimerInput,
  TimeBlock,
  TimeBlockCategory,
} from "@/lib/types";
const MOODS = [
  "joyful",
  "neutral",
  "flat",
  "anxious",
  "guilty",
  "proud",
] as const satisfies readonly Mood[];
const EFFORT_LEVELS = [
  "easy",
  "medium",
  "hard",
  "grind",
] as const satisfies readonly EffortLevel[];
const SATISFACTION_LEVELS = [
  "satisfied",
  "mixed",
  "frustrated",
  "unclear",
] as const satisfies readonly Satisfaction[];

const companionDraftSchema = z.object({
  task_name: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  hashtags: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
  started_at: z.string().nullable().default(null),
  ended_at: z.string().nullable().default(null),
  duration_minutes: z.union([z.number(), z.string()]).nullable().default(null),
  mood: z.enum(MOODS).nullable().default(null),
  effort_level: z.enum(EFFORT_LEVELS).nullable().default(null),
  satisfaction: z.enum(SATISFACTION_LEVELS).nullable().default(null),
  avoidance_marker: z.boolean().default(false),
  hyperfocus_marker: z.boolean().default(false),
  guilt_marker: z.boolean().default(false),
  novelty_marker: z.boolean().default(false),
});

const routerSchema = companionDraftSchema.extend({
  intent: z.enum([
    "companion_chat",
    "log_block",
    "edit_block",
    "start_timer",
    "stop_timer",
    "analyse_blocks",
    "clarify",
  ]),
});

export interface ProcessCompanionMessageInput {
  text: string;
  conversationId?: string | null;
  relatedTimeBlockId?: string | null;
  timezone?: string | null;
}

export type ProcessCompanionMessageResult = (
  | {
      type: "logged";
      ack: string;
      timeBlock: TimeBlock;
    }
  | {
      type: "timer_started";
      ack: string;
      activeTimer: ActiveTimer;
    }
  | {
      type: "timer_already_running";
      ack: string;
      activeTimer: ActiveTimer;
    }
  | {
      type: "timer_stopped";
      ack: string;
      timeBlock: TimeBlock;
    }
  | {
      type: "timer_not_running";
      message: string;
    }
  | {
      type: "analysis";
      message: string;
    }
  | {
      type: "conversation";
      message: string;
    }
  | {
      type: "clarify";
      question: string;
      draft: CompanionDraft;
    }
  | {
      type: "error";
      message: string;
    }
) &
  CompanionThreadState;

type RouterIntent =
  | "companion_chat"
  | "log_block"
  | "edit_block"
  | "start_timer"
  | "stop_timer"
  | "analyse_blocks"
  | "clarify";

interface RouterOutput extends CompanionDraft {
  intent: RouterIntent;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function isMood(value: unknown): value is Mood {
  return (
    typeof value === "string" && (MOODS as readonly string[]).includes(value)
  );
}

function isEffort(value: unknown): value is EffortLevel {
  return (
    typeof value === "string" &&
    (EFFORT_LEVELS as readonly string[]).includes(value)
  );
}

function isSatisfaction(value: unknown): value is Satisfaction {
  return (
    typeof value === "string" &&
    (SATISFACTION_LEVELS as readonly string[]).includes(value)
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function cleanCategory(value: unknown): TimeBlockCategory | null {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return null;
  }

  const slug = slugifyCategoryName(cleaned);
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug) ? slug : null;
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase().replace(/^#+/, ""))
    .filter(Boolean);
}

function cleanIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanDuration(value: unknown): number | null {
  const numeric =
    typeof value === "string" && value.trim()
      ? Number(value.trim())
      : value;

  if (
    typeof numeric !== "number" ||
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return null;
  }

  return Math.round(numeric);
}

function mergeDraft(
  base: CompanionDraft | null | undefined,
  next: CompanionDraft,
): CompanionDraft {
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
    hyperfocus_marker:
      next.hyperfocus_marker || base?.hyperfocus_marker === true,
    guilt_marker: next.guilt_marker || base?.guilt_marker === true,
    novelty_marker: next.novelty_marker || base?.novelty_marker === true,
  };
}

function normalizeDraft(value: unknown): CompanionDraft | null {
  const parsed = companionDraftSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return normalizeRouterOutput({ intent: "log_block", ...parsed.data }, "")
    .draft;
}

function normalizeRouterOutput(
  parsed: Partial<z.infer<typeof routerSchema>> | null,
  fallbackText: string,
): RouterOutput & { draft: CompanionDraft } {
  const intent = parsed?.intent;
  const normalizedIntent: RouterIntent =
    intent === "companion_chat" ||
    intent === "edit_block" ||
    intent === "start_timer" ||
    intent === "stop_timer" ||
    intent === "analyse_blocks" ||
    intent === "clarify" ||
    intent === "log_block"
      ? intent
      : "companion_chat";

  const output: RouterOutput = {
    intent: normalizedIntent,
    task_name: cleanString(parsed?.task_name) ?? (parsed ? null : fallbackText),
    category: cleanCategory(parsed?.category),
    hashtags: cleanTags(parsed?.hashtags),
    notes: cleanString(parsed?.notes),
    started_at: cleanIso(parsed?.started_at),
    ended_at: cleanIso(parsed?.ended_at),
    duration_minutes: cleanDuration(parsed?.duration_minutes),
    mood: isMood(parsed?.mood) ? parsed.mood : null,
    effort_level: isEffort(parsed?.effort_level) ? parsed.effort_level : null,
    satisfaction: isSatisfaction(parsed?.satisfaction)
      ? parsed.satisfaction
      : null,
    avoidance_marker: parsed?.avoidance_marker === true,
    hyperfocus_marker: parsed?.hyperfocus_marker === true,
    guilt_marker: parsed?.guilt_marker === true,
    novelty_marker: parsed?.novelty_marker === true,
  };

  return {
    ...output,
    draft: output,
  };
}

function draftToSaveInput(
  draft: CompanionDraft,
  window: { startedAt: string; endedAt: string },
  category: TimeBlockCategory,
): SaveBlockInput {
  const taskName = draft.task_name?.trim() || "logged work";

  return {
    task_name: taskName,
    category,
    started_at: window.startedAt,
    ended_at: window.endedAt,
    hashtags: draft.hashtags,
    notes: draft.notes,
    mood: draft.mood,
    effort_level: draft.effort_level,
    satisfaction: draft.satisfaction,
    avoidance_marker: draft.avoidance_marker,
    hyperfocus_marker: draft.hyperfocus_marker,
    guilt_marker: draft.guilt_marker,
    novelty_marker: draft.novelty_marker,
  };
}

function draftFromTimeBlock(block: TimeBlock | CompanionTimeBlockContext): CompanionDraft {
  return {
    task_name: block.task_name,
    category: block.category,
    hashtags: block.hashtags ?? [],
    notes: block.notes,
    started_at: block.started_at,
    ended_at: block.ended_at,
    duration_minutes:
      typeof block.duration_seconds === "number"
        ? Math.round(block.duration_seconds / 60)
        : null,
    mood: block.mood,
    effort_level: block.effort_level,
    satisfaction: block.satisfaction,
    avoidance_marker: block.avoidance_marker,
    hyperfocus_marker: block.hyperfocus_marker,
    guilt_marker: block.guilt_marker,
    novelty_marker: block.novelty_marker,
  };
}

function draftHasBlockEdit(draft: CompanionDraft) {
  return Boolean(
    draft.task_name?.trim() ||
      draft.category ||
      draft.hashtags.length > 0 ||
      draft.notes?.trim() ||
      draft.started_at ||
      draft.ended_at ||
      draft.duration_minutes ||
      draft.mood ||
      draft.effort_level ||
      draft.satisfaction ||
      draft.avoidance_marker ||
      draft.hyperfocus_marker ||
      draft.guilt_marker ||
      draft.novelty_marker,
  );
}

function deriveEditWindow(base: CompanionDraft, edit: CompanionDraft) {
  if (edit.duration_minutes && !edit.started_at && !edit.ended_at && base.started_at) {
    const startedAt = new Date(base.started_at);

    if (!Number.isNaN(startedAt.getTime())) {
      return {
        startedAt: startedAt.toISOString(),
        endedAt: new Date(
          startedAt.getTime() + edit.duration_minutes * 60_000,
        ).toISOString(),
      };
    }
  }

  return deriveWindow(mergeDraft(base, edit));
}

function timerStartFromDraft(draft: CompanionDraft) {
  if (draft.started_at && !draft.ended_at) {
    return draft.started_at;
  }

  if (
    draft.duration_minutes &&
    !draft.started_at &&
    !draft.ended_at
  ) {
    return new Date(Date.now() - draft.duration_minutes * 60_000).toISOString();
  }

  return null;
}

function draftToStartTimerInput(
  draft: CompanionDraft,
): StartTimerInput | undefined {
  const startedAt = timerStartFromDraft(draft);
  const category = resolveCategory(draft).category;

  if (
    !startedAt &&
    !draft.task_name?.trim() &&
    !category &&
    draft.hashtags.length === 0 &&
    !draft.notes?.trim() &&
    !draft.mood &&
    !draft.effort_level &&
    !draft.satisfaction &&
    !draft.avoidance_marker &&
    !draft.hyperfocus_marker &&
    !draft.guilt_marker &&
    !draft.novelty_marker
  ) {
    return undefined;
  }

  return {
    started_at: startedAt,
    task_name: draft.task_name,
    category,
    hashtags: draft.hashtags,
    notes: draft.notes,
    mood: draft.mood,
    effort_level: draft.effort_level,
    satisfaction: draft.satisfaction,
    avoidance_marker: draft.avoidance_marker,
    hyperfocus_marker: draft.hyperfocus_marker,
    guilt_marker: draft.guilt_marker,
    novelty_marker: draft.novelty_marker,
  };
}

function snapshotTimeBlock(block: TimeBlock): CompanionTimeBlockContext {
  return {
    id: block.id,
    task_name: block.task_name,
    category: block.category,
    hashtags: block.hashtags ?? [],
    notes: block.notes,
    started_at: block.started_at,
    ended_at: block.ended_at,
    duration_seconds: block.duration_seconds,
    mood: block.mood,
    effort_level: block.effort_level,
    satisfaction: block.satisfaction,
    avoidance_marker: block.avoidance_marker,
    hyperfocus_marker: block.hyperfocus_marker,
    guilt_marker: block.guilt_marker,
    novelty_marker: block.novelty_marker,
  };
}

function formatBlockForPrompt(block: TimeBlock | CompanionTimeBlockContext) {
  return formatBlockForMemory(block);
}

function formatMessageForPrompt(message: CompanionMessage) {
  return `${message.role}: ${message.content}`;
}

function looksLikeLogAttempt(
  text: string,
  routed: RouterOutput,
) {
  if (routed.intent === "log_block") {
    return true;
  }

  if (
    routed.started_at ||
    routed.ended_at ||
    routed.duration_minutes
  ) {
    return true;
  }

  // Strong, unambiguous log verbs only. Words like "did", "spent", "finished",
  // "completed", "add" are too common in casual chat and analysis questions
  // ("how long did i spend?", "what did i do?") to use as fallback signals.
  return /\b(log|logged|record(?:ed)?|save it|save that|save this|worked on)\b/i.test(
    text,
  );
}

function stringifyAiErrorDetail(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return stringifyAiErrorDetail(parsed) ?? trimmed.slice(0, 360);
    } catch {
      return trimmed.slice(0, 360);
    }
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nestedMessage =
      record.message ??
      record.error ??
      (typeof record.error === "object" && record.error
        ? (record.error as Record<string, unknown>).message
        : null);

    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage.trim().slice(0, 360);
    }

    try {
      return JSON.stringify(value).slice(0, 360);
    } catch {
      return null;
    }
  }

  return null;
}

function describeModelFailure(error: unknown, provider: string, modelId: string) {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const status =
    typeof record.statusCode === "number"
      ? `HTTP ${record.statusCode}`
      : typeof record.status === "number"
        ? `HTTP ${record.status}`
        : null;
  const detail =
    stringifyAiErrorDetail(record.responseBody) ??
    stringifyAiErrorDetail(record.data) ??
    stringifyAiErrorDetail(record.cause);
  const message = error instanceof Error ? error.message : "model call failed.";

  return [
    `${provider} companion model failed for ${modelId}`,
    status,
    detail ?? message,
  ].filter(Boolean).join(": ");
}

function lowReasoningProviderOptions(provider: string, modelId: string) {
  const normalized = modelId.toLowerCase();
  const supportsReasoningEffort =
    normalized.includes("gpt-5") ||
    /\bo[134](?:-|$)/.test(normalized) ||
    normalized.includes("/o1") ||
    normalized.includes("/o3") ||
    normalized.includes("/o4");

  const reasoning = supportsReasoningEffort
    ? {
        openaiCompatible: { reasoningEffort: "minimal" },
        [provider]: { reasoningEffort: "minimal" },
      }
    : undefined;

  // Anthropic ephemeral prompt cache. Only applied when targeting the
  // Anthropic provider directly (not OpenRouter). The system block in each
  // companion call carries the cache_control marker via providerOptions.
  const cache = anthropicCacheOptions(provider);

  if (!reasoning && !cache) return undefined;

  return {
    ...(reasoning ?? {}),
    ...(cache ?? {}),
  };
}

function draftHasClarificationInfo(draft: CompanionDraft | null | undefined) {
  if (!draft) {
    return false;
  }

  return Boolean(
    draft.task_name?.trim() ||
      draft.category ||
      draft.hashtags.length > 0 ||
      draft.notes?.trim() ||
      draft.started_at ||
      draft.ended_at ||
      draft.duration_minutes ||
      draft.mood ||
      draft.effort_level ||
      draft.satisfaction ||
      draft.avoidance_marker ||
      draft.hyperfocus_marker ||
      draft.guilt_marker ||
      draft.novelty_marker,
  );
}

function shouldContinuePendingDraft(
  pendingDraft: CompanionDraft | null,
  routed: RouterOutput,
  clarificationDraft: CompanionDraft | null,
) {
  if (!pendingDraft) {
    return false;
  }

  if (routed.intent === "log_block") {
    return true;
  }

  // For "clarify" intent, only continue if the user's reply actually advanced
  // the draft. Otherwise (e.g. they changed the subject, asked a question,
  // pushed back) we should abandon the draft and let chat/analysis handle it
  // instead of asking the same clarification question on repeat.
  return draftHasClarificationInfo(clarificationDraft);
}

async function fetchTimeBlockForUser(
  supabase: Supabase,
  userId: string,
  timeBlockId: string,
) {
  const { data, error } = await supabase
    .from("time_blocks")
    .select("*")
    .eq("user_id", userId)
    .eq("id", timeBlockId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as TimeBlock;
}

async function fetchCompanionMessagesForConversation(
  supabase: Supabase,
  userId: string,
  conversationId: string,
) {
  const { data, error } = await supabase
    .from("companion_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return { type: "error" as const, message: "couldn't load chat history." };
  }

  return {
    type: "loaded" as const,
    messages: (data ?? []) as CompanionMessage[],
  };
}

async function getGeneralConversation(supabase: Supabase, userId: string) {
  const { data: existing } = await supabase
    .from("companion_conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "general")
    .is("related_time_block_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as CompanionConversation;
  }

  const snapshot: CompanionConversationContextSnapshot = { kind: "general" };
  const { data, error } = await supabase
    .from("companion_conversations")
    .insert({
      user_id: userId,
      kind: "general",
      title: "general",
      related_time_block_id: null,
      context_snapshot: snapshot,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("couldn't create companion conversation.");
  }

  return data as CompanionConversation;
}

async function getTimeBlockConversation(
  supabase: Supabase,
  userId: string,
  timeBlockId: string,
) {
  const block = await fetchTimeBlockForUser(supabase, userId, timeBlockId);

  if (!block) {
    return null;
  }

  const { data: existing } = await supabase
    .from("companion_conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "time_block")
    .eq("related_time_block_id", timeBlockId)
    .maybeSingle();

  if (existing) {
    return existing as CompanionConversation;
  }

  const snapshot: CompanionConversationContextSnapshot = {
    kind: "time_block",
    time_block: snapshotTimeBlock(block),
  };
  const title = block.task_name || "time block";
  const { data, error } = await supabase
    .from("companion_conversations")
    .insert({
      user_id: userId,
      kind: "time_block",
      title,
      related_time_block_id: timeBlockId,
      context_snapshot: snapshot,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("couldn't create block companion conversation.");
  }

  return data as CompanionConversation;
}

async function getConversationForInput(
  supabase: Supabase,
  userId: string,
  input: {
    conversationId?: string | null;
    relatedTimeBlockId?: string | null;
  },
) {
  if (input.relatedTimeBlockId) {
    return getTimeBlockConversation(supabase, userId, input.relatedTimeBlockId);
  }

  if (input.conversationId) {
    const { data } = await supabase
      .from("companion_conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("id", input.conversationId)
      .maybeSingle();

    if (data) {
      return data as CompanionConversation;
    }
  }

  return getGeneralConversation(supabase, userId);
}

async function insertCompanionMessage(
  supabase: Supabase,
  userId: string,
  conversation: CompanionConversation,
  values: {
    role: "user" | "assistant";
    content: string;
    messageType?: CompanionMessageType;
    metadata?: Record<string, unknown>;
    model?: string;
  },
) {
  const { data, error } = await supabase
    .from("companion_messages")
    .insert({
      user_id: userId,
      conversation_id: conversation.id,
      role: values.role,
      content: values.content,
      message_type: values.messageType ?? "chat",
      model: values.model ?? companionModelId,
      related_time_block_id: conversation.related_time_block_id,
      metadata: values.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    return { type: "error" as const, message: "couldn't save chat history." };
  }

  await supabase
    .from("companion_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("user_id", userId);

  return { type: "inserted" as const, message: data as CompanionMessage };
}

async function upsertCompanionMessageInsight(
  supabase: Supabase,
  message: CompanionMessage,
  conversation: CompanionConversation,
  models: ResolvedAiModels,
) {
  const insight = await generateCompanionMessageInsightRecord(
    message,
    conversation,
    {
      model: models.fastModel,
      modelVersion: models.fastModelId,
      providerOptions: lowReasoningProviderOptions(
        models.provider,
        models.fastModelId,
      ),
    },
  );

  if (!insight) {
    return;
  }

  const { error } = await supabase.from("companion_message_insights").upsert(
    {
      user_id: insight.user_id,
      message_id: insight.message_id,
      conversation_id: insight.conversation_id,
      related_time_block_id: insight.related_time_block_id,
      scope: insight.scope,
      did_actions: insight.did_actions,
      intended_actions: insight.intended_actions,
      avoided_or_deferred: insight.avoided_or_deferred,
      friction_points: insight.friction_points,
      emotional_signals: insight.emotional_signals,
      useful_drift: insight.useful_drift,
      mismatch_signals: insight.mismatch_signals,
      themes: insight.themes,
      evidence_excerpt: insight.evidence_excerpt,
      evidence_claims: insight.evidence_claims,
      model_version: insight.model_version,
    },
    { onConflict: "message_id" },
  );

  if (error) {
    console.error("failed to upsert companion message insight", {
      messageId: message.id,
      userId: message.user_id,
      error: error.message,
    });
    return;
  }

  await indexMemoryForCompanionMessageInsight(insight).catch((indexError) => {
    console.error("failed to index companion message insight", {
      messageId: message.id,
      userId: message.user_id,
      error: indexError instanceof Error ? indexError.message : String(indexError),
    });
  });
}

async function getPendingDraft(
  supabase: Supabase,
  userId: string,
  conversationId: string,
) {
  const { data, error } = await supabase
    .from("companion_drafts")
    .select("draft, expires_at")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase
      .from("companion_drafts")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("conversation_id", conversationId);
    return null;
  }

  return normalizeDraft(data.draft);
}

async function savePendingDraft(
  supabase: Supabase,
  userId: string,
  conversationId: string,
  draft: CompanionDraft,
) {
  await supabase.from("companion_drafts").upsert({
    user_id: userId,
    conversation_id: conversationId,
    draft,
    status: "pending",
    updated_at: new Date().toISOString(),
    expires_at: null,
  });
}

async function resolvePendingDraft(
  supabase: Supabase,
  userId: string,
  conversationId: string,
) {
  await supabase
    .from("companion_drafts")
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .eq("status", "pending");
}

async function getThreadState(
  supabase: Supabase,
  userId: string,
  conversation: CompanionConversation,
): Promise<CompanionThreadState> {
  const [messagesResult, pendingDraft] = await Promise.all([
    fetchCompanionMessagesForConversation(supabase, userId, conversation.id),
    conversation.kind === "general"
      ? getPendingDraft(supabase, userId, conversation.id)
      : Promise.resolve(null),
  ]);

  return {
    conversation,
    messages: messagesResult.type === "loaded" ? messagesResult.messages : [],
    hasPendingDraft: pendingDraft !== null,
  };
}

async function withThreadState<
  T extends Omit<
    ProcessCompanionMessageResult,
    "conversation" | "messages" | "hasPendingDraft"
  >,
>(
  supabase: Supabase,
  userId: string,
  conversation: CompanionConversation,
  result: T,
): Promise<T & CompanionThreadState> {
  const state = await getThreadState(supabase, userId, conversation);
  return { ...result, ...state };
}

export async function getCompanionThread(input?: {
  relatedTimeBlockId?: string | null;
  conversationId?: string | null;
}): Promise<CompanionThreadState | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  try {
    const conversation = await getConversationForInput(
      supabase,
      user.id,
      input ?? {},
    );
    if (!conversation) {
      return null;
    }
    return getThreadState(supabase, user.id, conversation);
  } catch {
    return null;
  }
}

export async function getCompanionMessages(): Promise<CompanionMessage[]> {
  const thread = await getCompanionThread();
  return thread?.messages ?? [];
}

export async function getCompanionHasPendingDraft(): Promise<boolean> {
  const thread = await getCompanionThread();
  return thread?.hasPendingDraft ?? false;
}

async function routeMessage(
  models: ResolvedAiModels,
  text: string,
  draft: CompanionDraft | null | undefined,
  timezone: string | null | undefined,
  recentMessages: CompanionMessage[],
): Promise<RouterOutput> {
  try {
    const { output } = await generateText({
      model: models.fastModel,
      output: Output.object({ schema: routerSchema }),
      prompt: [
        "Classify this Alibi chat message and extract structured time-block data.",
        "",
        "Valid intents: companion_chat, log_block, edit_block, start_timer, stop_timer, analyse_blocks, clarify.",
        "Use companion_chat for ordinary conversation, emotional check-ins, uncertainty, venting, or anything that is not clearly a request to save completed work.",
        "Use log_block when the user is recording, adding, saving, or logging completed work that happened in the past, as a statement (not a question). Examples: 'log 30 mins of email', 'i did laundry from 2 to 3', 'add a walk this morning'.",
        "Use edit_block when the user is asking to change, correct, rename, retime, recategorize, tag, or update an existing time block.",
        "Use start_timer when they explicitly start a timer, or when ongoing language means the work is still in progress: 'i started X 30 minutes ago', 'i've been doing X for 30 minutes'.",
        "Use stop_timer for explicit timer stop/control.",
        "Use analyse_blocks whenever the user is ASKING A QUESTION about their saved records: what they did, how long they spent, totals, averages, frequencies, patterns, comparisons, or reassurance. This takes priority over log_block. Examples: 'how many hours do i spend on X', 'on average how long do i X', 'what did i work on yesterday', 'how often do i X', 'how much time on screen this week'. Any message ending with a '?' that references their own activity is almost certainly analyse_blocks, not log_block.",
        "Use clarify only when the new message answers a prior clarification but is still incomplete.",
        "",
        "If a 'Prior draft' is provided, the user may be answering an earlier clarification. Extract any new details from the user message that complete the draft (time range, duration, task name, category, mood, etc.) and return them populated. Use the prior draft's existing values implicitly by only filling in what is newly present. If the message is clearly continuing a draft but still incomplete, set intent=clarify.",
        "",
        "Schema:",
        "{",
        '  "intent": "companion_chat" | "log_block" | "edit_block" | "start_timer" | "stop_timer" | "analyse_blocks" | "clarify",',
        '  "task_name": "string | null",',
        '  "category": "category name or slug | null",',
        '  "hashtags": ["strings without #"],',
        '  "notes": "string | null",',
        '  "started_at": "ISO datetime | null",',
        '  "ended_at": "ISO datetime | null",',
        '  "duration_minutes": "number | null",',
        '  "mood": "joyful | neutral | flat | anxious | guilty | proud | null",',
        '  "effort_level": "easy | medium | hard | grind | null",',
        '  "satisfaction": "satisfied | mixed | frustrated | unclear | null",',
        '  "avoidance_marker": "boolean",',
        '  "hyperfocus_marker": "boolean",',
        '  "guilt_marker": "boolean",',
        '  "novelty_marker": "boolean"',
        "}",
        "",
        "Rules:",
        "- Resolve relative dates and times against the current date and timezone.",
        "- Return started_at and ended_at as complete ISO datetimes, never partial clock strings.",
        "- If the user says a range like '2 to 3:30', return both started_at and ended_at.",
        "- If they give a duration only, return duration_minutes.",
        "- If the user semantically says they are still doing the activity, use intent=start_timer with duration_minutes and no ended_at.",
        "- If the user semantically says they completed or are logging finished work, use intent=log_block with duration_minutes and no invented started_at/ended_at; the server will save it as ending now.",
        "- If the user asks to edit a specific or current block, use intent=edit_block and extract only the fields they want changed.",
        "- Apply intent semantics across languages; examples are illustrative, not English trigger phrases.",
        "- Do not invent explicit timestamps.",
        "- Prefer concise task names without filler words like 'worked on'.",
        "- Use an existing/default category when obvious: deep_work, admin, social, errands, care, creative, rest.",
        "- If the user gives a custom category name, return that name.",
        "- Do not turn feelings, questions, or general updates into log_block.",
        "- When unsure whether the user wants to log a block, choose companion_chat.",
        "",
        `Current timestamp: ${new Date().toISOString()}`,
        `User timezone: ${timezone || "unknown"}`,
        `Prior draft, if any: ${JSON.stringify(draft ?? null)}`,
        "Recent visible messages:",
        recentMessages.length
          ? recentMessages.map(formatMessageForPrompt).join("\n")
          : "(none)",
        `User message: ${text}`,
      ].join("\n"),
    });

    return applyRouterSafetyNet(normalizeRouterOutput(output, text), text);
  } catch {
    return normalizeRouterOutput(null, text);
  }
}

// Safety net for the small/fast router model: if the message is unambiguously
// a question about the user's own past activity, force analyse_blocks even
// when the router said log_block or companion_chat. Without this, a question
// like "how many hours did i spend on screen?" can leak into the log-block
// path, where it gets stuck asking "what time was that?" on repeat.
function applyRouterSafetyNet(
  routed: RouterOutput & { draft: CompanionDraft },
  text: string,
): RouterOutput & { draft: CompanionDraft } {
  if (
    routed.intent === "start_timer" ||
    routed.intent === "stop_timer" ||
    routed.intent === "edit_block" ||
    routed.intent === "analyse_blocks"
  ) {
    return routed;
  }

  const endsWithQuestion = /\?\s*$/.test(text);
  const hasAnalysisCue =
    /\b(how (?:many|much|long|often)|on average|per (?:day|week|month)|how do i|what did i|what have i|when did i|when do i|where did i|how (?:much|long) did i|am i|are most of|most of my|patterns?|trend|compare|comparison|usually|typically|every ?day|everyday)\b/i.test(
      text,
    );

  if (endsWithQuestion && hasAnalysisCue) {
    return { ...routed, intent: "analyse_blocks" };
  }

  return routed;
}

async function completeDraftFromClarification(
  models: ResolvedAiModels,
  text: string,
  draft: CompanionDraft,
  timezone: string | null | undefined,
  recentMessages: CompanionMessage[],
): Promise<CompanionDraft> {
  try {
    const { output } = await generateText({
      model: models.fastModel,
      output: Output.object({ schema: companionDraftSchema }),
      prompt: [
        "Complete an existing Alibi time-block draft from the user's latest clarification answer.",
        "The assistant previously asked for missing task, time, duration, category, or notes.",
        "Extract only details present in the user's latest answer. Use null or empty arrays for details not present.",
        "Resolve relative dates and times against the current timestamp and timezone.",
        "Return started_at and ended_at as complete ISO datetimes, never partial clock strings.",
        "If the answer gives only a duration like '2 hours', '90 minutes', or 'half an hour', return duration_minutes.",
        "If the answer gives a time range like '8 to 9', '8pm-9:30pm', or 'last night 8 to 9', return started_at and ended_at.",
        "If am/pm is omitted but the user says night or evening, interpret the time as pm.",
        "Do not invent missing fields.",
        "",
        `Current timestamp: ${new Date().toISOString()}`,
        `User timezone: ${timezone || "unknown"}`,
        `Existing draft: ${JSON.stringify(draft)}`,
        "Recent visible messages:",
        recentMessages.length
          ? recentMessages.map(formatMessageForPrompt).join("\n")
          : "(none)",
        `Latest user answer: ${text}`,
      ].join("\n"),
    });

    return normalizeRouterOutput({ intent: "clarify", ...output }, "").draft;
  } catch {
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
    };
  }
}

async function makeAck(
  models: ResolvedAiModels,
  kind: "logged" | "started" | "stopped",
  subject: string,
) {
  const fallback =
    kind === "started"
      ? "timer running."
      : kind === "stopped"
        ? "timer stopped."
        : "logged.";

  try {
    const { text } = await generateText({
      model: models.fastModel,
      prompt: [
        "You are Alibi. Write one short lowercase acknowledgment.",
        "Rules: 2 to 5 words, end with a period, no emojis, no exclamation marks, no praise.",
        `Action: ${kind}`,
        `Subject: ${subject}`,
      ].join("\n"),
    });
    const cleaned = text
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase();
    return cleaned && cleaned.length <= 48 ? cleaned : fallback;
  } catch {
    return fallback;
  }
}

async function makeSavedBlockReply({
  models,
  action,
  timeBlock,
  userMessage,
}: {
  models: ResolvedAiModels;
  action: "logged" | "stopped";
  timeBlock: TimeBlock;
  userMessage: string;
}) {
  const fallback =
    action === "stopped"
      ? `saved: ${timeBlock.task_name ?? "time block"}.`
      : `logged: ${timeBlock.task_name ?? "time block"}.`;

  try {
    const { text } = await generateText({
      model: models.companionModel,
      providerOptions: lowReasoningProviderOptions(models.provider, models.companionModelId),
      system: [
        "You are Alibi. The time block has already been saved in the database.",
        alibiCompanionGuide,
        "Write a short response that confirms the saved block and reflects one useful detail from the saved record.",
        "Use only the saved time block below and the user's original message.",
        "Do not claim any extra edits, tags, notes, categories, or times beyond the saved row.",
        "Stay under 55 words. Use lowercase. No emojis. No productivity advice.",
      ].join("\n"),
      prompt: [
        `Action: ${action}`,
        `User message: ${userMessage}`,
        "Saved time block:",
        formatBlockForPrompt(timeBlock),
      ].join("\n"),
    });

    const cleaned = text.trim();
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

const analysisSynthSchema = z.object({
  summary: z.string().default(""),
  key_evidence: z.array(z.string()).default([]),
  pattern_hint: z.string().nullable().default(null),
});

function retrievalMetadata(retrieval: RetrievedMemoryContext) {
  return {
    rag: {
      chunk_ids: retrieval.chunks.map((chunk) => chunk.id),
      source_ids: retrieval.sourceSummaries.map((source) => source.sourceId),
      score: retrieval.score,
      date_window: retrieval.dateWindow,
    },
  };
}

async function retrievedCompanionMemory({
  supabase,
  userId,
  message,
  draft,
  recentMessages,
  useCase,
}: {
  supabase: Supabase;
  userId: string;
  message: string;
  draft: CompanionDraft | null | undefined;
  recentMessages: CompanionMessage[];
  useCase: "companion_chat" | "companion_analysis";
}) {
  const fallback = await buildCompanionMemoryContext({
    supabase,
    userId,
    message,
    draft,
    recentMessages,
  });
  const retrieval = await retrieveMemoryContext({
    userId,
    query: message,
    useCase,
    dateRange:
      fallback.range.scope === "today" || fallback.range.scope === "all_history"
        ? undefined
        : fallback.range,
    sourceTypes: [
      "time_block",
      "time_block_insight",
      "companion_message",
      "companion_message_insight",
      "time_block_note_version",
    ],
    limit: useCase === "companion_analysis" ? 14 : 10,
  });
  const evidenceText =
    retrieval.chunks.length > 0
      ? [
          retrieval.promptText,
          "",
          "recent visible messages:",
          fallback.recentMessages.length
            ? fallback.recentMessages
                .map(
                  (msg) =>
                    `- ${new Date(msg.created_at).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })} ${msg.role}: ${msg.content}`,
                )
                .join("\n")
            : "(none)",
        ].join("\n")
      : fallback.evidenceText;

  return { fallback, retrieval, evidenceText };
}

async function analyseBlocks({
  models,
  supabase,
  userId,
  conversation,
  message,
  draft,
  recentMessages,
}: {
  models: ResolvedAiModels;
  supabase: Supabase;
  userId: string;
  conversation: CompanionConversation;
  message: string;
  draft: CompanionDraft | null | undefined;
  recentMessages: CompanionMessage[];
}) {
  const memory = await retrievedCompanionMemory({
    supabase,
    userId,
    message,
    draft,
    recentMessages,
    useCase: "companion_analysis",
  });

  // Two-tier analysis: the fast model digests the (potentially large) memory
  // packet into a compact JSON synthesis; the companion model only rewrites
  // that synthesis into the Alibi voice. This keeps the long evidence cost on
  // the cheap tier and pays companion-tier price only on a small input.
  let synth: z.infer<typeof analysisSynthSchema> | null = null;
  try {
    const { output } = await generateText({
      model: models.fastModel,
      output: Output.object({ schema: analysisSynthSchema }),
      system: [
        "Extract a grounded evidence synthesis from an Alibi memory packet.",
        "Use ONLY the supplied memory context. Do not invent unsaved work.",
        "Evidence priority: time block notes, time block metadata, note-derived insights, linked chat, chat-derived insights, then recent visible chat.",
        "Each key_evidence item must be a short verbatim or near-verbatim excerpt with a date/time reference where possible.",
        "If the record is empty, return empty arrays and an empty summary.",
      ].join("\n"),
      prompt: [
        `User asked: ${message}`,
        `Pending draft, if any: ${JSON.stringify(draft ?? null)}`,
        `Memory range: ${memory.fallback.range.label}`,
        "",
        "Memory context:",
        memory.evidenceText,
      ].join("\n"),
    });
    synth = output;
  } catch {
    synth = null;
  }

  if (!synth || (!synth.summary.trim() && synth.key_evidence.length === 0)) {
    if (memory.fallback.blocks.length === 0 && memory.fallback.chatInsights.length === 0) {
      return {
        text: `nothing on the record for ${memory.fallback.range.label}.`,
        retrieval: memory.retrieval,
      };
    }
  }

  try {
    const { text } = await generateText({
      model: models.companionModel,
      providerOptions: lowReasoningProviderOptions(models.provider, models.companionModelId),
      system: [
        "You are Alibi: the friend who remembers the user's day so they don't have to defend it to themselves.",
        alibiCompanionGuide,
        "Rewrite the supplied synthesis into the Alibi voice. Do not add evidence not present in the synthesis.",
        "Cite the user's own words or dates when the synthesis includes them.",
        "Stay under 90 words. Do not mention entries. Do not invent unsaved work. Do not give productivity advice.",
      ].join("\n"),
      prompt: [
        `User asked: ${message}`,
        `Memory range: ${memory.fallback.range.label}`,
        "",
        "Synthesis (use as the only evidence):",
        JSON.stringify(synth ?? { summary: "", key_evidence: [], pattern_hint: null }),
      ].join("\n"),
    });

    return {
      text: text.trim() || `nothing on the record for ${memory.fallback.range.label}.`,
      retrieval: memory.retrieval,
    };
  } catch {
    if (memory.fallback.blocks.length === 0 && memory.fallback.chatInsights.length === 0) {
      return {
        text: `nothing on the record for ${memory.fallback.range.label}.`,
        retrieval: memory.retrieval,
      };
    }

    return {
      text: `${memory.fallback.range.label} has ${memory.fallback.blocks.length} saved block${
        memory.fallback.blocks.length === 1 ? "" : "s"
      } and ${memory.fallback.chatInsights.length} chat-derived observation${
        memory.fallback.chatInsights.length === 1 ? "" : "s"
      }.`,
      retrieval: memory.retrieval,
    };
  }
}

async function companionChat({
  models,
  supabase,
  userId,
  conversation,
  message,
  draft,
  recentMessages,
}: {
  models: ResolvedAiModels;
  supabase: Supabase;
  userId: string;
  conversation: CompanionConversation;
  message: string;
  draft: CompanionDraft | null | undefined;
  recentMessages: CompanionMessage[];
}) {
  const memory = await retrievedCompanionMemory({
    supabase,
    userId,
    message,
    draft,
    recentMessages,
    useCase: "companion_chat",
  });

  try {
    const { text } = await generateText({
      model: models.companionModel,
      providerOptions: lowReasoningProviderOptions(models.provider, models.companionModelId),
      system: [
        "You are Alibi: a conversational witness for the user's day.",
        alibiCompanionGuide,
        "Do not behave like a form or parser.",
        "Never claim you saved, logged, added, edited, or changed a time block. Only tool-result acknowledgments can say that.",
        "Do not ask for exact time or duration unless the user is clearly trying to log completed work.",
        "If the user is vague, respond conversationally first; you may ask one gentle open question.",
        "Use only the retrieved memory and recent visible messages as grounding, not as a script.",
        "Alibi can retrieve from saved time blocks, notes, companion chat, and derived memory chunks across saved history when the user asks for that scope.",
        "Do not say you only have access to today unless the supplied memory explicitly proves the saved record is limited to today.",
        "Mention source dates or phrases naturally when they help. If the record is thin, say so plainly.",
        "Treat block notes as the strongest source; use chat-derived insights for broader patterns around intention, friction, emotion, useful drift, and mismatch.",
        "Stay under 70 words.",
      ].join("\n"),
      prompt: [
        `User message: ${message}`,
        "",
        "Memory context:",
        memory.evidenceText,
      ].join("\n"),
    });

    return {
      text: text.trim() || "i'm here. tell me the shape of it.",
      retrieval: memory.retrieval,
    };
  } catch (error) {
    return {
      text: describeModelFailure(error, models.provider, models.companionModelId),
      retrieval: memory.retrieval,
    };
  }
}

async function timeBlockCompanionChat(
  models: ResolvedAiModels,
  message: string,
  conversation: CompanionConversation,
  recentMessages: CompanionMessage[],
) {
  const block = conversation.context_snapshot.time_block;

  if (!block) {
    return "i couldn't find the block context for this thread.";
  }

  try {
    const { text } = await generateText({
      model: models.companionModel,
      providerOptions: lowReasoningProviderOptions(models.provider, models.companionModelId),
      system: [
        "You are Alibi: a reflective companion for one saved time block.",
        alibiCompanionGuide,
        "This thread is only about the fixed block context provided below.",
        "Reflect, summarize, reinterpret, and help the user name what happened.",
        "Do not edit the block, create new time blocks, operate timers, or claim you changed stored data.",
        "Treat the block note as the strongest evidence.",
        "Stay under 90 words.",
      ].join("\n"),
      prompt: [
        `User message: ${message}`,
        "Fixed time block context:",
        formatBlockForPrompt(block),
        "",
        "Thread messages:",
        recentMessages.length
          ? recentMessages.map(formatMessageForPrompt).join("\n")
          : "(none)",
      ].join("\n"),
    });

    return text.trim() || "that block has more texture than it first looks.";
  } catch (error) {
    return describeModelFailure(error, models.provider, models.companionModelId);
  }
}

function clarificationQuestion(draft: CompanionDraft) {
  if (!deriveWindow(draft)) {
    if (draft.started_at && !draft.ended_at && !draft.duration_minutes) {
      return "when did it end, or how long did it take?";
    }

    if (draft.ended_at && !draft.started_at && !draft.duration_minutes) {
      return "when did it start, or how long did it take?";
    }

    if (draft.duration_minutes && !draft.started_at && !draft.ended_at) {
      return "when did that happen?";
    }

    return "what time was that, or about how long did it take?";
  }

  if (!draft.task_name?.trim()) {
    return "what should i call that block?";
  }

  if (!resolveCategory(draft).category) {
    return "what category should i file it under?";
  }

  return "what else should i add before i log it?";
}

export async function processCompanionMessage(
  input: ProcessCompanionMessageInput | string,
): Promise<ProcessCompanionMessageResult> {
  const text = typeof input === "string" ? input : input.text;
  const timezone = typeof input === "string" ? null : (input.timezone ?? null);
  const trimmed = text.trim();

  const emptyConversation: CompanionConversation = {
    id: "",
    user_id: "",
    kind: "general",
    title: null,
    related_time_block_id: null,
    context_snapshot: { kind: "general" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!trimmed) {
    return {
      type: "error",
      message: "say something.",
      conversation: emptyConversation,
      messages: [],
      hasPendingDraft: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      type: "error",
      message: "not signed in.",
      conversation: emptyConversation,
      messages: [],
      hasPendingDraft: false,
    };
  }

  const conversation = await getConversationForInput(
    supabase,
    user.id,
    typeof input === "string"
      ? {}
      : {
          conversationId: input.conversationId,
          relatedTimeBlockId: input.relatedTimeBlockId,
        },
  );

  if (!conversation) {
    return {
      type: "error",
      message: "couldn't open that companion thread.",
      conversation: emptyConversation,
      messages: [],
      hasPendingDraft: false,
    };
  }

  const models = await resolveAiModelsForUser(user.id);

  const userMessage = await insertCompanionMessage(
    supabase,
    user.id,
    conversation,
    {
      role: "user",
      content: trimmed,
      model: models.companionModelId,
    },
  );

  if (userMessage.type === "error") {
    return withThreadState(supabase, user.id, conversation, {
      type: "error",
      message: userMessage.message,
    });
  }

  after(() =>
    indexMemoryForCompanionMessage(userMessage.message).catch((error) => {
      console.error("failed to index companion message memory", {
        messageId: userMessage.message.id,
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );

  // Run chat-insight extraction inline. Tempting to wrap in `after()` for
  // latency, but the Supabase client captured here reads cookies on every
  // request, and Next 16 closes the cookies handle once the response ships —
  // any upsert that fires from `after()` fails silently and the chat mirror
  // loses entries. The extraction is fast-model now, so the latency cost is
  // small.
  await upsertCompanionMessageInsight(
    supabase,
    userMessage.message,
    conversation,
    models,
  ).catch((error) => {
    console.error("failed to generate companion message insight", {
      messageId: userMessage.message.id,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const messagesAfterUser = await fetchCompanionMessagesForConversation(
    supabase,
    user.id,
    conversation.id,
  );
  const recentMessages =
    messagesAfterUser.type === "loaded"
      ? messagesAfterUser.messages.slice(-6)
      : [userMessage.message];

  const finishWithAssistant = async <
    T extends Omit<
      ProcessCompanionMessageResult,
      "conversation" | "messages" | "hasPendingDraft"
    >,
  >(
    result: T,
    content: string,
    messageType: CompanionMessageType,
    metadata: Record<string, unknown> = {},
  ) => {
    await insertCompanionMessage(supabase, user.id, conversation, {
      role: "assistant",
      content,
      messageType,
      metadata,
      model: models.companionModelId,
    });

    return withThreadState(supabase, user.id, conversation, result);
  };

  if (conversation.kind === "time_block") {
    const routed = await routeMessage(
      models,
      trimmed,
      null,
      timezone,
      recentMessages,
    );

    if (
      (routed.intent === "edit_block" || routed.intent === "log_block") &&
      draftHasBlockEdit(routed)
    ) {
      const currentBlock = conversation.related_time_block_id
        ? await fetchTimeBlockForUser(
            supabase,
            user.id,
            conversation.related_time_block_id,
          )
        : null;

      if (!currentBlock) {
        return finishWithAssistant(
          { type: "error", message: "time block was not found." },
          "time block was not found.",
          "error",
        );
      }

      const baseDraft = draftFromTimeBlock(currentBlock);
      const mergedDraft = mergeDraft(baseDraft, routed);
      const window = deriveEditWindow(baseDraft, routed);
      const category = resolveCategory(mergedDraft).category;

      if (!window || !mergedDraft.task_name?.trim() || !category) {
        const question = clarificationQuestion(mergedDraft);
        return finishWithAssistant(
          {
            type: "clarify",
            question,
            draft: mergedDraft,
          },
          question,
          "clarification",
        );
      }

      const result = await saveBlock({
        id: currentBlock.id,
        ...draftToSaveInput(mergedDraft, window, category),
        category_id:
          currentBlock.category === category ? currentBlock.category_id : null,
        note_source: "chat",
      });

      if (result.type === "saved") {
        const ack = await makeSavedBlockReply({
          models,
          action: "logged",
          timeBlock: result.timeBlock,
          userMessage: trimmed,
        });
        return finishWithAssistant(
          {
            type: "logged",
            ack,
            timeBlock: result.timeBlock,
          },
          ack,
          "ack",
        );
      }

      if (result.type === "not_found") {
        return finishWithAssistant(
          { type: "error", message: "time block was not found." },
          "time block was not found.",
          "error",
        );
      }

      return finishWithAssistant(result, result.message, "error");
    }

    const message = await timeBlockCompanionChat(
      models,
      trimmed,
      conversation,
      recentMessages,
    );
    return finishWithAssistant(
      {
        type: "conversation",
        message,
      },
      message,
      "chat",
    );
  }

  const pendingDraft = await getPendingDraft(
    supabase,
    user.id,
    conversation.id,
  );

  // Skip-router heuristic: when a pending draft exists and the new message
  // looks like a short clarification answer (no question mark, no
  // analysis/conversation triggers), use the clarifier-only extractor and
  // assume intent=clarify. Saves one fast-tier round-trip on common flows.
  const shouldSkipRouter =
    pendingDraft !== null &&
    trimmed.length < 80 &&
    !trimmed.includes("?") &&
    !/\b(how long|what did|pattern|why|feel|felt|tell me|show me|cancel|nevermind|never mind|stop|forget|start timer|stop timer)\b/i.test(
      trimmed,
    );

  let routed: RouterOutput;
  let clarificationDraft: CompanionDraft | null = null;

  if (shouldSkipRouter && pendingDraft) {
    clarificationDraft = await completeDraftFromClarification(
      models,
      trimmed,
      pendingDraft,
      timezone,
      recentMessages,
    );
    routed = normalizeRouterOutput(
      { intent: "clarify", ...clarificationDraft },
      trimmed,
    );
  } else {
    routed = await routeMessage(
      models,
      trimmed,
      pendingDraft,
      timezone,
      recentMessages,
    );
    // Belt-and-suspenders: when a pending draft is open and the user's reply
    // didn't qualify for the skip-router fast path (long message or contains
    // a question mark), still run the dedicated clarifier so we don't lose
    // draft fields the fast router may have missed inline.
    if (pendingDraft) {
      clarificationDraft = await completeDraftFromClarification(
        models,
        trimmed,
        pendingDraft,
        timezone,
        recentMessages,
      );
    }
  }

  const mergedDraft = mergeDraft(
    pendingDraft,
    clarificationDraft ? mergeDraft(routed, clarificationDraft) : routed,
  );
  const continuePendingDraft = shouldContinuePendingDraft(
    pendingDraft,
    routed,
    clarificationDraft,
  );

  if (
    routed.intent === "start_timer"
  ) {
    const result = await startTimer(draftToStartTimerInput(mergedDraft));
    if (result.type === "started") {
      await resolvePendingDraft(supabase, user.id, conversation.id);
      const ack = await makeAck(models, "started", mergedDraft.task_name ?? "timer");
      return finishWithAssistant(
        {
          type: "timer_started",
          ack,
          activeTimer: result.activeTimer,
        },
        ack,
        "ack",
      );
    }

    if (result.type === "already_running") {
      await resolvePendingDraft(supabase, user.id, conversation.id);
      return finishWithAssistant(
        {
          type: "timer_already_running",
          ack: "timer already running.",
          activeTimer: result.activeTimer,
        },
        "timer already running.",
        "ack",
      );
    }

    return finishWithAssistant(result, result.message, "error");
  }

  if (routed.intent === "stop_timer") {
    const result = await stopTimer({
      task_name: mergedDraft.task_name,
      category: mergedDraft.category,
      hashtags: mergedDraft.hashtags,
      notes: mergedDraft.notes,
      mood: mergedDraft.mood,
      effort_level: mergedDraft.effort_level,
      satisfaction: mergedDraft.satisfaction,
      avoidance_marker: mergedDraft.avoidance_marker,
      hyperfocus_marker: mergedDraft.hyperfocus_marker,
      guilt_marker: mergedDraft.guilt_marker,
      novelty_marker: mergedDraft.novelty_marker,
      note_source: "chat",
    });

    if (result.type === "stopped") {
      await resolvePendingDraft(supabase, user.id, conversation.id);
      const ack = await makeSavedBlockReply({
        models,
        action: "stopped",
        timeBlock: result.timeBlock,
        userMessage: trimmed,
      });
      return finishWithAssistant(
        {
          type: "timer_stopped",
          ack,
          timeBlock: result.timeBlock,
        },
        ack,
        "ack",
      );
    }

    if (result.type === "not_running") {
      return finishWithAssistant(
        { type: "timer_not_running", message: "no timer is running." },
        "no timer is running.",
        "error",
      );
    }

    return finishWithAssistant(result, result.message, "error");
  }

  if (routed.intent === "analyse_blocks") {
    const reply = await analyseBlocks({
      models,
      supabase,
      userId: user.id,
      conversation,
      message: trimmed,
      draft: mergedDraft,
      recentMessages,
    });
    return finishWithAssistant(
      {
        type: "analysis",
        message: reply.text,
      },
      reply.text,
      "analysis",
      retrievalMetadata(reply.retrieval),
    );
  }

  if (!looksLikeLogAttempt(trimmed, routed) && !continuePendingDraft) {
    if (pendingDraft) {
      await resolvePendingDraft(supabase, user.id, conversation.id);
    }

    const reply = await companionChat({
      models,
      supabase,
      userId: user.id,
      conversation,
      message: trimmed,
      draft: continuePendingDraft ? mergedDraft : null,
      recentMessages,
    });
    return finishWithAssistant(
      {
        type: "conversation",
        message: reply.text,
      },
      reply.text,
      "chat",
      retrievalMetadata(reply.retrieval),
    );
  }

  const window = deriveWindow(mergedDraft);
  if (!window) {
    const question = clarificationQuestion(mergedDraft);
    await savePendingDraft(supabase, user.id, conversation.id, mergedDraft);
    return finishWithAssistant(
      {
        type: "clarify",
        question,
        draft: mergedDraft,
      },
      question,
      "clarification",
    );
  }

  if (!mergedDraft.task_name?.trim()) {
    const question = clarificationQuestion(mergedDraft);
    await savePendingDraft(supabase, user.id, conversation.id, mergedDraft);
    return finishWithAssistant(
      {
        type: "clarify",
        question,
        draft: mergedDraft,
      },
      question,
      "clarification",
    );
  }

  const category = resolveCategory(mergedDraft).category;
  if (!category) {
    const question = clarificationQuestion(mergedDraft);
    await savePendingDraft(supabase, user.id, conversation.id, mergedDraft);
    return finishWithAssistant(
      {
        type: "clarify",
        question,
        draft: mergedDraft,
      },
      question,
      "clarification",
    );
  }

  const result = await saveBlock({
    ...draftToSaveInput(mergedDraft, window, category),
    note_source: "chat",
  });

  if (result.type === "saved") {
    await resolvePendingDraft(supabase, user.id, conversation.id);
    const ack = await makeSavedBlockReply({
      models,
      action: "logged",
      timeBlock: result.timeBlock,
      userMessage: trimmed,
    });
    return finishWithAssistant(
      {
        type: "logged",
        ack,
        timeBlock: result.timeBlock,
      },
      ack,
      "ack",
    );
  }

  if (result.type === "not_found") {
    return finishWithAssistant(
      { type: "error", message: "time block was not found." },
      "time block was not found.",
      "error",
    );
  }

  return finishWithAssistant(result, result.message, "error");
}

export const processMessage = processCompanionMessage;
