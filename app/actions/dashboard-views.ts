"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { resolveAiModelsForUser } from "@/lib/ai-settings"
import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import { loadDashboardSkillInput } from "@/lib/dashboard-context"
import { retrieveMemoryContext } from "@/lib/rag/retriever"
import {
  dashboardErrorSpec,
  type DashboardGenerationAttemptLog,
  generateDashboardCreateSnapshot,
  generateDashboardRefreshSnapshot,
  generateDashboardUpdateSnapshot,
} from "@/lib/dashboard-view-agent"
import {
  buildDashboardEvidencePacket,
  type DashboardViewResult,
  slugifyDashboardViewTitle,
  validateDashboardViewResult,
  validateDashboardViewSpec,
} from "@/lib/dashboard-view-spec"
import {
  archiveDashboardView,
  createDashboardView,
  createDashboardViewGenerationLog,
  createDashboardViewRun,
  getDashboardViewById,
  getLatestDashboardViewRun,
  hasDashboardViewsSchema,
  publishDashboardView,
  renameDashboardView,
  updateDashboardView,
} from "@/lib/repositories/dashboard-views"

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  await syncAppUser(user)
  return user
}

async function buildDashboardPacket(
  userId: string,
  prompt: string,
  useCase: "dashboard_create" | "dashboard_refresh" | "dashboard_update",
) {
  const input = await loadDashboardSkillInput(userId)
  const retrieval = await retrieveMemoryContext({
    userId,
    query: prompt,
    useCase,
    sourceTypes: [
      "time_block",
      "time_block_insight",
      "companion_message",
      "companion_message_insight",
      "time_block_note_version",
    ],
    limit: 12,
  })
  return buildDashboardEvidencePacket(input, {
    rag: {
      query: prompt,
      chunks: retrieval.chunks.map((chunk) => ({
        id: chunk.id,
        sourceType: chunk.sourceType,
        sourceCreatedAt: chunk.sourceCreatedAt,
        chunkText: chunk.chunkText,
        metadata: chunk.metadata,
      })),
    },
  })
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

  const packet = await buildDashboardPacket(user.id, prompt, "dashboard_create")
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
  const packet = await buildDashboardPacket(
    user.id,
    view.source_prompt,
    "dashboard_refresh",
  )

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

export async function renameDashboardViewAction(viewId: string, formData: FormData) {
  const user = await requireUser()
  const view = await getDashboardViewById(user.id, viewId)
  if (!view || view.status === "archived") redirect("/app/dashboard")

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()

  if (title.length < 1 || title.length > 80 || description.length > 220) {
    redirect(`/app/dashboard?view=${view.slug}`)
  }

  const updated = await renameDashboardView({
    userId: user.id,
    id: view.id,
    title,
    description,
  })

  revalidatePath("/app/dashboard")
  redirect(updated ? `/app/dashboard?view=${updated.slug}` : `/app/dashboard?view=${view.slug}`)
}

export async function updateDashboardViewAction(viewId: string, formData: FormData) {
  const user = await requireUser()
  const view = await getDashboardViewById(user.id, viewId)
  if (!view || view.status === "archived") redirect("/app/dashboard")

  const updateRequest = String(formData.get("update") ?? "").trim()
  if (updateRequest.length < 8 || updateRequest.length > 1000) {
    redirect(`/app/dashboard?view=${view.slug}`)
  }

  const packet = await buildDashboardPacket(
    user.id,
    [view.source_prompt, updateRequest].join("\n"),
    "dashboard_update",
  )
  const models = await resolveAiModelsForUser(user.id)
  const attempts: DashboardGenerationAttemptLog[] = []
  const savedSpec = validateDashboardViewSpec(view.spec)
  const latestRun = await getLatestDashboardViewRun(user.id, view.id)
  let latestResult: DashboardViewResult | null = null
  if (latestRun?.result) {
    try {
      latestResult = validateDashboardViewResult(latestRun.result, { spec: savedSpec })
    } catch {
      latestResult = null
    }
  }
  let status: "success" | "error" = "error"
  let error: string | null = null

  try {
    const generated = await generateDashboardUpdateSnapshot(
      view.source_prompt,
      updateRequest,
      savedSpec,
      latestResult,
      packet,
      models,
      {
        onAttempt: (attempt) => attempts.push(attempt),
      },
    )
    const sourcePrompt = [
      view.source_prompt,
      "",
      "Update request:",
      updateRequest,
    ].join("\n")
    const updated = await updateDashboardView({
      userId: user.id,
      id: view.id,
      title: generated.spec.title,
      description: generated.spec.description,
      sourcePrompt,
      spec: generated.spec,
    })
    if (!updated) redirect("/app/dashboard")

    await createDashboardViewRun({
      userId: user.id,
      dashboardViewId: view.id,
      status: "success",
      inputWindowStart: generated.result.input_window_start,
      inputWindowEnd: generated.result.input_window_end,
      result: generated.result,
      modelVersion: models.dashboardModelId,
      error: null,
    })
    status = "success"
  } catch (generationError) {
    error =
      generationError instanceof Error
        ? generationError.message
        : "dashboard update failed"
    await createDashboardViewRun({
      userId: user.id,
      dashboardViewId: view.id,
      status: "error",
      inputWindowStart: null,
      inputWindowEnd: null,
      result: null,
      modelVersion: models.dashboardModelId,
      error,
    })
  }

  await createDashboardViewGenerationLog({
    userId: user.id,
    dashboardViewId: view.id,
    action: "update",
    status,
    sourcePrompt: updateRequest,
    packet,
    attempts,
    modelVersion: models.dashboardModelId,
    error,
  })

  revalidatePath("/app/dashboard")
  redirect(`/app/dashboard?view=${view.slug}`)
}

export async function archiveDashboardViewAction(viewId: string) {
  const user = await requireUser()
  await archiveDashboardView(user.id, viewId)

  revalidatePath("/app/dashboard")
  redirect("/app/dashboard")
}
