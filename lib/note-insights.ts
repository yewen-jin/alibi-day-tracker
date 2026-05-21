import type { TimeBlock, TimeBlockInsight } from "@/lib/types"
import { buildEvidenceClaims } from "@/lib/evidence-claims"

type DerivedInsight = Omit<
  TimeBlockInsight,
  "id" | "time_block_id" | "note_version_id" | "user_id" | "source_notes" | "created_at"
>

const INSIGHT_MODEL_VERSION = "notes-first-heuristic-v1"

const FRICTION_PATTERNS = [
  /\bstuck\b/gi,
  /\bblocked\b/gi,
  /\bgot in the way\b/gi,
  /\binterrupted\b/gi,
  /\bdistracted\b/gi,
  /\bfriction\b/gi,
  /\bcouldn't\b/gi,
  /\bcould not\b/gi,
]

const AVOIDANCE_PATTERNS = [
  /\bavoided\b/gi,
  /\bput off\b/gi,
  /\bprocrastinat(?:ed|ing|ion)\b/gi,
  /\bdread(?:ed|ing)?\b/gi,
  /\bkept delaying\b/gi,
]

const HYPERFOCUS_PATTERNS = [
  /\bhyperfoc(?:us|used|using)\b/gi,
  /\blost track of time\b/gi,
  /\bflow\b/gi,
  /\bcouldn't stop\b/gi,
  /\bcould not stop\b/gi,
]

const SATISFACTION_PATTERNS = [
  /\bproud\b/gi,
  /\bsatisf(?:ied|ying)\b/gi,
  /\brelieved\b/gi,
  /\brewarding\b/gi,
  /\bglad\b/gi,
  /\bworth it\b/gi,
]

const UNCERTAINTY_PATTERNS = [
  /\bnot sure\b/gi,
  /\bunclear\b/gi,
  /\bi guess\b/gi,
  /\bmaybe\b/gi,
  /\bshould have\b/gi,
  /\bwasted\b/gi,
  /\buseless\b/gi,
  /\bfailure\b/gi,
]

const ACTION_PATTERNS = [
  /\b(?:worked on|fixed|wrote|drafted|reviewed|planned|cleaned|called|emailed|sorted|read|researched|built|debugged|met with|prepared)\b[^.!?\n]*/gi,
]

const PEOPLE_PATTERN = /(?:with|for|from|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g
const PROJECT_PATTERN = /(?:project|client|for|on)\s+([A-Z][A-Za-z0-9_-]+|[a-z][A-Za-z0-9_-]{2,})/g

function collectMatches(notes: string, patterns: RegExp[], limit = 6) {
  const matches: string[] = []
  for (const pattern of patterns) {
    for (const match of notes.matchAll(pattern)) {
      const value = match[0]?.trim()
      if (value && !matches.includes(value.toLowerCase())) {
        matches.push(value.toLowerCase())
      }
      if (matches.length >= limit) {
        return matches
      }
    }
  }
  return matches
}

function collectNamed(notes: string, pattern: RegExp, limit = 6) {
  const matches: string[] = []
  for (const match of notes.matchAll(pattern)) {
    const value = match[1]?.trim()
    if (value && !matches.includes(value)) {
      matches.push(value)
    }
    if (matches.length >= limit) break
  }
  return matches
}

function inferTone(notes: string) {
  const lower = notes.toLowerCase()
  if (/\b(anxious|stressed|panic|worried|overwhelmed)\b/.test(lower)) return "anxious"
  if (/\b(guilty|ashamed|should have|wasted)\b/.test(lower)) return "self-critical"
  if (/\b(proud|glad|relieved|satisfied)\b/.test(lower)) return "positive"
  if (/\b(flat|tired|exhausted|drained)\b/.test(lower)) return "flat"
  if (/\b(frustrated|annoyed|blocked|stuck)\b/.test(lower)) return "frustrated"
  return null
}

function noteExcerpt(notes: string) {
  const cleaned = notes.replace(/\s+/g, " ").trim()
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned
}

export function deriveInsightFromNotes(notes: string | null): DerivedInsight | null {
  if (!notes?.trim()) {
    return null
  }

  const cleaned = notes.trim()
  const actions = collectMatches(cleaned, ACTION_PATTERNS, 8)
  const frictionPoints = collectMatches(cleaned, FRICTION_PATTERNS)
  const avoidanceSignals = collectMatches(cleaned, AVOIDANCE_PATTERNS)
  const hyperfocusSignals = collectMatches(cleaned, HYPERFOCUS_PATTERNS)
  const satisfactionSignals = collectMatches(cleaned, SATISFACTION_PATTERNS)
  const uncertaintySignals = collectMatches(cleaned, UNCERTAINTY_PATTERNS)
  const evidence_claims = buildEvidenceClaims(cleaned, "time_block_note", [
    { source_field: "actions", kind: "action", patterns: ACTION_PATTERNS, limit: 8 },
    { source_field: "friction_points", kind: "friction", patterns: FRICTION_PATTERNS },
    { source_field: "avoidance_signals", kind: "avoidance", patterns: AVOIDANCE_PATTERNS },
    { source_field: "hyperfocus_signals", kind: "hyperfocus", patterns: HYPERFOCUS_PATTERNS },
    { source_field: "satisfaction_signals", kind: "satisfaction", patterns: SATISFACTION_PATTERNS },
    { source_field: "uncertainty_signals", kind: "uncertainty", patterns: UNCERTAINTY_PATTERNS },
  ])
  const themes = Array.from(
    new Set([
      ...frictionPoints.map(() => "friction"),
      ...avoidanceSignals.map(() => "avoidance"),
      ...hyperfocusSignals.map(() => "hyperfocus"),
      ...satisfactionSignals.map(() => "satisfaction"),
      ...uncertaintySignals.map(() => "uncertainty"),
    ]),
  )

  return {
    source: "notes",
    actions,
    emotional_tone: inferTone(cleaned),
    friction_points: frictionPoints,
    avoidance_signals: avoidanceSignals,
    hyperfocus_signals: hyperfocusSignals,
    satisfaction_signals: satisfactionSignals,
    uncertainty_signals: uncertaintySignals,
    people: collectNamed(cleaned, PEOPLE_PATTERN),
    projects: collectNamed(cleaned, PROJECT_PATTERN),
    themes,
    evidence_excerpt: noteExcerpt(cleaned),
    evidence_claims,
    model_version: INSIGHT_MODEL_VERSION,
  }
}

export function formatInsightForPrompt(insight: TimeBlockInsight) {
  const parts = [
    insight.emotional_tone ? `tone=${insight.emotional_tone}` : "",
    insight.friction_points.length ? `friction=${insight.friction_points.join(", ")}` : "",
    insight.avoidance_signals.length ? `avoidance=${insight.avoidance_signals.join(", ")}` : "",
    insight.hyperfocus_signals.length ? `hyperfocus=${insight.hyperfocus_signals.join(", ")}` : "",
    insight.satisfaction_signals.length
      ? `satisfaction=${insight.satisfaction_signals.join(", ")}`
      : "",
    insight.uncertainty_signals.length
      ? `uncertainty=${insight.uncertainty_signals.join(", ")}`
      : "",
  ].filter(Boolean)

  return parts.join("; ")
}

export function blockEvidenceLabel(block: TimeBlock) {
  const date = new Date(block.started_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })
  return `${date}, ${block.task_name ?? "unnamed block"}`
}
