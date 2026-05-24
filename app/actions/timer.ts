"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { generateNoteInsight } from "@/lib/ai-note-insights"
import { getDb } from "@/lib/db/client"
import { invalidateMemoryContextForUser } from "@/lib/memory-context"
import {
  deleteMemoryChunksForTimeBlock,
  indexMemoryForTimeBlock,
  indexMemoryForTimeBlockInsight,
  indexMemoryForTimeBlockNoteVersion,
} from "@/lib/rag/indexer"
import { deriveInsightFromNotes } from "@/lib/note-insights"
import { attachEvidenceSourceId } from "@/lib/evidence-claims"
import { createClient } from "@/lib/supabase/server"
import {
  deleteTimeBlockFromGoogleCalendar,
  syncTimeBlockToGoogleCalendar,
} from "@/lib/google-calendar"
import {
  defaultCategoryColor,
  withDistinctCategoryColors,
} from "@/lib/time-block-display"
import type {
  ActiveTimer,
  CreateCategoryInput,
  CreateCategoryResult,
  DeleteBlockInput,
  DeleteBlockResult,
  GetActiveTimerResult,
  GetCategoriesResult,
  GetCalendarDataInput,
  GetCalendarDataResult,
  ResumeBlockInput,
  ResumeBlockResult,
  SaveBlockInput,
  SaveBlockResult,
  StartTimerInput,
  StopTimerInput,
  StartTimerResult,
  StopTimerResult,
  TimeBlock,
  TimeBlockCategory,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
  TimeBlockNoteVersion,
  EffortLevel,
  Mood,
  NoteVersionSource,
  Satisfaction,
} from "@/lib/types"

type Supabase = Awaited<ReturnType<typeof createClient>>

const MOODS = ["joyful", "neutral", "flat", "anxious", "guilty", "proud"] satisfies Mood[]
const EFFORT_LEVELS = ["easy", "medium", "hard", "grind"] satisfies EffortLevel[]
const SATISFACTION_LEVELS = [
  "satisfied",
  "mixed",
  "frustrated",
  "unclear",
] satisfies Satisfaction[]

function isValidCategorySlug(category: unknown): category is TimeBlockCategory {
  if (typeof category !== "string") {
    return false
  }

  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(category)
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function slugifyCategoryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
}

function isMood(value: unknown): value is Mood {
  return typeof value === "string" && (MOODS as readonly string[]).includes(value)
}

function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value)
}

function isSatisfaction(value: unknown): value is Satisfaction {
  return typeof value === "string" && (SATISFACTION_LEVELS as readonly string[]).includes(value)
}

function parseBlockDate(value: string): Date | null {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

function normalizeHashtags(hashtags: string[] | undefined): string[] {
  if (!hashtags) {
    return []
  }

  return hashtags
    .filter((hashtag) => typeof hashtag === "string")
    .map((hashtag) => hashtag.trim().toLowerCase().replace(/^#+/, ""))
    .filter(Boolean)
}

function validateSaveBlockInput(input: unknown):
  | {
      type: "valid"
      id: string | undefined
      taskName: string
      category: TimeBlockCategory
      categoryId: string | null
      startedAt: string
      endedAt: string
      hashtags: string[]
      notes: string | null
      mood: Mood | null | undefined
      effortLevel: EffortLevel | null | undefined
      satisfaction: Satisfaction | null | undefined
      avoidanceMarker: boolean | undefined
      hyperfocusMarker: boolean | undefined
      guiltMarker: boolean | undefined
      noveltyMarker: boolean | undefined
    }
  | {
      type: "error"
      message: string
    } {
  if (!input || typeof input !== "object") {
    return { type: "error", message: "time block details are invalid." }
  }

  const details = input as Partial<SaveBlockInput>

  if (
    typeof details.task_name !== "string" ||
    typeof details.started_at !== "string" ||
    typeof details.ended_at !== "string"
  ) {
    return { type: "error", message: "time block details are invalid." }
  }

  if (details.hashtags !== undefined && !Array.isArray(details.hashtags)) {
    return { type: "error", message: "hashtags are invalid." }
  }

  if (details.id !== undefined && typeof details.id !== "string") {
    return { type: "error", message: "time block details are invalid." }
  }

  if (details.notes !== undefined && details.notes !== null && typeof details.notes !== "string") {
    return { type: "error", message: "time block details are invalid." }
  }

  const taskName = details.task_name.trim()

  if (!taskName) {
    return { type: "error", message: "task name is required." }
  }

  if (!isValidCategorySlug(details.category)) {
    return { type: "error", message: "category is invalid." }
  }

  if (details.category_id !== undefined && details.category_id !== null && !isValidUuid(details.category_id)) {
    return { type: "error", message: "category is invalid." }
  }

  const startedAt = parseBlockDate(details.started_at)
  const endedAt = parseBlockDate(details.ended_at)

  if (!startedAt || !endedAt) {
    return { type: "error", message: "start and end times must be valid dates." }
  }

  if (endedAt.getTime() <= startedAt.getTime()) {
    return { type: "error", message: "end time must be after start time." }
  }

  const notes = details.notes?.trim() || null
  const id = details.id?.trim() || undefined

  return {
    type: "valid",
    id,
    taskName,
    category: details.category,
    categoryId: details.category_id ?? null,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    hashtags: normalizeHashtags(details.hashtags),
    notes,
    mood: details.mood === undefined ? undefined : isMood(details.mood) ? details.mood : null,
    effortLevel:
      details.effort_level === undefined
        ? undefined
        : isEffortLevel(details.effort_level)
          ? details.effort_level
          : null,
    satisfaction:
      details.satisfaction === undefined
        ? undefined
        : isSatisfaction(details.satisfaction)
          ? details.satisfaction
          : null,
    avoidanceMarker:
      typeof details.avoidance_marker === "boolean" ? details.avoidance_marker : undefined,
    hyperfocusMarker:
      typeof details.hyperfocus_marker === "boolean" ? details.hyperfocus_marker : undefined,
    guiltMarker: typeof details.guilt_marker === "boolean" ? details.guilt_marker : undefined,
    noveltyMarker:
      typeof details.novelty_marker === "boolean" ? details.novelty_marker : undefined,
  }
}

function validateStopTimerInput(input: StopTimerInput | undefined):
  | {
      type: "valid"
      taskName: string | null
      category: TimeBlockCategory | null
      categoryId: string | null
      hashtags: string[]
      notes: string | null
      mood: Mood | null
      effortLevel: EffortLevel | null
      satisfaction: Satisfaction | null
      avoidanceMarker: boolean
      hyperfocusMarker: boolean
      guiltMarker: boolean
      noveltyMarker: boolean
    }
  | {
      type: "error"
      message: string
    } {
  if (input === undefined) {
    return {
      type: "valid",
      taskName: null,
      category: null,
      categoryId: null,
      hashtags: [],
      notes: null,
      mood: null,
      effortLevel: null,
      satisfaction: null,
      avoidanceMarker: false,
      hyperfocusMarker: false,
      guiltMarker: false,
      noveltyMarker: false,
    }
  }

  if (!input || typeof input !== "object") {
    return { type: "error", message: "timer details are invalid." }
  }

  if (input.hashtags !== undefined && !Array.isArray(input.hashtags)) {
    return { type: "error", message: "hashtags are invalid." }
  }

  const taskName = typeof input.task_name === "string" ? input.task_name.trim() : null
  const notes = input.notes?.trim() || null

  if (input.category !== null && input.category !== undefined && !isValidCategorySlug(input.category)) {
    return { type: "error", message: "category is invalid." }
  }

  if (input.category_id !== null && input.category_id !== undefined && !isValidUuid(input.category_id)) {
    return { type: "error", message: "category is invalid." }
  }

  return {
    type: "valid",
    taskName: taskName || null,
    category: input.category ?? null,
    categoryId: input.category_id ?? null,
    hashtags: normalizeHashtags(input.hashtags),
    notes,
    mood: isMood(input.mood) ? input.mood : null,
    effortLevel: isEffortLevel(input.effort_level) ? input.effort_level : null,
    satisfaction: isSatisfaction(input.satisfaction) ? input.satisfaction : null,
    avoidanceMarker: input.avoidance_marker === true,
    hyperfocusMarker: input.hyperfocus_marker === true,
    guiltMarker: input.guilt_marker === true,
    noveltyMarker: input.novelty_marker === true,
  }
}

function validateStartTimerInput(input: StartTimerInput | undefined):
  | {
      type: "valid"
      startedAt: string
      taskName: string | null
      category: TimeBlockCategory | null
      categoryId: string | null
      hashtags: string[]
      notes: string | null
      mood: Mood | null
      effortLevel: EffortLevel | null
      satisfaction: Satisfaction | null
      avoidanceMarker: boolean
      hyperfocusMarker: boolean
      guiltMarker: boolean
      noveltyMarker: boolean
      shouldCreateOpenBlock: boolean
    }
  | {
      type: "error"
      message: string
    } {
  if (input === undefined) {
    return {
      type: "valid",
      startedAt: new Date().toISOString(),
      taskName: null,
      category: null,
      categoryId: null,
      hashtags: [],
      notes: null,
      mood: null,
      effortLevel: null,
      satisfaction: null,
      avoidanceMarker: false,
      hyperfocusMarker: false,
      guiltMarker: false,
      noveltyMarker: false,
      shouldCreateOpenBlock: false,
    }
  }

  if (!input || typeof input !== "object") {
    return { type: "error", message: "timer details are invalid." }
  }

  if (input.hashtags !== undefined && !Array.isArray(input.hashtags)) {
    return { type: "error", message: "hashtags are invalid." }
  }

  const startedAt = input.started_at ? parseBlockDate(input.started_at) : new Date()

  if (!startedAt) {
    return { type: "error", message: "timer start time must be a valid date." }
  }

  if (startedAt.getTime() > Date.now() + 5_000) {
    return { type: "error", message: "timer start time can't be in the future." }
  }

  if (input.category !== null && input.category !== undefined && !isValidCategorySlug(input.category)) {
    return { type: "error", message: "category is invalid." }
  }

  if (input.category_id !== null && input.category_id !== undefined && !isValidUuid(input.category_id)) {
    return { type: "error", message: "category is invalid." }
  }

  const taskName = typeof input.task_name === "string" ? input.task_name.trim() : null
  const notes = input.notes?.trim() || null
  const hashtags = normalizeHashtags(input.hashtags)
  const shouldCreateOpenBlock = Boolean(
    taskName ||
      input.category ||
      input.category_id ||
      hashtags.length > 0 ||
      notes ||
      input.mood ||
      input.effort_level ||
      input.satisfaction ||
      input.avoidance_marker ||
      input.hyperfocus_marker ||
      input.guilt_marker ||
      input.novelty_marker,
  )

  return {
    type: "valid",
    startedAt: startedAt.toISOString(),
    taskName: taskName || null,
    category: input.category ?? null,
    categoryId: input.category_id ?? null,
    hashtags,
    notes,
    mood: isMood(input.mood) ? input.mood : null,
    effortLevel: isEffortLevel(input.effort_level) ? input.effort_level : null,
    satisfaction: isSatisfaction(input.satisfaction) ? input.satisfaction : null,
    avoidanceMarker: input.avoidance_marker === true,
    hyperfocusMarker: input.hyperfocus_marker === true,
    guiltMarker: input.guilt_marker === true,
    noveltyMarker: input.novelty_marker === true,
    shouldCreateOpenBlock,
  }
}

function validateDeleteBlockInput(input: unknown):
  | {
      type: "valid"
      id: string
    }
  | {
      type: "error"
      message: string
    } {
  if (!input || typeof input !== "object") {
    return { type: "error", message: "time block id is required." }
  }

  const details = input as Partial<DeleteBlockInput>

  if (typeof details.id !== "string" || !details.id.trim()) {
    return { type: "error", message: "time block id is required." }
  }

  return {
    type: "valid",
    id: details.id.trim(),
  }
}

function validateResumeBlockInput(input: unknown):
  | {
      type: "valid"
      id: string
    }
  | {
      type: "error"
      message: string
    } {
  if (!input || typeof input !== "object") {
    return { type: "error", message: "time block id is required." }
  }

  const details = input as Partial<ResumeBlockInput>

  if (typeof details.id !== "string" || !details.id.trim()) {
    return { type: "error", message: "time block id is required." }
  }

  return {
    type: "valid",
    id: details.id.trim(),
  }
}

function validateGetCalendarDataInput(input: unknown):
  | {
      type: "valid"
      start: string
      end: string
    }
  | {
      type: "error"
      message: string
    } {
  if (!input || typeof input !== "object") {
    return { type: "error", message: "date range is required." }
  }

  const details = input as Partial<GetCalendarDataInput>

  if (typeof details.start !== "string" || typeof details.end !== "string") {
    return { type: "error", message: "start and end dates are required." }
  }

  const start = parseBlockDate(details.start)
  const end = parseBlockDate(details.end)

  if (!start || !end) {
    return { type: "error", message: "start and end dates must be valid dates." }
  }

  if (end.getTime() <= start.getTime()) {
    return { type: "error", message: "end date must be after start date." }
  }

  return {
    type: "valid",
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function normalizeNotes(value: string | null | undefined) {
  return value?.trim() || null
}

function notesChanged(previousNotes: string | null | undefined, newNotes: string | null | undefined) {
  return normalizeNotes(previousNotes) !== normalizeNotes(newNotes)
}

function noteSourceFromInput(source: NoteVersionSource | undefined): NoteVersionSource {
  return source === "chat" || source === "agent" ? source : "manual"
}

function deriveMarkersFromNotes(notes: string | null | undefined) {
  const insight = deriveInsightFromNotes(notes ?? null)

  return {
    avoidance: Boolean(insight?.avoidance_signals.length),
    hyperfocus: Boolean(insight?.hyperfocus_signals.length),
    guilt: insight?.emotional_tone === "self-critical" || Boolean(insight?.uncertainty_signals.length),
  }
}

async function preserveNoteVersion(
  supabase: Supabase,
  userId: string,
  timeBlockId: string,
  previousNotes: string | null | undefined,
  newNotes: string | null | undefined,
  source: NoteVersionSource,
) {
  const previous = normalizeNotes(previousNotes)
  const next = normalizeNotes(newNotes)

  if (previous === next || (!previous && !next)) {
    return null
  }

  const { data } = await supabase
    .from("time_block_note_versions")
    .insert({
      time_block_id: timeBlockId,
      user_id: userId,
      previous_notes: previous,
      new_notes: next,
      source,
    })
    .select("id")
    .single()

  return (data as { id: string } | null)?.id ?? null
}

async function storeNoteInsightAfterResponse(
  userId: string,
  timeBlock: TimeBlock,
  noteVersionId: string | null,
) {
  const insight = await generateNoteInsight(timeBlock)
  const db = getDb()

  if (!insight) {
    await db
      .deleteFrom("time_block_insights")
      .where("time_block_id", "=", timeBlock.id)
      .where("user_id", "=", userId)
      .execute()
    return
  }

  const values = {
    time_block_id: timeBlock.id,
    note_version_id: noteVersionId,
    user_id: userId,
    source_notes: normalizeNotes(timeBlock.notes),
    ...insight,
    evidence_claims: attachEvidenceSourceId(
      insight.evidence_claims,
      noteVersionId ?? timeBlock.id,
    ),
  }

  await db
    .insertInto("time_block_insights")
    .values(values)
    .onConflict((oc) =>
      oc.column("time_block_id").doUpdateSet({
        note_version_id: values.note_version_id,
        source_notes: values.source_notes,
        actions: values.actions,
        emotional_tone: values.emotional_tone,
        friction_points: values.friction_points,
        avoidance_signals: values.avoidance_signals,
        hyperfocus_signals: values.hyperfocus_signals,
        satisfaction_signals: values.satisfaction_signals,
        uncertainty_signals: values.uncertainty_signals,
        people: values.people,
        projects: values.projects,
        themes: values.themes,
        evidence_excerpt: values.evidence_excerpt,
        evidence_claims: values.evidence_claims,
        model_version: values.model_version,
      }),
    )
    .execute()

  const stored = await db
    .selectFrom("time_block_insights")
    .selectAll()
    .where("time_block_id", "=", timeBlock.id)
    .where("user_id", "=", userId)
    .executeTakeFirst()

  if (stored) {
    await indexMemoryForTimeBlockInsight(stored as TimeBlockInsight)
  }
}

async function preserveNotesAndInsights(
  supabase: Supabase,
  userId: string,
  timeBlock: TimeBlock,
  previousNotes: string | null | undefined,
  source: NoteVersionSource,
) {
  if (!notesChanged(previousNotes, timeBlock.notes)) {
    return
  }

  const noteVersionId = await preserveNoteVersion(
    supabase,
    userId,
    timeBlock.id,
    previousNotes,
    timeBlock.notes,
    source,
  )
  if (noteVersionId) {
    const { data: noteVersion } = await supabase
      .from("time_block_note_versions")
      .select("*")
      .eq("id", noteVersionId)
      .eq("user_id", userId)
      .maybeSingle()
    if (noteVersion) {
      after(() =>
        indexMemoryForTimeBlockNoteVersion(
          noteVersion as TimeBlockNoteVersion,
        ).catch((error) => {
          console.error("failed to index note version memory", error)
        }),
      )
    }
  }
  after(() =>
    storeNoteInsightAfterResponse(userId, timeBlock, noteVersionId).catch((error) => {
      console.error("failed to store note insight", error)
    }),
  )
}

function syncCalendarAfterResponse(userId: string, timeBlock: TimeBlock) {
  after(() =>
    syncTimeBlockToGoogleCalendar(userId, timeBlock).catch((error) => {
      console.error("failed to sync time block to google calendar", error)
    }),
  )
}

function indexTimeBlockAfterResponse(timeBlock: TimeBlock) {
  after(() =>
    indexMemoryForTimeBlock(timeBlock).catch((error) => {
      console.error("failed to index time block memory", error)
    }),
  )
}

function sortCategories(categories: TimeBlockCategoryRecord[]) {
  return [...categories].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

async function ensureCategoryForUser(
  supabase: Supabase,
  userId: string,
  category: TimeBlockCategory,
  categoryId: string | null,
) {
  if (categoryId) {
    const { data } = await supabase
      .from("time_block_categories")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .eq("id", categoryId)
      .maybeSingle()

    if (data) {
      const record = data as TimeBlockCategoryRecord
      return { category: record.slug, categoryId: record.id }
    }
  }

  const { data } = await supabase
    .from("time_block_categories")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .eq("slug", category)
    .maybeSingle()

  if (data) {
    const record = data as TimeBlockCategoryRecord
    return { category: record.slug, categoryId: record.id }
  }

  const name = category.replace(/_/g, " ")
  const { data: created } = await supabase
    .from("time_block_categories")
    .insert({
      user_id: userId,
      slug: category,
      name,
      color: defaultCategoryColor(name),
      is_default: false,
    })
    .select("*")
    .single()

  if (created) {
    const record = created as TimeBlockCategoryRecord
    return { category: record.slug, categoryId: record.id }
  }

  return { category, categoryId: null }
}

/**
 * Load default and user-created categories.
 */
export async function getCategories(): Promise<GetCategoriesResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const { data, error } = await supabase
    .from("time_block_categories")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${user.id}`)

  if (error) {
    return { type: "error", message: "couldn't load categories. try again." }
  }

  return {
    type: "loaded",
    categories: withDistinctCategoryColors(
      sortCategories((data ?? []) as TimeBlockCategoryRecord[]),
    ),
  }
}

/**
 * Create a user-owned category, or return the existing category with that slug.
 */
export async function createCategory(input: CreateCategoryInput): Promise<CreateCategoryResult> {
  const name = typeof input.name === "string" ? input.name.trim() : ""

  if (!name) {
    return { type: "error", message: "category name is required." }
  }

  const slug = slugifyCategoryName(name)
  if (!isValidCategorySlug(slug)) {
    return { type: "error", message: "category name is invalid." }
  }

  const color =
    typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color)
      ? input.color
      : defaultCategoryColor(name)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const { data: existing } = await supabase
    .from("time_block_categories")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .eq("slug", slug)
    .maybeSingle()

  if (existing) {
    return { type: "exists", category: existing as TimeBlockCategoryRecord }
  }

  const { data: category, error } = await supabase
    .from("time_block_categories")
    .insert({
      user_id: user.id,
      slug,
      name,
      color,
      is_default: false,
    })
    .select("*")
    .single()

  if (error || !category) {
    return { type: "error", message: "couldn't create category. try again." }
  }

  return { type: "created", category: category as TimeBlockCategoryRecord }
}

/**
 * Load the current user's running timer, if one exists.
 */
export async function getActiveTimer(): Promise<GetActiveTimerResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const { data: activeTimer, error } = await supabase
    .from("active_timer")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return { type: "error", message: "couldn't load the timer. try again." }
  }

  return {
    type: "loaded",
    activeTimer: activeTimer ? (activeTimer as ActiveTimer) : null,
  }
}

/**
 * Start the current user's timer without overwriting an existing running timer.
 */
export async function startTimer(input?: StartTimerInput): Promise<StartTimerResult> {
  const validatedInput = validateStartTimerInput(input)

  if (validatedInput.type === "error") {
    return validatedInput
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const { data: existingTimer, error: existingError } = await supabase
    .from("active_timer")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (existingError) {
    return { type: "error", message: "couldn't check the timer. try again." }
  }

  if (existingTimer) {
    return {
      type: "already_running",
      activeTimer: existingTimer as ActiveTimer,
    }
  }

  const { data: activeTimer, error: insertError } = await supabase
    .from("active_timer")
    .insert({
      user_id: user.id,
      started_at: validatedInput.startedAt,
    })
    .select("*")
    .single()

  if (insertError || !activeTimer) {
    if (insertError?.code === "23505") {
      const { data: timerAfterRace } = await supabase
        .from("active_timer")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (timerAfterRace) {
        return {
          type: "already_running",
          activeTimer: timerAfterRace as ActiveTimer,
        }
      }
    }

    return { type: "error", message: "couldn't start the timer. try again." }
  }

  if (validatedInput.shouldCreateOpenBlock) {
    const resolvedCategory = validatedInput.category
      ? await ensureCategoryForUser(
          supabase,
          user.id,
          validatedInput.category,
          validatedInput.categoryId,
        )
      : { category: null, categoryId: null }
    const derivedMarkers = deriveMarkersFromNotes(validatedInput.notes)

    const { error: blockError } = await supabase.from("time_blocks").insert({
      user_id: user.id,
      started_at: validatedInput.startedAt,
      ended_at: null,
      task_name: validatedInput.taskName,
      category: resolvedCategory.category,
      category_id: resolvedCategory.categoryId,
      hashtags: validatedInput.hashtags,
      notes: validatedInput.notes,
      mood: validatedInput.mood,
      effort_level: validatedInput.effortLevel,
      satisfaction: validatedInput.satisfaction,
      avoidance_marker: validatedInput.avoidanceMarker || derivedMarkers.avoidance,
      hyperfocus_marker: validatedInput.hyperfocusMarker || derivedMarkers.hyperfocus,
      guilt_marker: validatedInput.guiltMarker || derivedMarkers.guilt,
      novelty_marker: validatedInput.noveltyMarker,
    })

    if (blockError) {
      await supabase
        .from("active_timer")
        .delete()
        .eq("user_id", user.id)
        .eq("started_at", validatedInput.startedAt)

      return { type: "error", message: "couldn't attach details to the timer. try again." }
    }
  }

  return {
    type: "started",
    activeTimer: activeTimer as ActiveTimer,
  }
}

/**
 * Reopen a completed block as the active timer, preserving its original start
 * time and metadata.
 */
export async function resumeBlock(input: ResumeBlockInput): Promise<ResumeBlockResult> {
  const validated = validateResumeBlockInput(input)

  if (validated.type === "error") {
    return validated
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const { data: existingTimer, error: existingError } = await supabase
    .from("active_timer")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (existingError) {
    return { type: "error", message: "couldn't check the timer. try again." }
  }

  if (existingTimer) {
    return {
      type: "already_running",
      activeTimer: existingTimer as ActiveTimer,
    }
  }

  const { data: block, error: blockError } = await supabase
    .from("time_blocks")
    .select("*")
    .eq("id", validated.id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (blockError) {
    return { type: "error", message: "couldn't load the time block. try again." }
  }

  if (!block) {
    return { type: "not_found" }
  }

  const timeBlock = block as TimeBlock

  if (!timeBlock.ended_at) {
    return { type: "error", message: "that block is already running." }
  }

  const startedAt = new Date(timeBlock.started_at)

  if (Number.isNaN(startedAt.getTime()) || startedAt.getTime() >= Date.now()) {
    return { type: "error", message: "time block has an invalid start time." }
  }

  const { data: activeTimer, error: insertError } = await supabase
    .from("active_timer")
    .insert({
      user_id: user.id,
      started_at: timeBlock.started_at,
    })
    .select("*")
    .single()

  if (insertError || !activeTimer) {
    if (insertError?.code === "23505") {
      const { data: timerAfterRace } = await supabase
        .from("active_timer")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (timerAfterRace) {
        return {
          type: "already_running",
          activeTimer: timerAfterRace as ActiveTimer,
        }
      }
    }

    return { type: "error", message: "couldn't resume the time block. try again." }
  }

  const { data: reopenedBlock, error: updateError } = await supabase
    .from("time_blocks")
    .update({
      ended_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", timeBlock.id)
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .select("id")
    .maybeSingle()

  if (updateError || !reopenedBlock) {
    await supabase
      .from("active_timer")
      .delete()
      .eq("user_id", user.id)
      .eq("started_at", timeBlock.started_at)

    if (!reopenedBlock) {
      return { type: "not_found" }
    }

    return { type: "error", message: "couldn't reopen the time block. try again." }
  }

  revalidatePath("/app")
  revalidatePath("/app/dashboard")
  revalidatePath("/app/calendar")
  invalidateMemoryContextForUser(user.id)

  return {
    type: "resumed",
    activeTimer: activeTimer as ActiveTimer,
  }
}

/**
 * Stop the current user's timer and save the elapsed time as a time block.
 */
export async function stopTimer(input?: StopTimerInput): Promise<StopTimerResult> {
  const validatedInput = validateStopTimerInput(input)

  if (validatedInput.type === "error") {
    return validatedInput
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const { data: activeTimer, error: timerError } = await supabase
    .from("active_timer")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (timerError) {
    return { type: "error", message: "couldn't check the timer. try again." }
  }

  if (!activeTimer) {
    return { type: "not_running" }
  }

  const endedAt = new Date()
  const startedAt = new Date(activeTimer.started_at)

  if (Number.isNaN(startedAt.getTime()) || endedAt.getTime() <= startedAt.getTime()) {
    return { type: "error", message: "timer has an invalid start time." }
  }

  const { data: openBlock, error: openBlockError } = await supabase
    .from("time_blocks")
    .select("*")
    .eq("user_id", user.id)
    .eq("started_at", activeTimer.started_at)
    .is("ended_at", null)
    .maybeSingle()

  if (openBlockError) {
    return { type: "error", message: "couldn't check the running block. try again." }
  }

  let timeBlock: TimeBlock
  const derivedMarkers = deriveMarkersFromNotes(validatedInput.notes)
  const resolvedCategory = validatedInput.category
    ? await ensureCategoryForUser(
        supabase,
        user.id,
        validatedInput.category,
        validatedInput.categoryId,
      )
    : { category: null, categoryId: null }

  if (openBlock) {
    const previousNotes = (openBlock as TimeBlock).notes
    const updateValues: Record<string, unknown> = {
      ended_at: endedAt.toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (input !== undefined) {
      updateValues.task_name = validatedInput.taskName
      updateValues.category = resolvedCategory.category
      updateValues.category_id = resolvedCategory.categoryId
      updateValues.hashtags = validatedInput.hashtags
      updateValues.notes = validatedInput.notes
      updateValues.mood = validatedInput.mood
      updateValues.effort_level = validatedInput.effortLevel
      updateValues.satisfaction = validatedInput.satisfaction
      updateValues.avoidance_marker = validatedInput.avoidanceMarker || derivedMarkers.avoidance
      updateValues.hyperfocus_marker = validatedInput.hyperfocusMarker || derivedMarkers.hyperfocus
      updateValues.guilt_marker = validatedInput.guiltMarker || derivedMarkers.guilt
      updateValues.novelty_marker = validatedInput.noveltyMarker
    }

    const { data: updatedBlock, error: updateError } = await supabase
      .from("time_blocks")
      .update(updateValues)
      .eq("id", (openBlock as TimeBlock).id)
      .eq("user_id", user.id)
      .select("*")
      .single()

    if (updateError || !updatedBlock) {
      return { type: "error", message: "couldn't save the time block. try again." }
    }

    timeBlock = updatedBlock as TimeBlock
    await preserveNotesAndInsights(
      supabase,
      user.id,
      timeBlock,
      input !== undefined ? previousNotes : timeBlock.notes,
      noteSourceFromInput(input?.note_source),
    )
  } else {
    const { data: insertedBlock, error: insertError } = await supabase
      .from("time_blocks")
      .insert({
        user_id: user.id,
        started_at: activeTimer.started_at,
        ended_at: endedAt.toISOString(),
        task_name: validatedInput.taskName,
        category: resolvedCategory.category,
        category_id: resolvedCategory.categoryId,
        hashtags: validatedInput.hashtags,
        notes: validatedInput.notes,
        mood: validatedInput.mood,
        effort_level: validatedInput.effortLevel,
        satisfaction: validatedInput.satisfaction,
        avoidance_marker: validatedInput.avoidanceMarker || derivedMarkers.avoidance,
        hyperfocus_marker: validatedInput.hyperfocusMarker || derivedMarkers.hyperfocus,
        guilt_marker: validatedInput.guiltMarker || derivedMarkers.guilt,
        novelty_marker: validatedInput.noveltyMarker,
      })
      .select("*")
      .single()

    if (insertError || !insertedBlock) {
      return { type: "error", message: "couldn't save the time block. try again." }
    }

    timeBlock = insertedBlock as TimeBlock
    await preserveNotesAndInsights(
      supabase,
      user.id,
      timeBlock,
      null,
      noteSourceFromInput(input?.note_source),
    )
  }

  const { error: deleteError } = await supabase
    .from("active_timer")
    .delete()
    .eq("user_id", user.id)
    .eq("started_at", activeTimer.started_at)

  if (deleteError) {
    return {
      type: "error",
      message: "time block saved, but couldn't clear the active timer.",
      timeBlock,
    }
  }

  syncCalendarAfterResponse(user.id, timeBlock)
  indexTimeBlockAfterResponse(timeBlock)

  revalidatePath("/app")
  revalidatePath("/app/dashboard")
  revalidatePath("/app/calendar")
  invalidateMemoryContextForUser(user.id)

  return {
    type: "stopped",
    timeBlock,
  }
}

/**
 * Create or update a user-owned time block with editable metadata and times.
 */
export async function saveBlock(input: SaveBlockInput): Promise<SaveBlockResult> {
  const validated = validateSaveBlockInput(input)

  if (validated.type === "error") {
    return validated
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const resolvedCategory = await ensureCategoryForUser(
    supabase,
    user.id,
    validated.category,
    validated.categoryId,
  )

  const values: Record<string, unknown> = {
    task_name: validated.taskName,
    category: resolvedCategory.category,
    category_id: resolvedCategory.categoryId,
    hashtags: validated.hashtags,
    notes: validated.notes,
    started_at: validated.startedAt,
    ended_at: validated.endedAt,
    updated_at: new Date().toISOString(),
  }
  const derivedMarkers = deriveMarkersFromNotes(validated.notes)

  if (validated.mood !== undefined) values.mood = validated.mood
  if (validated.effortLevel !== undefined) values.effort_level = validated.effortLevel
  if (validated.satisfaction !== undefined) values.satisfaction = validated.satisfaction
  if (validated.avoidanceMarker !== undefined || derivedMarkers.avoidance) {
    values.avoidance_marker = validated.avoidanceMarker === true || derivedMarkers.avoidance
  }
  if (validated.hyperfocusMarker !== undefined || derivedMarkers.hyperfocus) {
    values.hyperfocus_marker = validated.hyperfocusMarker === true || derivedMarkers.hyperfocus
  }
  if (validated.guiltMarker !== undefined || derivedMarkers.guilt) {
    values.guilt_marker = validated.guiltMarker === true || derivedMarkers.guilt
  }
  if (validated.noveltyMarker !== undefined) values.novelty_marker = validated.noveltyMarker

  if (validated.id) {
    const { data: existingBlock, error: existingError } = await supabase
      .from("time_blocks")
      .select("id, notes")
      .eq("id", validated.id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (existingError) {
      return { type: "error", message: "couldn't load the time block. try again." }
    }

    if (!existingBlock) {
      return { type: "not_found" }
    }

    const { data: timeBlock, error: updateError } = await supabase
      .from("time_blocks")
      .update(values)
      .eq("id", validated.id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle()

    if (updateError) {
      return { type: "error", message: "couldn't save the time block. try again." }
    }

    if (!timeBlock) {
      return { type: "not_found" }
    }

    await preserveNotesAndInsights(
      supabase,
      user.id,
      timeBlock as TimeBlock,
      (existingBlock as { notes: string | null }).notes,
      noteSourceFromInput(input.note_source),
    )

    syncCalendarAfterResponse(user.id, timeBlock as TimeBlock)
    indexTimeBlockAfterResponse(timeBlock as TimeBlock)

    revalidatePath("/app")
    revalidatePath("/app/dashboard")
    revalidatePath("/app/calendar")

    return {
      type: "saved",
      timeBlock: timeBlock as TimeBlock,
    }
  }

  const { data: timeBlock, error: insertError } = await supabase
    .from("time_blocks")
    .insert({
      ...values,
      user_id: user.id,
    })
    .select("*")
    .single()

  if (insertError || !timeBlock) {
    return { type: "error", message: "couldn't save the time block. try again." }
  }

  await preserveNotesAndInsights(
    supabase,
    user.id,
    timeBlock as TimeBlock,
    null,
    noteSourceFromInput(input.note_source),
  )

  syncCalendarAfterResponse(user.id, timeBlock as TimeBlock)
  indexTimeBlockAfterResponse(timeBlock as TimeBlock)

  revalidatePath("/app")
  revalidatePath("/app/dashboard")
  revalidatePath("/app/calendar")
  invalidateMemoryContextForUser(user.id)

  return {
    type: "saved",
    timeBlock: timeBlock as TimeBlock,
  }
}

/**
 * Delete a user-owned time block.
 */
export async function deleteBlock(input: DeleteBlockInput): Promise<DeleteBlockResult> {
  const validated = validateDeleteBlockInput(input)

  if (validated.type === "error") {
    return validated
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  await deleteTimeBlockFromGoogleCalendar(user.id, validated.id).catch(() => undefined)

  const { data: timeBlock, error: deleteError } = await supabase
    .from("time_blocks")
    .delete()
    .eq("id", validated.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle()

  if (deleteError) {
    return { type: "error", message: "couldn't delete the time block. try again." }
  }

  if (!timeBlock) {
    return { type: "not_found" }
  }

  after(() =>
    deleteMemoryChunksForTimeBlock(user.id, validated.id).catch((error) => {
      console.error("failed to delete time block memory chunks", error)
    }),
  )

  revalidatePath("/app")
  revalidatePath("/app/dashboard")
  revalidatePath("/app/calendar")
  invalidateMemoryContextForUser(user.id)

  return {
    type: "deleted",
    id: validated.id,
  }
}

/**
 * Load completed user-owned time blocks that overlap a half-open date range.
 */
export async function getCalendarData(
  input: GetCalendarDataInput,
): Promise<GetCalendarDataResult> {
  const validated = validateGetCalendarDataInput(input)

  if (validated.type === "error") {
    return validated
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { type: "error", message: "not signed in." }
  }

  const { data: timeBlocks, error } = await supabase
    .from("time_blocks")
    .select("*")
    .eq("user_id", user.id)
    .lt("started_at", validated.end)
    .not("ended_at", "is", null)
    .gt("ended_at", validated.start)
    .order("started_at", { ascending: true })

  if (error) {
    return { type: "error", message: "couldn't load calendar data. try again." }
  }

  return {
    type: "loaded",
    timeBlocks: (timeBlocks ?? []) as TimeBlock[],
  }
}
