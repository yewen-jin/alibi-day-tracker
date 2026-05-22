"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { resolveAiModelsForUser } from "@/lib/ai-settings"
import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import { loadDashboardSkillInput } from "@/lib/dashboard-context"
import {
  dashboardErrorSpec,
  type DashboardGenerationAttemptLog,
  generateDashboardCreateSnapshot,
  generateDashboardRefreshSnapshot,
} from "@/lib/dashboard-view-agent"
import {
  buildDashboardEvidencePacket,
  type DashboardViewResult,
  slugifyDashboardViewTitle,
  validateDashboardViewSpec,
} from "@/lib/dashboard-view-spec"
import {
  archiveDashboardView,
  createDashboardView,
  createDashboardViewGenerationLog,
  createDashboardViewRun,
  getDashboardViewById,
  hasDashboardViewsSchema,
  publishDashboardView,
} from "@/lib/repositories/dashboard-views"

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  await syncAppUser(user)
  return user
}

export async function createDashboardViewDraftAction(formData: FormData) {
  const user = await requireUser()
  const prompt = String(formData.get("prompt") ?? "").trim()

  if (!(await hasDashboardViewsSchema())) {
    redirect("/app/dashboard?custom_view=schema-missing")
  }

  if (prompt.length < 8 || prompt.length > 800) {
    redirect("/app/dashboard")
  }

  const input = await loadDashboardSkillInput(user.id)
  const packet = buildDashboardEvidencePacket(input)
  const models = await resolveAiModelsForUser(user.id)
  let spec = dashboardErrorSpec(prompt)
  let result: DashboardViewResult | null = null
  let status: "success" | "error" = "error"
  let error: string | null = null
  const attempts: DashboardGenerationAttemptLog[] = []

  try {
    const generated = await generateDashboardCreateSnapshot(prompt, packet, models, {
      onAttempt: (attempt) => attempts.push(attempt),
    })
    spec = generated.spec
    result = generated.result
    status = "success"
  } catch (generationError) {
    error =
      generationError instanceof Error
        ? generationError.message
        : "dashboard generation failed"
  }

  const slug = `${slugifyDashboardViewTitle(spec.title)}-${Date.now().toString(36)}`
  const view = await createDashboardView({
    userId: user.id,
    slug,
    title: spec.title,
    description: spec.description,
    sourcePrompt: prompt,
    spec,
  })

  await createDashboardViewRun({
    userId: user.id,
    dashboardViewId: view.id,
    status,
    inputWindowStart: result?.input_window_start ?? packet.input_window_start,
    inputWindowEnd: result?.input_window_end ?? packet.input_window_end,
    result,
    modelVersion: models.dashboardModelId,
    error,
  })

  await createDashboardViewGenerationLog({
    userId: user.id,
    dashboardViewId: view.id,
    action: "create",
    status,
    sourcePrompt: prompt,
    packet,
    attempts,
    modelVersion: models.dashboardModelId,
    error,
  })

  revalidatePath("/app/dashboard")
  redirect(`/app/dashboard?view=${view.slug}`)
}

export async function publishDashboardViewAction(viewId: string) {
  const user = await requireUser()
  const view = await publishDashboardView(user.id, viewId)

  revalidatePath("/app/dashboard")
  redirect(view ? `/app/dashboard?view=${view.slug}` : "/app/dashboard")
}

export async function refreshDashboardViewAction(viewId: string) {
  const user = await requireUser()
  const view = await getDashboardViewById(user.id, viewId)
  if (!view || view.status === "archived") redirect("/app/dashboard")
  const models = await resolveAiModelsForUser(user.id)
  const attempts: DashboardGenerationAttemptLog[] = []
  const input = await loadDashboardSkillInput(user.id)
  const packet = buildDashboardEvidencePacket(input)

  try {
    const spec = validateDashboardViewSpec(view.spec)
    const result = await generateDashboardRefreshSnapshot(
      view.source_prompt,
      spec,
      packet,
      models,
      {
        onAttempt: (attempt) => attempts.push(attempt),
      },
    )
    await createDashboardViewRun({
      userId: user.id,
      dashboardViewId: view.id,
      status: "success",
      inputWindowStart: result.input_window_start,
      inputWindowEnd: result.input_window_end,
      result,
      modelVersion: models.dashboardModelId,
      error: null,
    })
    await createDashboardViewGenerationLog({
      userId: user.id,
      dashboardViewId: view.id,
      action: "refresh",
      status: "success",
      sourcePrompt: view.source_prompt,
      packet,
      attempts,
      modelVersion: models.dashboardModelId,
      error: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh failed"
    await createDashboardViewRun({
      userId: user.id,
      dashboardViewId: view.id,
      status: "error",
      inputWindowStart: null,
      inputWindowEnd: null,
      result: null,
      modelVersion: models.dashboardModelId,
      error: message,
    })
    await createDashboardViewGenerationLog({
      userId: user.id,
      dashboardViewId: view.id,
      action: "refresh",
      status: "error",
      sourcePrompt: view.source_prompt,
      packet,
      attempts,
      modelVersion: models.dashboardModelId,
      error: message,
    })
  }

  revalidatePath("/app/dashboard")
  redirect(`/app/dashboard?view=${view.slug}`)
}

export async function archiveDashboardViewAction(viewId: string) {
  const user = await requireUser()
  await archiveDashboardView(user.id, viewId)

  revalidatePath("/app/dashboard")
  redirect("/app/dashboard")
}
