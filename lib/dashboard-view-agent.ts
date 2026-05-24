import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai"
import { z } from "zod"
import { extractJSON } from "@/lib/ai"
import {
  dashboardViewResultSchema,
  dashboardViewSpecSchema,
  type DashboardViewEvidencePacket,
  type DashboardViewResult,
  type DashboardViewSpec,
  validateDashboardViewResult,
  validateDashboardViewSpec,
} from "@/lib/dashboard-view-spec"

const dashboardCreateOutputSchema = z
  .object({
    spec: dashboardViewSpecSchema,
    result: dashboardViewResultSchema,
  })
  .strict()

const dashboardRefreshOutputSchema = z
  .object({
    result: dashboardViewResultSchema,
  })
  .strict()

export type DashboardCreateOutput = z.infer<typeof dashboardCreateOutputSchema>
export type DashboardRefreshOutput = z.infer<typeof dashboardRefreshOutputSchema>
export type DashboardUpdateOutput = DashboardCreateOutput

type GenerateTextFn = typeof generateText

interface DashboardGenerationModels {
  dashboardModel: LanguageModel
}

interface DashboardGenerationOptions {
  generate?: GenerateTextFn
  onAttempt?: (attempt: DashboardGenerationAttemptLog) => void
}

export interface DashboardGenerationAttemptLog {
  mode: "create" | "refresh" | "update"
  attempt: number
  status: "success" | "error"
  error: string | null
}

export function dashboardErrorSpec(prompt: string): DashboardViewSpec {
  const title = prompt
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 64) || "custom dashboard view"

  return validateDashboardViewSpec({
    version: 1,
    title,
    description: "this dashboard view could not be generated yet.",
    sections: [
      {
        id: "generation-status",
        type: "observation_list",
        title: "generation status",
        description: "the last generation attempt did not complete.",
        source: "summary",
      },
    ],
  })
}

export function dashboardGenerationErrorMessage() {
  return "couldn't create a valid dashboard snapshot. try a narrower dashboard request or add more saved evidence."
}

function dashboardOutputContract(mode: "create" | "refresh" | "update") {
  return [
    "Schema reference:",
    mode === "create" || mode === "update"
      ? "{ spec: DashboardSpec, result: DashboardResult }"
      : "{ result: DashboardResult }",
    "DashboardSpec = { version: 1, title: string, description: string, sections: SectionSpec[] }",
    "SectionSpec = { id: lowercase-kebab-id, type: SectionType, title: string, description?: string, metric?: Metric, source?: Source }",
    "SectionType = metric_cards | simple_chart | observation_list | pattern_cards | source_panel",
    "Metric = summary | time_by_category | effort | satisfaction | hourly",
    "Source = summary | patterns | observations | evidence",
    "DashboardResult = { version: 1, generated_at: ISO string, input_window_start: string|null, input_window_end: string|null, sections: SectionResult[] }",
    "metric_cards result = { id, type: \"metric_cards\", metrics: [{ label, value, detail? }] }",
    "simple_chart result = { id, type: \"simple_chart\", points: [{ label, value }] }",
    "observation_list result = { id, type: \"observation_list\", observations: [{ title, body, evidence }] }",
    "pattern_cards result = { id, type: \"pattern_cards\", patterns: [{ title, body, evidence }] }",
    "source_panel result = { id, type: \"source_panel\", panels: [{ title, sources }] }",
  ].join("\n")
}

export function dashboardSystemPrompt(mode: "create" | "refresh" | "update") {
  return [
    "You are the dashboard agent for Alibi. Generate one structured object for a fixed, safe dashboard renderer.",
    "Use only the provided evidence packet. The server fetched all available data.",
    "",
    "How to read timed data:",
    "- packet.blocks are saved time blocks with start/end/duration/category/task/ratings/markers.",
    "- Use them for timelines, category comparisons, daily or hourly rhythms, effort summaries, satisfaction summaries, and marker patterns.",
    "- packet.aggregates contains precomputed category, hourly, effort, and satisfaction summaries you may use directly.",
    "",
    "How to read text data:",
    "- packet.evidence contains qualitative notes, chat, and block excerpts.",
    "- packet.retrieved_evidence contains semantically retrieved source chunks for the user's dashboard request.",
    "- packet.evidence_synthesis is the first-stage synthesis of retrieved chunks; use it to choose qualitative sections, but cite copied packet.evidence objects in final output.",
    "- Use text evidence for observations, patterns, and source-backed claims.",
    "- Do not treat text excerpts as universal truth; phrase claims as signals from the available record.",
    "",
    "Evidence rules:",
    "- Every claim in observations, patterns, and source panels must cite only packet.evidence objects.",
    "- Copy evidence objects exactly from packet.evidence, including id, type, label, excerpt, and written_at.",
    "- Never invent sources, evidence ids, excerpts, dates, categories, ratings, or tasks.",
    "- If evidence is thin, say what the current record can and cannot support.",
    "",
    "UI palette:",
    "- metric_cards: compact display metrics. Numeric metric values must be strings because they are display text.",
    "- simple_chart: bounded numeric comparisons. Chart point values must be numbers.",
    "- observation_list: short qualitative findings with evidence.",
    "- pattern_cards: recurring behaviors, friction, rhythms, or tradeoffs with evidence.",
    "- source_panel: copied source material grouped for inspection.",
    "",
    "Output rules:",
    "- Return structured output only.",
    "- spec.sections describes UI structure only.",
    "- result.sections contains the actual generated content.",
    "- Section ids and types must match exactly between spec.sections and result.sections, in the same order.",
    "- Do not put metrics, points, observations, patterns, panels, or evidence inside spec.sections.",
    "- Do not put title, description, metric, or source inside result.sections.",
    "- Use 2 to 5 sections for new dashboards unless the request is very narrow.",
    mode === "refresh"
      ? "- Preserve the saved spec. Regenerate only result.sections matching the existing section ids and types."
      : mode === "update"
        ? "- Revise the saved dashboard spec to reflect the user's update request. You may change section ids, titles, descriptions, section types, metrics, sources, and order."
        : "- Create a spec that directly reflects the user's requested dashboard.",
    "",
    dashboardOutputContract(mode),
    "",
    "Examples:",
    "- User asks \"which categories leave me satisfied\": use metric_cards for satisfaction at a glance, simple_chart for category comparison, and observation_list for evidence-backed notes about satisfied or frustrated work.",
    "- User asks \"why do I avoid admin work\": use pattern_cards for avoidance patterns and a source_panel with copied note/chat/block evidence.",
    "- User asks \"what time of day do I focus best\": use simple_chart with hourly numeric points and observation_list citing blocks or notes that support the rhythm.",
  ].join("\n")
}

function validationIssue(error: unknown) {
  if (NoObjectGeneratedError.isInstance(error)) {
    const details = [
      error.message,
      error.finishReason ? `finish_reason=${error.finishReason}` : null,
      error.cause instanceof Error ? `cause=${error.cause.message}` : null,
      error.text ? `raw_text=${error.text.slice(0, 1000)}` : null,
    ].filter(Boolean)
    return details.join("; ")
  }

  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
      .join("; ")
  }
  return error instanceof Error ? error.message : String(error)
}

function objectFromNoObjectError(error: unknown) {
  if (!NoObjectGeneratedError.isInstance(error) || !error.text) return null
  return extractJSON(error.text)
}

function dashboardRepairPrompt(error: unknown, mode: "create" | "refresh" | "update") {
  return [
    "The previous structured response failed validation.",
    `Validation issue: ${validationIssue(error)}`,
    "Repair the response using the exact contract below.",
    dashboardOutputContract(mode),
    "Use only evidence objects copied exactly from packet.evidence.",
  ].join("\n")
}

function createPrompt(
  prompt: string,
  packet: DashboardViewEvidencePacket,
  repair: string | null,
) {
  return [
    repair,
    "User request:",
    prompt,
    "",
    "Evidence packet:",
    JSON.stringify(packet),
  ].filter(Boolean).join("\n")
}

function refreshPrompt(
  prompt: string,
  spec: DashboardViewSpec,
  packet: DashboardViewEvidencePacket,
  repair: string | null,
) {
  return [
    repair,
    "Original user request:",
    prompt,
    "",
    "Saved dashboard spec:",
    JSON.stringify(spec),
    "",
    "Fresh evidence packet:",
    JSON.stringify(packet),
  ].filter(Boolean).join("\n")
}

function updatePrompt(
  originalPrompt: string,
  updateRequest: string,
  spec: DashboardViewSpec,
  result: DashboardViewResult | null,
  packet: DashboardViewEvidencePacket,
  repair: string | null,
) {
  return [
    repair,
    "Original saved dashboard request:",
    originalPrompt,
    "",
    "User update request:",
    updateRequest,
    "",
    "Current saved dashboard spec:",
    JSON.stringify(spec),
    "",
    result ? "Latest dashboard result:" : null,
    result ? JSON.stringify(result) : null,
    "",
    "Fresh evidence packet:",
    JSON.stringify(packet),
  ].filter(Boolean).join("\n")
}

export function validateDashboardCreateOutput(
  output: unknown,
  packet: DashboardViewEvidencePacket,
) {
  const parsed = dashboardCreateOutputSchema.parse(output)
  const spec = validateDashboardViewSpec(parsed.spec)
  const result = validateDashboardViewResult(parsed.result, {
    spec,
    allowedEvidence: packet.evidence,
  })
  return { spec, result }
}

export function validateDashboardRefreshOutput(
  output: unknown,
  spec: DashboardViewSpec,
  packet: DashboardViewEvidencePacket,
) {
  const parsed = dashboardRefreshOutputSchema.parse(output)
  const result = validateDashboardViewResult(parsed.result, {
    spec,
    allowedEvidence: packet.evidence,
  })
  return result
}

export async function generateDashboardCreateSnapshot(
  prompt: string,
  packet: DashboardViewEvidencePacket,
  models: DashboardGenerationModels,
  options: DashboardGenerationOptions = {},
): Promise<{ spec: DashboardViewSpec; result: DashboardViewResult }> {
  let repair: string | null = null
  let lastError: unknown = null
  const generate = options.generate ?? generateText

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let output: unknown
      try {
        const generated = await generate({
          model: models.dashboardModel,
          output: Output.object({ schema: dashboardCreateOutputSchema }),
          system: dashboardSystemPrompt("create"),
          prompt: createPrompt(prompt, packet, repair),
        })
        output = generated.output
      } catch (error) {
        output = objectFromNoObjectError(error)
        if (!output) throw error
      }

      const snapshot = validateDashboardCreateOutput(output, packet)
      options.onAttempt?.({
        mode: "create",
        attempt: attempt + 1,
        status: "success",
        error: null,
      })
      return snapshot
    } catch (error) {
      lastError = error
      options.onAttempt?.({
        mode: "create",
        attempt: attempt + 1,
        status: "error",
        error: validationIssue(error),
      })
      repair = dashboardRepairPrompt(error, "create")
    }
  }

  throw new Error(dashboardGenerationErrorMessage(), { cause: lastError })
}

export async function generateDashboardUpdateSnapshot(
  originalPrompt: string,
  updateRequest: string,
  spec: DashboardViewSpec,
  result: DashboardViewResult | null,
  packet: DashboardViewEvidencePacket,
  models: DashboardGenerationModels,
  options: DashboardGenerationOptions = {},
): Promise<{ spec: DashboardViewSpec; result: DashboardViewResult }> {
  let repair: string | null = null
  let lastError: unknown = null
  const generate = options.generate ?? generateText

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let output: unknown
      try {
        const generated = await generate({
          model: models.dashboardModel,
          output: Output.object({ schema: dashboardCreateOutputSchema }),
          system: dashboardSystemPrompt("update"),
          prompt: updatePrompt(originalPrompt, updateRequest, spec, result, packet, repair),
        })
        output = generated.output
      } catch (error) {
        output = objectFromNoObjectError(error)
        if (!output) throw error
      }

      const snapshot = validateDashboardCreateOutput(output, packet)
      options.onAttempt?.({
        mode: "update",
        attempt: attempt + 1,
        status: "success",
        error: null,
      })
      return snapshot
    } catch (error) {
      lastError = error
      options.onAttempt?.({
        mode: "update",
        attempt: attempt + 1,
        status: "error",
        error: validationIssue(error),
      })
      repair = dashboardRepairPrompt(error, "update")
    }
  }

  throw new Error(dashboardGenerationErrorMessage(), { cause: lastError })
}

export async function generateDashboardRefreshSnapshot(
  prompt: string,
  spec: DashboardViewSpec,
  packet: DashboardViewEvidencePacket,
  models: DashboardGenerationModels,
  options: DashboardGenerationOptions = {},
): Promise<DashboardViewResult> {
  let repair: string | null = null
  let lastError: unknown = null
  const generate = options.generate ?? generateText

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let output: unknown
      try {
        const generated = await generate({
          model: models.dashboardModel,
          output: Output.object({ schema: dashboardRefreshOutputSchema }),
          system: dashboardSystemPrompt("refresh"),
          prompt: refreshPrompt(prompt, spec, packet, repair),
        })
        output = generated.output
      } catch (error) {
        output = objectFromNoObjectError(error)
        if (!output) throw error
      }

      const result = validateDashboardRefreshOutput(output, spec, packet)
      options.onAttempt?.({
        mode: "refresh",
        attempt: attempt + 1,
        status: "success",
        error: null,
      })
      return result
    } catch (error) {
      lastError = error
      options.onAttempt?.({
        mode: "refresh",
        attempt: attempt + 1,
        status: "error",
        error: validationIssue(error),
      })
      repair = dashboardRepairPrompt(error, "refresh")
    }
  }

  throw new Error(dashboardGenerationErrorMessage(), { cause: lastError })
}
