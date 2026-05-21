import { generateText, Output, type LanguageModel } from "ai"
import { z } from "zod"
import { fastModel, fastModelId } from "@/lib/ai"
import { alibiCompanionGuide } from "@/lib/companion-voice"
import { attachEvidenceSourceId, buildEvidenceClaims, validateEvidenceClaims } from "@/lib/evidence-claims"
import type {
  CompanionConversation,
  CompanionMessage,
  CompanionMessageInsight,
  CompanionMessageInsightScope,
} from "@/lib/types"

type DerivedChatInsight = Omit<
  CompanionMessageInsight,
  "id" | "user_id" | "message_id" | "conversation_id" | "related_time_block_id" | "scope" | "created_at"
>

const CHAT_INSIGHT_MODEL_VERSION = "chat-mirror-heuristic-v1"

const chatInsightSchema = z.object({
  did_actions: z.array(z.string()).default([]),
  intended_actions: z.array(z.string()).default([]),
  avoided_or_deferred: z.array(z.string()).default([]),
  friction_points: z.array(z.string()).default([]),
  emotional_signals: z.array(z.string()).default([]),
  useful_drift: z.array(z.string()).default([]),
  mismatch_signals: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  evidence_excerpt: z.string().nullable().default(null),
  evidence_claims: z.array(z.object({
    source_field: z.string(),
    kind: z.string(),
    text: z.string(),
  })).default([]),
})

type ChatInsightOutput = z.infer<typeof chatInsightSchema>

const DID_PATTERNS = [
  /\b(?:i\s+)?(?:actually\s+)?(?:did|worked on|fixed|wrote|drafted|reviewed|planned|cleaned|called|emailed|sorted|read|researched|built|debugged|finished|completed)\b[^.!?\n]*/gi,
]

const INTENT_PATTERNS = [
  /\b(?:i\s+)?(?:meant|intended|planned|wanted|was going|was supposed|needed|hoped)\s+to\b[^.!?\n]*/gi,
]

const AVOIDED_PATTERNS = [
  /\b(?:avoided|put off|deferred|delayed|procrastinated|kept delaying|didn't get to|did not get to)\b[^.!?\n]*/gi,
]

const FRICTION_PATTERNS = [
  /\b(?:stuck|blocked|scattered|distracted|overwhelmed|interrupted|couldn't focus|could not focus|hard to start|friction)\b[^.!?\n]*/gi,
]

const EMOTION_PATTERNS = [
  /\b(?:felt|feeling|feel)\s+(?:guilty|bad|anxious|flat|proud|relieved|frustrated|stressed|overwhelmed|scattered|better|worse|tired|drained|unclear)\b[^.!?\n]*/gi,
  /\b(?:felt like|feels like|feel like)\b[^.!?\n]*/gi,
  /\b(?:guilty|anxious|flat|proud|relieved|frustrated|stressed|overwhelmed|scattered|tired|drained)\b[^.!?\n]*/gi,
]

const USEFUL_DRIFT_PATTERNS = [
  /\b(?:got|was|ended up|became)\s+(?:distracted|sidetracked|pulled|derailed)\b[^.!?\n]*(?:but|and)[^.!?\n]*(?:fixed|found|did|made|helped|useful|worth|solved|cleared)[^.!?\n]*/gi,
  /\bended up\b[^.!?\n]*(?:useful|helped|fixed|solved|cleared|worth)[^.!?\n]*/gi,
  /\buseful\s+(?:detour|drift|distraction|sidetrack)\b[^.!?\n]*/gi,
]

const MISMATCH_PATTERNS = [
  /\b(?:felt like|feels like|feel like)\s+i\s+(?:did|got)\s+nothing\b[^.!?\n]*/gi,
  /\b(?:didn't count|did not count|doesn't count|does not count)\b[^.!?\n]*/gi,
  /\b(?:but actually|actually)\b[^.!?\n]*(?:did|fixed|finished|completed|found|made|worked)[^.!?\n]*/gi,
]

function cleanPhrase(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/, "")
}

function collectMatches(text: string, patterns: RegExp[], limit = 6) {
  const seen = new Set<string>()
  const matches: string[] = []

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const phrase = cleanPhrase(match[0] ?? "")
      const key = phrase.toLowerCase()
      if (phrase && !seen.has(key)) {
        seen.add(key)
        matches.push(phrase)
      }
      if (matches.length >= limit) return matches
    }
  }

  return matches
}

function limitArray(values: string[] | undefined, limit = 8) {
  return (values ?? [])
    .map(cleanPhrase)
    .filter(Boolean)
    .slice(0, limit)
}

function excerpt(text: string) {
  const cleaned = cleanPhrase(text)
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned
}

function themesFor(insight: Omit<DerivedChatInsight, "themes" | "evidence_excerpt" | "evidence_claims" | "model_version">) {
  return Array.from(
    new Set([
      ...(insight.did_actions.length ? ["did"] : []),
      ...(insight.intended_actions.length ? ["intention"] : []),
      ...(insight.avoided_or_deferred.length ? ["avoidance"] : []),
      ...(insight.friction_points.length ? ["friction"] : []),
      ...(insight.emotional_signals.length ? ["emotion"] : []),
      ...(insight.useful_drift.length ? ["useful drift"] : []),
      ...(insight.mismatch_signals.length ? ["mismatch"] : []),
    ]),
  )
}

export function deriveChatInsightFromMessage(text: string | null): DerivedChatInsight | null {
  if (!text?.trim()) return null

  const cleaned = text.trim()
  const partial = {
    did_actions: collectMatches(cleaned, DID_PATTERNS),
    intended_actions: collectMatches(cleaned, INTENT_PATTERNS),
    avoided_or_deferred: collectMatches(cleaned, AVOIDED_PATTERNS),
    friction_points: collectMatches(cleaned, FRICTION_PATTERNS),
    emotional_signals: collectMatches(cleaned, EMOTION_PATTERNS),
    useful_drift: collectMatches(cleaned, USEFUL_DRIFT_PATTERNS),
    mismatch_signals: collectMatches(cleaned, MISMATCH_PATTERNS),
  }
  const evidence_claims = buildEvidenceClaims(cleaned, "companion_message", [
    { source_field: "did_actions", kind: "action", patterns: DID_PATTERNS },
    { source_field: "intended_actions", kind: "action", patterns: INTENT_PATTERNS },
    { source_field: "avoided_or_deferred", kind: "avoidance", patterns: AVOIDED_PATTERNS },
    { source_field: "friction_points", kind: "friction", patterns: FRICTION_PATTERNS },
    { source_field: "emotional_signals", kind: "emotion", patterns: EMOTION_PATTERNS },
    { source_field: "useful_drift", kind: "useful_drift", patterns: USEFUL_DRIFT_PATTERNS },
    { source_field: "mismatch_signals", kind: "mismatch", patterns: MISMATCH_PATTERNS },
  ])

  return {
    ...partial,
    themes: themesFor(partial),
    evidence_excerpt: excerpt(cleaned),
    evidence_claims,
    model_version: CHAT_INSIGHT_MODEL_VERSION,
  }
}

function normalizeInsightOutput(
  output: ChatInsightOutput,
  fallback: DerivedChatInsight,
  messageText: string,
): DerivedChatInsight {
  const partial = {
    did_actions: limitArray(output.did_actions),
    intended_actions: limitArray(output.intended_actions),
    avoided_or_deferred: limitArray(output.avoided_or_deferred),
    friction_points: limitArray(output.friction_points),
    emotional_signals: limitArray(output.emotional_signals),
    useful_drift: limitArray(output.useful_drift),
    mismatch_signals: limitArray(output.mismatch_signals),
  }
  const outputThemes = limitArray(output.themes)
  const evidence_claims = validateEvidenceClaims(
    messageText,
    "companion_message",
    output.evidence_claims,
  )

  return {
    ...partial,
    themes: outputThemes.length ? outputThemes : themesFor(partial),
    evidence_excerpt:
      output.evidence_excerpt?.trim().slice(0, 220) ||
      fallback.evidence_excerpt,
    evidence_claims: evidence_claims.length ? evidence_claims : fallback.evidence_claims,
    model_version: fastModelId,
  }
}

export async function generateChatInsight(
  messageText: string,
  options: {
    model?: LanguageModel
    modelVersion?: string
    providerOptions?: Parameters<typeof generateText>[0]["providerOptions"]
  } = {},
) {
  const fallback = deriveChatInsightFromMessage(messageText)
  if (!fallback) return null

  try {
    const { output } = await generateText({
      model: options.model ?? fastModel,
      output: Output.object({ schema: chatInsightSchema }),
      providerOptions: options.providerOptions,
      system: [
        "Extract a grounded Alibi chat mirror insight from one user message.",
        alibiCompanionGuide,
        "Use only the user's actual message text.",
        "Do not diagnose, score, judge, or infer failure from silence.",
        "Do not claim missing work unless the user explicitly stated an intention, comparison, or avoidance.",
        "Use short lowercase phrases. Empty arrays are fine.",
        "The evidence_excerpt must be a short excerpt from the user's message.",
        "For evidence_claims, return only exact text copied from the user's message and the insight field it supports.",
      ].join("\n"),
      prompt: ["User message:", messageText.slice(0, 3000)].join("\n"),
    })

    return {
      ...normalizeInsightOutput(output, fallback, messageText),
      model_version: options.modelVersion ?? fastModelId,
    }
  } catch {
    return fallback
  }
}

export function scopeForConversation(conversation: Pick<CompanionConversation, "kind">): CompanionMessageInsightScope {
  return conversation.kind === "time_block" ? "time_block" : "general"
}

export async function generateCompanionMessageInsightRecord(
  message: CompanionMessage,
  conversation: Pick<CompanionConversation, "kind">,
  options: {
    id?: string
    createdAt?: string
    model?: LanguageModel
    modelVersion?: string
    providerOptions?: Parameters<typeof generateText>[0]["providerOptions"]
  } = {},
): Promise<CompanionMessageInsight | null> {
  if (message.role !== "user") return null

  const insight = await generateChatInsight(message.content, options)
  if (!insight) return null

  return buildCompanionMessageInsightRecord(message, conversation, insight, options)
}

export function deriveCompanionMessageInsightRecord(
  message: CompanionMessage,
  conversation: Pick<CompanionConversation, "kind">,
  options: {
    id?: string
    createdAt?: string
  } = {},
): CompanionMessageInsight | null {
  if (message.role !== "user") return null

  const insight = deriveChatInsightFromMessage(message.content)
  if (!insight) return null

  return buildCompanionMessageInsightRecord(message, conversation, insight, options)
}

function buildCompanionMessageInsightRecord(
  message: CompanionMessage,
  conversation: Pick<CompanionConversation, "kind">,
  insight: DerivedChatInsight,
  options: {
    id?: string
    createdAt?: string
  },
) {
  return {
    id: options.id ?? `chat-insight-${message.id}`,
    user_id: message.user_id,
    message_id: message.id,
    conversation_id: message.conversation_id,
    related_time_block_id: message.related_time_block_id,
    scope: scopeForConversation(conversation),
    created_at: options.createdAt ?? new Date().toISOString(),
    ...insight,
    evidence_claims: attachEvidenceSourceId(insight.evidence_claims, message.id),
  }
}
