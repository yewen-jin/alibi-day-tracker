import { z } from "zod"
import {
  aggregateByCategory,
  aggregateByHour,
  aggregateEffort,
  aggregateSatisfaction,
  buildWorkPatternObservations,
} from "@/lib/dashboard-data"
import type { DashboardSkillInput } from "@/lib/skills/types"

const evidenceSchema = z
  .object({
    id: z.string().min(1).max(120),
    type: z.enum(["block", "note", "chat"]),
    label: z.string().min(1).max(120),
    excerpt: z.string().min(1).max(500),
    written_at: z.string().min(1).max(80),
  })
  .strict()

const metricSchema = z
  .object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(80),
    detail: z.string().max(160).optional(),
  })
  .strict()

const observationSchema = z
  .object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(500),
    evidence: z.array(evidenceSchema).max(6).default([]),
  })
  .strict()

const chartPointSchema = z
  .object({
    label: z.string().min(1).max(40),
    value: z.number().finite().nonnegative(),
  })
  .strict()

const sourceSchema = z
  .object({
    title: z.string().min(1).max(120),
    sources: z.array(evidenceSchema).max(10),
  })
  .strict()

const sectionSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    type: z.enum([
      "metric_cards",
      "observation_list",
      "pattern_cards",
      "simple_chart",
      "source_panel",
    ]),
    title: z.string().min(1).max(120),
    description: z.string().max(220).optional(),
    metric: z
      .enum(["summary", "time_by_category", "effort", "satisfaction", "hourly"])
      .optional(),
    source: z
      .enum(["summary", "patterns", "observations", "evidence"])
      .default("summary"),
  })
  .strict()

export const dashboardViewSpecSchema = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(220),
    sections: z.array(sectionSpecSchema).min(1).max(6),
  })
  .strict()

const sectionResultSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: z.string(),
      type: z.literal("metric_cards"),
      metrics: z.array(metricSchema).max(8),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      type: z.literal("observation_list"),
      observations: z.array(observationSchema).max(8),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      type: z.literal("pattern_cards"),
      patterns: z.array(observationSchema).max(8),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      type: z.literal("simple_chart"),
      points: z.array(chartPointSchema).max(24),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      type: z.literal("source_panel"),
      panels: z.array(sourceSchema).max(6),
    })
    .strict(),
])

export const dashboardViewResultSchema = z
  .object({
    version: z.literal(1),
    generated_at: z.string(),
    input_window_start: z.string().nullable(),
    input_window_end: z.string().nullable(),
    sections: z.array(sectionResultSchema).max(6),
  })
  .strict()

export type DashboardViewSpec = z.infer<typeof dashboardViewSpecSchema>
export type DashboardViewResult = z.infer<typeof dashboardViewResultSchema>
export type DashboardViewSectionSpec = DashboardViewSpec["sections"][number]
export type DashboardViewEvidence = z.infer<typeof evidenceSchema>

export interface DashboardViewEvidencePacket {
  version: 1
  generated_at: string
  input_window_start: string | null
  input_window_end: string | null
  summary: {
    block_count: number
    total_minutes: number
    note_insight_count: number
    chat_insight_count: number
  }
  categories: Array<{ name: string; slug: string; color: string }>
  aggregates: {
    time_by_category: Array<{ label: string; value: number }>
    hourly: Array<{ label: string; value: number }>
    effort: Array<{ label: string; count: number; pct: number }>
    satisfaction: Array<{ label: string; count: number; pct: number }>
  }
  blocks: Array<{
    id: string
    started_at: string
    ended_at: string | null
    duration_minutes: number | null
    category: string | null
    task_name: string | null
    notes_excerpt: string | null
    effort_level: string | null
    satisfaction: string | null
    markers: string[]
  }>
  evidence: DashboardViewEvidence[]
  retrieved_evidence?: DashboardViewEvidence[]
  evidence_synthesis?: {
    query: string
    themes: string[]
    contradictions: string[]
    recurring_signals: string[]
    cited_chunk_ids: string[]
  }
}

export function validateDashboardViewSpec(input: unknown): DashboardViewSpec {
  return dashboardViewSpecSchema.parse(input)
}

export function validateDashboardViewResult(
  input: unknown,
  options: {
    spec?: DashboardViewSpec
    allowedEvidence?: Iterable<DashboardViewEvidence>
    allowedEvidenceIds?: Iterable<string>
  } = {},
): DashboardViewResult {
  const result = dashboardViewResultSchema.parse(input)

  if (options.spec) {
    const expected = options.spec.sections.map((section) => [section.id, section.type])
    const actual = result.sections.map((section) => [section.id, section.type])
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("dashboard result sections do not match the saved spec")
    }
  }

  if (options.allowedEvidence) {
    const allowed = new Map(Array.from(options.allowedEvidence, (evidence) => [evidence.id, evidence]))
    const invalid = collectEvidenceItems(result).filter((evidence) => {
      const expected = allowed.get(evidence.id)
      return (
        !expected ||
        expected.type !== evidence.type ||
        expected.label !== evidence.label ||
        expected.excerpt !== evidence.excerpt ||
        expected.written_at !== evidence.written_at
      )
    })
    if (invalid.length > 0) {
      throw new Error(
        `dashboard result referenced unknown or altered evidence: ${invalid.map((item) => item.id).join(", ")}`,
      )
    }
  } else if (options.allowedEvidenceIds) {
    const allowed = new Set(options.allowedEvidenceIds)
    const refs = collectEvidenceRefs(result)
    const invented = refs.filter((id) => !allowed.has(id))
    if (invented.length > 0) {
      throw new Error(`dashboard result referenced unknown evidence: ${invented.join(", ")}`)
    }
  }

  return result
}

export function slugifyDashboardViewTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

  return slug || "custom-view"
}

function compactText(value: string | null | undefined, max = 500) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? ""
  if (!normalized) return null
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized
}

function stableId(...parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
}

function evidenceId(value: string) {
  return stableId(value).slice(0, 120)
}

function collectEvidenceRefs(result: DashboardViewResult) {
  return collectEvidenceItems(result).map((evidence) => evidence.id)
}

function collectEvidenceItems(result: DashboardViewResult) {
  return result.sections.flatMap((section) => {
    if (section.type === "observation_list") {
      return section.observations.flatMap((item) => item.evidence)
    }
    if (section.type === "pattern_cards") {
      return section.patterns.flatMap((item) => item.evidence)
    }
    if (section.type === "source_panel") {
      return section.panels.flatMap((panel) => panel.sources)
    }
    return []
  })
}

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

function dateWindow(input: DashboardSkillInput) {
  const dates = input.blocks
    .map((block) => new Date(block.started_at))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())

  return {
    start: dates[0]?.toISOString() ?? null,
    end: dates[dates.length - 1]?.toISOString() ?? null,
  }
}

function evidenceFromInput(input: DashboardSkillInput): DashboardViewEvidence[] {
  const noteEvidence = input.noteInsights
    .flatMap((insight) => {
      const sourceId = insight.note_version_id ?? insight.time_block_id ?? insight.id
      const evidenceClaims = insight.evidence_claims ?? []
      return evidenceClaims.length > 0
        ? evidenceClaims.map((claim, index) => ({
            id: stableId("note", sourceId, claim.kind, String(index)),
            type: "note" as const,
            label: claim.kind,
            excerpt: compactText(claim.context_excerpt || claim.text) ?? claim.kind,
            written_at:
              input.noteVersionCreatedAtById.get(insight.note_version_id ?? "") ??
              insight.created_at,
          }))
        : insight.evidence_excerpt
          ? [
              {
                id: stableId("note", sourceId, "excerpt"),
                type: "note" as const,
                label: "note evidence",
                excerpt: compactText(insight.evidence_excerpt) ?? "note evidence",
                written_at: insight.created_at,
              },
            ]
          : []
    })
    .slice(0, 8)

  const chatEvidence = input.chatInsights
    .flatMap((insight) => {
      const evidenceClaims = insight.evidence_claims ?? []
      return evidenceClaims.length > 0
        ? evidenceClaims.map((claim, index) => ({
            id: stableId("chat", insight.message_id, claim.kind, String(index)),
            type: "chat" as const,
            label: claim.kind,
            excerpt: compactText(claim.context_excerpt || claim.text) ?? claim.kind,
            written_at: insight.created_at,
          }))
        : insight.evidence_excerpt
          ? [
              {
                id: stableId("chat", insight.message_id, "excerpt"),
                type: "chat" as const,
                label: "chat evidence",
                excerpt: compactText(insight.evidence_excerpt) ?? "chat evidence",
                written_at: insight.created_at,
              },
            ]
          : []
    })
    .slice(0, 8)

  const blockEvidence = input.blocks.slice(0, 8).map((block) => ({
    id: stableId("block", block.id),
    type: "block" as const,
    label: block.task_name ?? block.category ?? "saved block",
    excerpt: compactText(block.notes ?? block.task_name ?? block.category) ?? "saved block",
    written_at: block.started_at,
  }))

  return [...noteEvidence, ...chatEvidence, ...blockEvidence].slice(0, 12)
}

interface RetrievedDashboardChunk {
  id: string
  sourceType: string
  sourceCreatedAt: string
  chunkText: string
  metadata: Record<string, unknown>
}

interface DashboardRagContext {
  query: string
  chunks: RetrievedDashboardChunk[]
}

function sourceTypeToEvidenceType(sourceType: string): DashboardViewEvidence["type"] {
  if (sourceType.includes("chat") || sourceType === "companion_message") {
    return "chat"
  }
  if (sourceType.includes("insight") || sourceType.includes("note")) {
    return "note"
  }
  return "block"
}

function retrievedEvidence(
  rag: DashboardRagContext | null | undefined,
): DashboardViewEvidence[] {
  return (rag?.chunks ?? []).slice(0, 12).map((chunk) => ({
    id: evidenceId(`rag-${chunk.id}`),
    type: sourceTypeToEvidenceType(chunk.sourceType),
    label:
      typeof chunk.metadata.source_label === "string"
        ? chunk.metadata.source_label.slice(0, 120)
        : chunk.sourceType,
    excerpt: compactText(chunk.chunkText, 500) ?? chunk.sourceType,
    written_at: chunk.sourceCreatedAt,
  }))
}

function evidenceSynthesis(rag: DashboardRagContext | null | undefined) {
  if (!rag || rag.chunks.length === 0) return undefined
  const text = rag.chunks.map((chunk) => chunk.chunkText.toLowerCase()).join("\n")
  const signalWords = [
    "avoidance",
    "friction",
    "hyperfocus",
    "satisfaction",
    "uncertainty",
    "emotion",
    "useful drift",
    "mismatch",
  ]
  const recurring = signalWords.filter((word) => text.includes(word))
  const themes = Array.from(
    new Set(
      rag.chunks
        .flatMap((chunk) =>
          Array.isArray(chunk.metadata.tags) ? chunk.metadata.tags : [],
        )
        .filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())),
    ),
  ).slice(0, 6)

  return {
    query: rag.query,
    themes: themes.length ? themes : recurring.slice(0, 4),
    contradictions:
      text.includes("satisfaction") && text.includes("friction")
        ? ["some retrieved records pair friction with satisfaction; phrase this as a mixed signal."]
        : [],
    recurring_signals: recurring,
    cited_chunk_ids: rag.chunks.slice(0, 12).map((chunk) => chunk.id),
  }
}

function markersForBlock(block: DashboardSkillInput["blocks"][number]) {
  return [
    block.avoidance_marker ? "avoidance" : null,
    block.hyperfocus_marker ? "hyperfocus" : null,
    block.guilt_marker ? "guilt" : null,
    block.novelty_marker ? "novelty" : null,
  ].filter((marker): marker is string => Boolean(marker))
}

export function buildDashboardEvidencePacket(
  input: DashboardSkillInput,
  options: { rag?: DashboardRagContext | null } = {},
): DashboardViewEvidencePacket {
  const window = dateWindow(input)
  const totalMinutes = Math.round(
    input.blocks.reduce((sum, block) => sum + (block.duration_seconds ?? 0), 0) / 60,
  )

  const ragEvidence = retrievedEvidence(options.rag)

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    input_window_start: window.start,
    input_window_end: window.end,
    summary: {
      block_count: input.blocks.length,
      total_minutes: totalMinutes,
      note_insight_count: input.noteInsights.length,
      chat_insight_count: input.chatInsights.length,
    },
    categories: input.categories.slice(0, 30).map((category) => ({
      name: category.name,
      slug: category.slug,
      color: category.color,
    })),
    aggregates: {
      time_by_category: aggregateByCategory(input.blocks).map((point) => ({
        label: point.category,
        value: point.totalMinutes,
      })),
      hourly: aggregateByHour(input.blocks).map((point) => ({
        label: `${point.hour}:00`,
        value: point.count,
      })),
      effort: aggregateEffort(input.blocks).map((point) => ({
        label: point.level,
        count: point.count,
        pct: point.pct,
      })),
      satisfaction: aggregateSatisfaction(input.blocks).map((point) => ({
        label: point.level,
        count: point.count,
        pct: point.pct,
      })),
    },
    blocks: input.blocks.slice(0, 50).map((block) => ({
      id: block.id,
      started_at: block.started_at,
      ended_at: block.ended_at,
      duration_minutes:
        typeof block.duration_seconds === "number"
          ? Math.round(block.duration_seconds / 60)
          : null,
      category: block.category,
      task_name: block.task_name,
      notes_excerpt: compactText(block.notes, 260),
      effort_level: block.effort_level,
      satisfaction: block.satisfaction,
      markers: markersForBlock(block),
    })),
    evidence: [...ragEvidence, ...evidenceFromInput(input)].slice(0, 18),
    retrieved_evidence: ragEvidence,
    evidence_synthesis: evidenceSynthesis(options.rag),
  }
}

function summaryMetrics(input: DashboardSkillInput) {
  const totalMinutes = Math.round(
    input.blocks.reduce((sum, block) => sum + (block.duration_seconds ?? 0), 0) / 60,
  )
  const categories = new Set(input.blocks.map((block) => block.category).filter(Boolean))
  return [
    {
      label: "tracked time",
      value: minutesLabel(totalMinutes),
      detail: `${input.blocks.length} saved block${input.blocks.length === 1 ? "" : "s"}`,
    },
    {
      label: "categories",
      value: String(categories.size),
      detail: "distinct kinds of work on record",
    },
    {
      label: "note signals",
      value: String(input.noteInsights.length),
      detail: "insight records from block notes",
    },
    {
      label: "chat signals",
      value: String(input.chatInsights.length),
      detail: "insight records from companion chat",
    },
  ]
}

function sectionResult(section: DashboardViewSectionSpec, input: DashboardSkillInput) {
  if (section.type === "metric_cards") {
    const metric = section.metric ?? "summary"
    if (metric === "effort") {
      return {
        id: section.id,
        type: section.type,
        metrics: aggregateEffort(input.blocks).map((stat) => ({
          label: stat.level,
          value: String(stat.count),
          detail: `${stat.pct}% of rated blocks`,
        })),
      }
    }
    if (metric === "satisfaction") {
      return {
        id: section.id,
        type: section.type,
        metrics: aggregateSatisfaction(input.blocks).map((stat) => ({
          label: stat.level,
          value: String(stat.count),
          detail: `${stat.pct}% of rated blocks`,
        })),
      }
    }
    return { id: section.id, type: section.type, metrics: summaryMetrics(input) }
  }

  if (section.type === "simple_chart") {
    const points =
      section.metric === "hourly"
        ? aggregateByHour(input.blocks).map((point) => ({
            label: `${point.hour}:00`,
            value: point.count,
          }))
        : aggregateByCategory(input.blocks).map((point) => ({
            label: point.category,
            value: point.totalMinutes,
          }))
    return { id: section.id, type: section.type, points }
  }

  const patterns = buildWorkPatternObservations({
    blocks: input.blocks,
    noteInsights: input.noteInsights,
    chatInsights: input.chatInsights,
    messages: input.chatMessages,
    noteVersionCreatedAtById: input.noteVersionCreatedAtById,
  })

  if (section.type === "pattern_cards") {
    return {
      id: section.id,
      type: section.type,
      patterns: patterns.map((pattern) => ({
        title: pattern.title,
        body: pattern.body,
        evidence: pattern.sources.slice(0, 4).map((source, index) => ({
          id: stableId(source.type, source.written_at, source.context_label, String(index)),
          type: source.type === "chat" ? ("chat" as const) : ("note" as const),
          label: source.context_label,
          excerpt: compactText(source.context_excerpt) ?? source.context_label,
          written_at: source.written_at,
        })),
      })),
    }
  }

  if (section.type === "source_panel") {
    return {
      id: section.id,
      type: section.type,
      panels: [
        {
          title: "evidence on record",
          sources: evidenceFromInput(input).slice(0, 10),
        },
      ],
    }
  }

  const evidence = evidenceFromInput(input)
  const observations =
    patterns.length > 0
      ? patterns.slice(0, 5).map((pattern) => ({
          title: pattern.title,
          body: pattern.body,
        evidence: pattern.sources.slice(0, 3).map((source, index) => ({
          id: stableId(source.type, source.written_at, source.context_label, String(index)),
          type: source.type === "chat" ? ("chat" as const) : ("note" as const),
          label: source.context_label,
          excerpt: compactText(source.context_excerpt) ?? source.context_label,
          written_at: source.written_at,
        })),
      }))
      : [
          {
            title: "not enough pattern evidence yet",
            body: "this view has the structure ready, but needs more saved blocks, notes, or chat messages before it can say much.",
            evidence: evidence.slice(0, 2),
          },
        ]

  return { id: section.id, type: section.type, observations }
}

export function buildDashboardViewResult(
  spec: DashboardViewSpec,
  input: DashboardSkillInput,
): DashboardViewResult {
  const window = dateWindow(input)
  return validateDashboardViewResult({
    version: 1,
    generated_at: new Date().toISOString(),
    input_window_start: window.start,
    input_window_end: window.end,
    sections: spec.sections.map((section) => sectionResult(section, input)),
  })
}
