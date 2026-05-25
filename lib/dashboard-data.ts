import type {
  CompanionMessage,
  CompanionMessageInsight,
  EvidenceClaim,
  TimeBlock,
  TimeBlockCategory,
  TimeBlockInsight,
} from "@/lib/types"
import { quoteEvidence } from "@/lib/evidence-claims"
import { blockEvidenceLabel } from "@/lib/note-insights"

export interface DayBucket {
  date: string // YYYY-MM-DD in user's local time
  count: number
  totalMinutes: number
  blocks: TimeBlock[]
}

export interface CategoryStat {
  categorySlug: TimeBlockCategory | null
  category: string
  count: number
  totalMinutes: number
}

export interface WeekdayStat {
  weekday: number // 0 = Sunday
  label: string
  count: number
  totalMinutes: number
}

export interface HourStat {
  hour: number // 0–23
  count: number
}

export interface ChatMirrorObservation {
  title: string
  body: string
  evidence: string
  sources: MirrorSource[]
}

export interface NotesMirrorObservation {
  title: string
  body: string
  evidence: string
  sources: MirrorSource[]
}

export interface MirrorSource {
  type: "note" | "chat"
  written_at: string
  context_label: string
  exact_text: string
  context_excerpt: string
  full_text?: string
}

export interface WorkPatternObservation {
  key: string
  title: string
  body: string
  count: number
  sources: MirrorSource[]
}

const WEEKDAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

export function localDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function durationMinutes(block: TimeBlock): number {
  if (typeof block.duration_seconds === "number") {
    return Math.round(block.duration_seconds / 60)
  }

  if (!block.ended_at) {
    return 0
  }

  const startedAt = new Date(block.started_at).getTime()
  const endedAt = new Date(block.ended_at).getTime()

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt <= startedAt) {
    return 0
  }

  return Math.round((endedAt - startedAt) / 60_000)
}

export interface DailyTimelineItem {
  block: TimeBlock
  startMinutes: number
  durationMinutes: number
  topPercent: number
  heightPercent: number
}

function categoryLabel(category: TimeBlockCategory | null): string {
  return category?.replace("_", " ") ?? "uncategorized"
}

/** Bucket time blocks by local calendar day. */
export function bucketByDay(blocks: TimeBlock[]): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>()
  for (const block of blocks) {
    const key = localDateKey(block.started_at)
    const bucket = map.get(key) ?? {
      date: key,
      count: 0,
      totalMinutes: 0,
      blocks: [],
    }
    bucket.count += 1
    bucket.totalMinutes += durationMinutes(block)
    bucket.blocks.push(block)
    map.set(key, bucket)
  }
  return map
}

export function blocksForLocalDate(blocks: TimeBlock[], dateKey: string): TimeBlock[] {
  return blocks
    .filter((block) => localDateKey(block.started_at) === dateKey)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    )
}

export function buildDailyTimelineItems(blocks: TimeBlock[]): DailyTimelineItem[] {
  return blocks
    .map((block) => {
      const startedAt = new Date(block.started_at)
      const startedMs = startedAt.getTime()

      if (Number.isNaN(startedMs)) {
        return null
      }

      let duration = durationMinutes(block)

      if (!duration && block.ended_at) {
        const endedMs = new Date(block.ended_at).getTime()
        if (!Number.isNaN(endedMs) && endedMs > startedMs) {
          duration = Math.max(1, Math.round((endedMs - startedMs) / 60_000))
        }
      }

      if (duration <= 0) {
        return null
      }

      const startMinutes = startedAt.getHours() * 60 + startedAt.getMinutes()
      const dayMinutes = 24 * 60
      const clampedDuration = Math.min(duration, dayMinutes - startMinutes)

      if (clampedDuration <= 0) {
        return null
      }

      return {
        block,
        startMinutes,
        durationMinutes: clampedDuration,
        topPercent: (startMinutes / dayMinutes) * 100,
        heightPercent: (clampedDuration / dayMinutes) * 100,
      }
    })
    .filter((item): item is DailyTimelineItem => item !== null)
    .sort((a, b) => a.startMinutes - b.startMinutes)
}

/** Aggregate by category (blocks without category go under "uncategorized"). */
export function aggregateByCategory(blocks: TimeBlock[]): CategoryStat[] {
  const map = new Map<string, CategoryStat>()
  for (const block of blocks) {
    const key = block.category ?? "uncategorized"
    const stat = map.get(key) ?? {
      categorySlug: block.category,
      category: categoryLabel(block.category),
      count: 0,
      totalMinutes: 0,
    }
    stat.count += 1
    stat.totalMinutes += durationMinutes(block)
    map.set(key, stat)
  }
  return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes)
}

/** Aggregate by day-of-week to surface weekly rhythm. */
export function aggregateByWeekday(blocks: TimeBlock[]): WeekdayStat[] {
  const stats: WeekdayStat[] = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    count: 0,
    totalMinutes: 0,
  }))
  for (const block of blocks) {
    const wd = new Date(block.started_at).getDay()
    stats[wd].count += 1
    stats[wd].totalMinutes += durationMinutes(block)
  }
  return stats
}

/** Aggregate by hour to surface time-of-day patterns. */
export function aggregateByHour(blocks: TimeBlock[]): HourStat[] {
  const stats: HourStat[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }))
  for (const block of blocks) {
    const h = new Date(block.started_at).getHours()
    stats[h].count += 1
  }
  return stats
}

/** Build the grid of days for a given month, including leading/trailing blanks. */
export interface CalendarCell {
  dateKey: string | null // null = blank cell from prev/next month
  day: number | null
  bucket: DayBucket | null
  isToday: boolean
}

export function buildCalendarGrid(
  year: number,
  month: number, // 0-indexed
  buckets: Map<string, DayBucket>
): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey = localDateKey(new Date().toISOString())

  const cells: CalendarCell[] = []
  // Leading blanks
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ dateKey: null, day: null, bucket: null, isToday: false })
  }
  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const m = String(month + 1).padStart(2, "0")
    const d = String(day).padStart(2, "0")
    const dateKey = `${year}-${m}-${d}`
    cells.push({
      dateKey,
      day,
      bucket: buckets.get(dateKey) ?? null,
      isToday: dateKey === todayKey,
    })
  }
  // Trailing blanks to complete the last row
  while (cells.length % 7 !== 0) {
    cells.push({ dateKey: null, day: null, bucket: null, isToday: false })
  }
  return cells
}

export function totalsFor(blocks: TimeBlock[]) {
  const distinctDays = new Set<string>()
  let totalMinutes = 0
  for (const block of blocks) {
    distinctDays.add(localDateKey(block.started_at))
    totalMinutes += durationMinutes(block)
  }
  return {
    totalBlocks: blocks.length,
    distinctDays: distinctDays.size,
    totalMinutes,
  }
}

function insightExcerpt(value: string | null) {
  if (!value) return "no excerpt"
  return value.length > 140 ? `${value.slice(0, 137)}...` : value
}

function claimForFields(
  insight: { evidence_claims?: EvidenceClaim[]; evidence_excerpt: string | null },
  fields: string[],
) {
  return insight.evidence_claims?.find((claim) => fields.includes(claim.source_field)) ?? null
}

function sourceExcerpt(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim()
  if (!cleaned) return "no excerpt"
  return cleaned.length > 260 ? `${cleaned.slice(0, 257)}...` : cleaned
}

function noteSource(
  insight: TimeBlockInsight,
  block: TimeBlock | undefined,
  fields: string[],
  noteVersionCreatedAtById: Map<string, string>,
): MirrorSource {
  const claim = claimForFields(insight, fields)
  const fallbackText = insightExcerpt(insight.evidence_excerpt)

  return {
    type: "note",
    written_at:
      (insight.note_version_id ? noteVersionCreatedAtById.get(insight.note_version_id) : null) ??
      insight.created_at ??
      block?.updated_at ??
      block?.started_at ??
      new Date(0).toISOString(),
    context_label: block ? blockEvidenceLabel(block) : "saved block",
    exact_text: claim?.text?.trim() || fallbackText,
    context_excerpt: sourceExcerpt(claim?.context_excerpt || insight.source_notes || block?.notes || insight.evidence_excerpt),
    full_text: insight.source_notes || block?.notes || undefined,
  }
}

function noteSourcesFor(
  insights: TimeBlockInsight[],
  blocksById: Map<string, TimeBlock>,
  fields: string[],
  noteVersionCreatedAtById: Map<string, string>,
) {
  return insights
    .filter((insight) => blocksById.has(insight.time_block_id))
    .map((insight) =>
      noteSource(insight, blocksById.get(insight.time_block_id), fields, noteVersionCreatedAtById),
    )
}

function chatSource(
  insight: CompanionMessageInsight,
  blocksById: Map<string, TimeBlock>,
  messagesById: Map<string, CompanionMessage>,
  fields: string[],
): MirrorSource {
  const claim = claimForFields(insight, fields)
  const message = messagesById.get(insight.message_id)
  const fallbackText = insightExcerpt(insight.evidence_excerpt)

  return {
    type: "chat",
    written_at: message?.created_at ?? insight.created_at,
    context_label: chatEvidenceLabel(insight, blocksById),
    exact_text: claim?.text?.trim() || fallbackText,
    context_excerpt: sourceExcerpt(claim?.context_excerpt || message?.content || insight.evidence_excerpt),
    full_text: message?.content,
  }
}

function chatSourcesFor(
  insights: CompanionMessageInsight[],
  blocksById: Map<string, TimeBlock>,
  messagesById: Map<string, CompanionMessage>,
  fields: string[],
) {
  return insights.map((insight) => chatSource(insight, blocksById, messagesById, fields))
}

function noteEvidence(
  insight: TimeBlockInsight,
  block: TimeBlock | undefined,
  fields: string[],
) {
  const claim = claimForFields(insight, fields)
  return `${block ? blockEvidenceLabel(block) : "saved block"}: ${
    claim ? quoteEvidence(claim.text) : quoteEvidence(insightExcerpt(insight.evidence_excerpt))
  }`
}

export function buildNotesMirrorObservations(
  blocks: TimeBlock[],
  insights: TimeBlockInsight[],
  noteVersionCreatedAtById = new Map<string, string>(),
): NotesMirrorObservation[] {
  const byBlock = new Map(blocks.map((block) => [block.id, block]))
  const observations: NotesMirrorObservation[] = []
  const friction = insights.filter(
    (insight) => insight.friction_points.length > 0 || insight.avoidance_signals.length > 0,
  )
  const hyperfocus = insights.filter((insight) => insight.hyperfocus_signals.length > 0)
  const satisfaction = insights.filter((insight) => insight.satisfaction_signals.length > 0)
  const flatTone = insights.filter((insight) =>
    ["flat", "anxious", "self-critical", "frustrated"].includes(insight.emotional_tone ?? ""),
  )

  const firstFriction = friction.find((insight) => byBlock.has(insight.time_block_id))
  if (firstFriction) {
    const block = byBlock.get(firstFriction.time_block_id)
    const fields = ["friction_points", "avoidance_signals"]
    const sources = noteSourcesFor(friction, byBlock, fields, noteVersionCreatedAtById)
    observations.push({
      title: "recurring friction",
      body: `${friction.length} note${friction.length === 1 ? "" : "s"} mention friction, avoidance, or getting stuck.`,
      evidence: noteEvidence(firstFriction, block, fields),
      sources,
    })
  }

  const firstHyperfocus = hyperfocus.find((insight) => byBlock.has(insight.time_block_id))
  if (firstHyperfocus) {
    const block = byBlock.get(firstHyperfocus.time_block_id)
    const fields = ["hyperfocus_signals"]
    const sources = noteSourcesFor(hyperfocus, byBlock, fields, noteVersionCreatedAtById)
    observations.push({
      title: "deep focus signals",
      body: `${hyperfocus.length} note${hyperfocus.length === 1 ? "" : "s"} mention hyperfocus, flow, or losing track of time.`,
      evidence: noteEvidence(firstHyperfocus, block, fields),
      sources,
    })
  }

  const firstSatisfaction = satisfaction.find((insight) => byBlock.has(insight.time_block_id))
  if (firstSatisfaction) {
    const block = byBlock.get(firstSatisfaction.time_block_id)
    const fields = ["satisfaction_signals"]
    const sources = noteSourcesFor(satisfaction, byBlock, fields, noteVersionCreatedAtById)
    observations.push({
      title: "satisfying threads",
      body: `${satisfaction.length} note${satisfaction.length === 1 ? "" : "s"} carry relief, pride, or reward language.`,
      evidence: noteEvidence(firstSatisfaction, block, fields),
      sources,
    })
  }

  const firstFlat = flatTone.find((insight) => byBlock.has(insight.time_block_id))
  if (firstFlat) {
    const block = byBlock.get(firstFlat.time_block_id)
    const fields = ["friction_points", "uncertainty_signals", "avoidance_signals"]
    const sources = noteSourcesFor(flatTone, byBlock, fields, noteVersionCreatedAtById)
    observations.push({
      title: "emotional weather",
      body: `${flatTone.length} note${flatTone.length === 1 ? "" : "s"} skew ${firstFlat.emotional_tone}.`,
      evidence: noteEvidence(firstFlat, block, fields),
      sources,
    })
  }

  if (observations.length === 0) {
    const notedBlocks = blocks.filter((block) => block.notes?.trim())
    const block = notedBlocks[0]
    if (block) {
      observations.push({
        title: "notes are coming through",
        body: `${notedBlocks.length} block${notedBlocks.length === 1 ? "" : "s"} have reflection notes ready for pattern-finding.`,
        evidence: notedBlocks
          .slice(0, 2)
          .map((notedBlock) =>
            `${blockEvidenceLabel(notedBlock)}: ${quoteEvidence(insightExcerpt(notedBlock.notes))}`,
          )
          .join(" · "),
        sources: notedBlocks.map((notedBlock) => ({
          type: "note",
          written_at: notedBlock.updated_at ?? notedBlock.started_at,
          context_label: blockEvidenceLabel(notedBlock),
          exact_text: insightExcerpt(notedBlock.notes),
          context_excerpt: sourceExcerpt(notedBlock.notes),
          full_text: notedBlock.notes ?? undefined,
        })),
      })
    }
  }

  return observations.slice(0, 3)
}

function chatEvidence(
  insight: CompanionMessageInsight,
  blocksById: Map<string, TimeBlock>,
  fields: string[],
) {
  const claim = claimForFields(insight, fields)
  return `${chatEvidenceLabel(insight, blocksById)}: ${
    claim ? quoteEvidence(claim.text) : quoteEvidence(insightExcerpt(insight.evidence_excerpt))
  }`
}

function blockLabel(block: TimeBlock) {
  const date = new Date(block.started_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })
  return `${date}, ${block.task_name ?? "unnamed block"}`
}

function chatEvidenceLabel(insight: CompanionMessageInsight, blocksById: Map<string, TimeBlock>) {
  if (insight.related_time_block_id) {
    const block = blocksById.get(insight.related_time_block_id)
    return block ? `chat about ${blockLabel(block)}` : "block-linked chat"
  }

  return "general chat"
}

export function buildChatMirrorObservations(
  insights: CompanionMessageInsight[],
  blocks: TimeBlock[] = [],
  messages: CompanionMessage[] = [],
): ChatMirrorObservation[] {
  const blocksById = new Map(blocks.map((block) => [block.id, block]))
  const messagesById = new Map(messages.map((message) => [message.id, message]))
  const chatSources = (items: CompanionMessageInsight[], fields: string[]) =>
    chatSourcesFor(items, blocksById, messagesById, fields)
  const observations: ChatMirrorObservation[] = []
  const withEvidence = insights.filter((insight) => insight.evidence_excerpt?.trim() || insight.evidence_claims?.length)
  const mismatch = withEvidence.filter(
    (insight) => insight.mismatch_signals.length > 0 || insight.themes.includes("mismatch"),
  )
  const intention = withEvidence.filter(
    (insight) => insight.intended_actions.length > 0 || insight.avoided_or_deferred.length > 0,
  )
  const drift = withEvidence.filter(
    (insight) => insight.useful_drift.length > 0 || insight.themes.includes("useful drift"),
  )
  const friction = withEvidence.filter(
    (insight) => insight.friction_points.length > 0 || insight.avoided_or_deferred.length > 0,
  )
  const emotion = withEvidence.filter((insight) => insight.emotional_signals.length > 0)

  const firstMismatch = mismatch[0]
  if (firstMismatch) {
    const fields = ["mismatch_signals"]
    observations.push({
      title: "what counted but didn't feel counted",
      body: `${mismatch.length} chat message${mismatch.length === 1 ? "" : "s"} mention a gap between what happened and what felt real.`,
      evidence: chatEvidence(firstMismatch, blocksById, fields),
      sources: chatSources(mismatch, fields),
    })
  }

  const firstIntention = intention[0]
  if (firstIntention) {
    const fields = ["intended_actions", "avoided_or_deferred"]
    observations.push({
      title: "intended versus actual",
      body: `${intention.length} chat message${intention.length === 1 ? "" : "s"} name an intention, deferral, or avoided task explicitly.`,
      evidence: chatEvidence(firstIntention, blocksById, fields),
      sources: chatSources(intention, fields),
    })
  }

  const firstDrift = drift[0]
  if (firstDrift) {
    const fields = ["useful_drift"]
    observations.push({
      title: "useful drift",
      body: `${drift.length} chat message${drift.length === 1 ? "" : "s"} describe a sidetrack that still produced something useful.`,
      evidence: chatEvidence(firstDrift, blocksById, fields),
      sources: chatSources(drift, fields),
    })
  }

  const firstFriction = friction.find((insight) => !observations.some((item) => item.evidence.includes(insightExcerpt(insight.evidence_excerpt))))
  if (firstFriction) {
    const fields = ["friction_points", "avoided_or_deferred"]
    observations.push({
      title: "recurring friction language",
      body: `${friction.length} chat message${friction.length === 1 ? "" : "s"} use friction, avoidance, or stuck language.`,
      evidence: chatEvidence(firstFriction, blocksById, fields),
      sources: chatSources(friction, fields),
    })
  }

  const firstEmotion = emotion.find((insight) => !observations.some((item) => item.evidence.includes(insightExcerpt(insight.evidence_excerpt))))
  if (firstEmotion) {
    const fields = ["emotional_signals"]
    observations.push({
      title: "emotional weather",
      body: `${emotion.length} chat message${emotion.length === 1 ? "" : "s"} carry explicit feeling language.`,
      evidence: chatEvidence(firstEmotion, blocksById, fields),
      sources: chatSources(emotion, fields),
    })
  }

  return observations.slice(0, 4)
}

function blockSource(block: TimeBlock): MirrorSource | null {
  const text = block.notes?.trim() || block.task_name?.trim() || block.category?.trim()
  if (!text) return null

  return {
    type: "note",
    written_at: block.updated_at ?? block.started_at,
    context_label: blockEvidenceLabel(block),
    exact_text: insightExcerpt(text),
    context_excerpt: sourceExcerpt(block.notes || block.task_name || block.category),
    full_text: block.notes ?? undefined,
  }
}

function uniqueSources(sources: MirrorSource[]) {
  const seen = new Set<string>()
  return sources.filter((source) => {
    const key = `${source.type}:${source.written_at}:${source.context_label}:${source.exact_text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildWorkPatternObservations({
  blocks,
  noteInsights,
  chatInsights,
  messages = [],
  noteVersionCreatedAtById = new Map<string, string>(),
}: {
  blocks: TimeBlock[]
  noteInsights: TimeBlockInsight[]
  chatInsights: CompanionMessageInsight[]
  messages?: CompanionMessage[]
  noteVersionCreatedAtById?: Map<string, string>
}): WorkPatternObservation[] {
  const blocksById = new Map(blocks.map((block) => [block.id, block]))
  const messagesById = new Map(messages.map((message) => [message.id, message]))
  const patterns: WorkPatternObservation[] = []
  const addPattern = (pattern: WorkPatternObservation) => {
    if (pattern.count > 0) {
      patterns.push({
        ...pattern,
        sources: uniqueSources(pattern.sources),
      })
    }
  }

  const noteFriction = noteInsights.filter(
    (insight) => insight.friction_points.length > 0 || insight.avoidance_signals.length > 0,
  )
  const chatFriction = chatInsights.filter(
    (insight) => insight.friction_points.length > 0 || insight.avoided_or_deferred.length > 0,
  )
  addPattern({
    key: "friction",
    title: "friction and avoidance",
    body: `${noteFriction.length} note${noteFriction.length === 1 ? "" : "s"} and ${chatFriction.length} chat message${chatFriction.length === 1 ? "" : "s"} point to stuck, blocked, deferred, or avoided work.`,
    count: noteFriction.length + chatFriction.length,
    sources: [
      ...noteSourcesFor(noteFriction, blocksById, ["friction_points", "avoidance_signals"], noteVersionCreatedAtById),
      ...chatSourcesFor(chatFriction, blocksById, messagesById, ["friction_points", "avoided_or_deferred"]),
    ],
  })

  const intention = chatInsights.filter(
    (insight) =>
      insight.intended_actions.length > 0 ||
      insight.avoided_or_deferred.length > 0 ||
      insight.mismatch_signals.length > 0 ||
      insight.themes.includes("mismatch"),
  )
  addPattern({
    key: "intention-gap",
    title: "intention gaps",
    body: `${intention.length} chat message${intention.length === 1 ? "" : "s"} separate what you meant to do from what actually felt done.`,
    count: intention.length,
    sources: chatSourcesFor(intention, blocksById, messagesById, [
      "intended_actions",
      "avoided_or_deferred",
      "mismatch_signals",
    ]),
  })

  const usefulDrift = chatInsights.filter(
    (insight) => insight.useful_drift.length > 0 || insight.themes.includes("useful drift"),
  )
  addPattern({
    key: "useful-drift",
    title: "useful drift",
    body: `${usefulDrift.length} chat message${usefulDrift.length === 1 ? "" : "s"} describe sidetracks that still produced something useful.`,
    count: usefulDrift.length,
    sources: chatSourcesFor(usefulDrift, blocksById, messagesById, ["useful_drift"]),
  })

  const focusNotes = noteInsights.filter((insight) => insight.hyperfocus_signals.length > 0)
  const focusBlocks = blocks.filter((block) => block.hyperfocus_marker)
  addPattern({
    key: "deep-focus",
    title: "deep focus",
    body: `${focusNotes.length + focusBlocks.length} saved record${focusNotes.length + focusBlocks.length === 1 ? "" : "s"} mention flow, hyperfocus, or losing track of time.`,
    count: focusNotes.length + focusBlocks.length,
    sources: [
      ...noteSourcesFor(focusNotes, blocksById, ["hyperfocus_signals"], noteVersionCreatedAtById),
      ...focusBlocks.map(blockSource).filter((source): source is MirrorSource => Boolean(source)),
    ],
  })

  const rewardNotes = noteInsights.filter((insight) => insight.satisfaction_signals.length > 0)
  const rewardBlocks = blocks.filter((block) => block.satisfaction === "satisfied" || block.satisfaction === "mixed")
  addPattern({
    key: "reward",
    title: "reward and payoff",
    body: `${rewardNotes.length + rewardBlocks.length} saved record${rewardNotes.length + rewardBlocks.length === 1 ? "" : "s"} include relief, pride, satisfaction, or mixed-but-worthwhile payoff.`,
    count: rewardNotes.length + rewardBlocks.length,
    sources: [
      ...noteSourcesFor(rewardNotes, blocksById, ["satisfaction_signals"], noteVersionCreatedAtById),
      ...rewardBlocks.map(blockSource).filter((source): source is MirrorSource => Boolean(source)),
    ],
  })

  const noteEmotion = noteInsights.filter(
    (insight) =>
      ["flat", "anxious", "self-critical", "frustrated"].includes(insight.emotional_tone ?? "") ||
      insight.uncertainty_signals.length > 0,
  )
  const chatEmotion = chatInsights.filter((insight) => insight.emotional_signals.length > 0)
  addPattern({
    key: "emotional-load",
    title: "emotional load",
    body: `${noteEmotion.length} note${noteEmotion.length === 1 ? "" : "s"} and ${chatEmotion.length} chat message${chatEmotion.length === 1 ? "" : "s"} carry anxious, flat, frustrated, self-critical, uncertain, or feeling-heavy language.`,
    count: noteEmotion.length + chatEmotion.length,
    sources: [
      ...noteSourcesFor(noteEmotion, blocksById, ["friction_points", "uncertainty_signals", "avoidance_signals"], noteVersionCreatedAtById),
      ...chatSourcesFor(chatEmotion, blocksById, messagesById, ["emotional_signals"]),
    ],
  })

  const effortBlocks = blocks.filter((block) => block.effort_level === "hard" || block.effort_level === "grind")
  addPattern({
    key: "high-effort",
    title: "high effort blocks",
    body: `${effortBlocks.length} block${effortBlocks.length === 1 ? "" : "s"} were marked hard or grind.`,
    count: effortBlocks.length,
    sources: effortBlocks.map(blockSource).filter((source): source is MirrorSource => Boolean(source)),
  })

  const noveltyBlocks = blocks.filter((block) => block.novelty_marker)
  addPattern({
    key: "novelty",
    title: "novelty and switching",
    body: `${noveltyBlocks.length} block${noveltyBlocks.length === 1 ? "" : "s"} were marked as novelty-seeking or trying something new.`,
    count: noveltyBlocks.length,
    sources: noveltyBlocks.map(blockSource).filter((source): source is MirrorSource => Boolean(source)),
  })

  return patterns
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

/* ─────────────────── Productivity Pattern Stats ─────────────────── */

export interface MarkerStat {
  label: string
  key: "avoidance" | "hyperfocus" | "guilt" | "novelty"
  count: number
  pct: number
  description: string
}

export function aggregateMarkers(blocks: TimeBlock[]): MarkerStat[] {
  const total = blocks.length
  if (total === 0) {
    return [
      { label: "avoidance conquered", key: "avoidance", count: 0, pct: 0, description: "tasks you were putting off" },
      { label: "hyperfocus sessions", key: "hyperfocus", count: 0, pct: 0, description: "deep flow states" },
      { label: "guilt moments", key: "guilt", count: 0, pct: 0, description: "self-critical entries" },
      { label: "novelty seeking", key: "novelty", count: 0, pct: 0, description: "trying new things" },
    ]
  }

  const avoidance = blocks.filter((block) => block.avoidance_marker).length
  const hyperfocus = blocks.filter((block) => block.hyperfocus_marker).length
  const guilt = blocks.filter((block) => block.guilt_marker).length
  const novelty = blocks.filter((block) => block.novelty_marker).length

  return [
    { label: "avoidance conquered", key: "avoidance", count: avoidance, pct: Math.round((avoidance / total) * 100), description: "tasks you were putting off" },
    { label: "hyperfocus sessions", key: "hyperfocus", count: hyperfocus, pct: Math.round((hyperfocus / total) * 100), description: "deep flow states" },
    { label: "guilt moments", key: "guilt", count: guilt, pct: Math.round((guilt / total) * 100), description: "self-critical entries" },
    { label: "novelty seeking", key: "novelty", count: novelty, pct: Math.round((novelty / total) * 100), description: "trying new things" },
  ]
}

export interface EffortStat {
  level: string
  count: number
  pct: number
}

export function aggregateEffort(blocks: TimeBlock[]): EffortStat[] {
  const levels = ["easy", "medium", "hard", "grind"] as const
  const total = blocks.filter((block) => block.effort_level).length
  if (total === 0) {
    return levels.map((level) => ({ level, count: 0, pct: 0 }))
  }
  return levels.map((level) => {
    const count = blocks.filter((block) => block.effort_level === level).length
    return { level, count, pct: Math.round((count / total) * 100) }
  })
}

export interface SatisfactionStat {
  level: string
  count: number
  pct: number
}

export function aggregateSatisfaction(blocks: TimeBlock[]): SatisfactionStat[] {
  const levels = ["satisfied", "mixed", "frustrated", "unclear"] as const
  const total = blocks.filter((block) => block.satisfaction).length
  if (total === 0) {
    return levels.map((level) => ({ level, count: 0, pct: 0 }))
  }
  return levels.map((level) => {
    const count = blocks.filter((block) => block.satisfaction === level).length
    return { level, count, pct: Math.round((count / total) * 100) }
  })
}
