import "server-only"

import { sql } from "kysely"
import { getDb } from "@/lib/db/client"
import type {
  DashboardViewGenerationLogRecord,
  DashboardViewRecord,
  DashboardViewRunRecord,
} from "@/lib/types"
import type {
  DashboardViewEvidencePacket,
  DashboardViewResult,
  DashboardViewSpec,
} from "@/lib/dashboard-view-spec"
import type { DashboardGenerationAttemptLog } from "@/lib/dashboard-view-agent"

export function isMissingDashboardViewsSchema(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  )
}

export async function hasDashboardViewsSchema() {
  try {
    const row = await getDb()
      .selectFrom("dashboard_views")
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst()

    return Boolean(row)
  } catch (error) {
    if (isMissingDashboardViewsSchema(error)) return false
    throw error
  }
}

export async function listActiveDashboardViews(
  userId: string,
): Promise<DashboardViewRecord[]> {
  let rows
  try {
    rows = await getDb()
      .selectFrom("dashboard_views")
      .selectAll()
      .where("user_id", "=", userId)
      .where("status", "in", ["draft", "published"])
      .orderBy("created_at", "asc")
      .execute()
  } catch (error) {
    if (isMissingDashboardViewsSchema(error)) return []
    throw error
  }

  return rows as DashboardViewRecord[]
}

export async function getDashboardViewBySlug(
  userId: string,
  slug: string,
): Promise<DashboardViewRecord | null> {
  let row
  try {
    row = await getDb()
      .selectFrom("dashboard_views")
      .selectAll()
      .where("user_id", "=", userId)
      .where("slug", "=", slug)
      .where("status", "!=", "archived")
      .executeTakeFirst()
  } catch (error) {
    if (isMissingDashboardViewsSchema(error)) return null
    throw error
  }

  return (row as DashboardViewRecord | undefined) ?? null
}

export async function getDashboardViewById(
  userId: string,
  id: string,
): Promise<DashboardViewRecord | null> {
  let row
  try {
    row = await getDb()
      .selectFrom("dashboard_views")
      .selectAll()
      .where("user_id", "=", userId)
      .where("id", "=", id)
      .executeTakeFirst()
  } catch (error) {
    if (isMissingDashboardViewsSchema(error)) return null
    throw error
  }

  return (row as DashboardViewRecord | undefined) ?? null
}

export async function createDashboardView(input: {
  userId: string
  slug: string
  title: string
  description: string
  sourcePrompt: string
  spec: DashboardViewSpec
}): Promise<DashboardViewRecord> {
  const row = await getDb()
    .insertInto("dashboard_views")
    .values({
      user_id: input.userId,
      slug: input.slug,
      title: input.title,
      description: input.description,
      source_prompt: input.sourcePrompt,
      spec: input.spec,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return row as DashboardViewRecord
}

export async function publishDashboardView(
  userId: string,
  id: string,
): Promise<DashboardViewRecord | null> {
  const row = await getDb()
    .updateTable("dashboard_views")
    .set({
      status: "published",
      published_at: sql`now()`,
      updated_at: sql`now()`,
    })
    .where("user_id", "=", userId)
    .where("id", "=", id)
    .where("status", "=", "draft")
    .returningAll()
    .executeTakeFirst()

  return (row as DashboardViewRecord | undefined) ?? null
}

export async function archiveDashboardView(userId: string, id: string) {
  await getDb()
    .updateTable("dashboard_views")
    .set({
      status: "archived",
      updated_at: sql`now()`,
    })
    .where("user_id", "=", userId)
    .where("id", "=", id)
    .execute()
}

export async function createDashboardViewRun(input: {
  userId: string
  dashboardViewId: string
  status: "success" | "error"
  inputWindowStart: string | null
  inputWindowEnd: string | null
  result: DashboardViewResult | null
  modelVersion: string | null
  error: string | null
}): Promise<DashboardViewRunRecord> {
  const row = await getDb()
    .insertInto("dashboard_view_runs")
    .values({
      user_id: input.userId,
      dashboard_view_id: input.dashboardViewId,
      status: input.status,
      input_window_start: input.inputWindowStart,
      input_window_end: input.inputWindowEnd,
      result: input.result,
      model_version: input.modelVersion,
      error: input.error,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return row as DashboardViewRunRecord
}

export async function getLatestDashboardViewRun(
  userId: string,
  dashboardViewId: string,
): Promise<DashboardViewRunRecord | null> {
  let row
  try {
    row = await getDb()
      .selectFrom("dashboard_view_runs")
      .selectAll()
      .where("user_id", "=", userId)
      .where("dashboard_view_id", "=", dashboardViewId)
      .orderBy("created_at", "desc")
      .executeTakeFirst()
  } catch (error) {
    if (isMissingDashboardViewsSchema(error)) return null
    throw error
  }

  return (row as DashboardViewRunRecord | undefined) ?? null
}

export async function createDashboardViewGenerationLog(input: {
  userId: string
  dashboardViewId: string | null
  action: "create" | "refresh"
  status: "success" | "error"
  sourcePrompt: string
  packet: DashboardViewEvidencePacket
  attempts: DashboardGenerationAttemptLog[]
  modelVersion: string | null
  error: string | null
}): Promise<DashboardViewGenerationLogRecord | null> {
  const evidenceSummary = {
    block_count: input.packet.summary.block_count,
    total_minutes: input.packet.summary.total_minutes,
    note_insight_count: input.packet.summary.note_insight_count,
    chat_insight_count: input.packet.summary.chat_insight_count,
    evidence_count: input.packet.evidence.length,
    category_count: input.packet.categories.length,
  }
  const attempts = input.attempts.map((attempt) => ({
    mode: attempt.mode,
    attempt: attempt.attempt,
    status: attempt.status,
    error: attempt.error,
  }))

  try {
    const row = await getDb()
      .insertInto("dashboard_view_generation_logs")
      .values({
        user_id: input.userId,
        dashboard_view_id: input.dashboardViewId,
        action: input.action,
        status: input.status,
        source_prompt: input.sourcePrompt,
        model_version: input.modelVersion,
        input_window_start: input.packet.input_window_start,
        input_window_end: input.packet.input_window_end,
        evidence_summary: sql`${JSON.stringify(evidenceSummary)}::jsonb`,
        attempts: sql`${JSON.stringify(attempts)}::jsonb`,
        error: input.error,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return row as DashboardViewGenerationLogRecord
  } catch (error) {
    if (isMissingDashboardViewsSchema(error)) return null
    throw error
  }
}
