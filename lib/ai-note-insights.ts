import { generateText, Output } from "ai"
import { z } from "zod"
import { fastModel, fastModelId } from "@/lib/ai"
import { alibiCompanionGuide } from "@/lib/companion-voice"
import { deriveInsightFromNotes } from "@/lib/note-insights"
import type { TimeBlock, TimeBlockInsight } from "@/lib/types"

const noteInsightSchema = z.object({
  actions: z.array(z.string()).default([]),
  emotional_tone: z.string().nullable().default(null),
  friction_points: z.array(z.string()).default([]),
  avoidance_signals: z.array(z.string()).default([]),
  hyperfocus_signals: z.array(z.string()).default([]),
  satisfaction_signals: z.array(z.string()).default([]),
  uncertainty_signals: z.array(z.string()).default([]),
  people: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  evidence_excerpt: z.string().nullable().default(null),
})

type NoteInsightOutput = z.infer<typeof noteInsightSchema>

function limitArray(values: string[] | undefined, limit = 8) {
  return (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeInsightOutput(output: NoteInsightOutput) {
  return {
    source: "notes" as const,
    actions: limitArray(output.actions),
    emotional_tone: output.emotional_tone?.trim() || null,
    friction_points: limitArray(output.friction_points),
    avoidance_signals: limitArray(output.avoidance_signals),
    hyperfocus_signals: limitArray(output.hyperfocus_signals),
    satisfaction_signals: limitArray(output.satisfaction_signals),
    uncertainty_signals: limitArray(output.uncertainty_signals),
    people: limitArray(output.people),
    projects: limitArray(output.projects),
    themes: limitArray(output.themes),
    evidence_excerpt: output.evidence_excerpt?.trim().slice(0, 220) || null,
    model_version: fastModelId,
  }
}

export async function generateNoteInsight(block: TimeBlock) {
  const notes = block.notes?.trim()
  if (!notes) return null

  const fallback = deriveInsightFromNotes(notes)

  try {
    const { output } = await generateText({
      model: fastModel,
      output: Output.object({ schema: noteInsightSchema }),
      system: [
        "Extract a grounded note insight for one saved Alibi time block.",
        alibiCompanionGuide,
        "Return structured evidence only. Do not infer beyond the note.",
        "Use short lowercase phrases. Empty arrays are fine.",
        "The evidence_excerpt must be a short excerpt or paraphrase from the note.",
      ].join("\n"),
      prompt: [
        `task: ${block.task_name ?? "unnamed block"}`,
        `category: ${block.category ?? "uncategorized"}`,
        `started_at: ${block.started_at}`,
        `ended_at: ${block.ended_at ?? "unknown"}`,
        "note:",
        notes.slice(0, 3000),
      ].join("\n"),
    })

    return normalizeInsightOutput(output)
  } catch {
    return fallback
  }
}

export async function generateTimeBlockInsightRecord(
  block: TimeBlock,
  options: {
    userId?: string
    noteVersionId?: string | null
    id?: string
    createdAt?: string
  } = {},
): Promise<TimeBlockInsight | null> {
  const insight = await generateNoteInsight(block)
  if (!insight) return null

  return {
    id: options.id ?? `insight-${block.id}`,
    time_block_id: block.id,
    note_version_id: options.noteVersionId ?? null,
    user_id: options.userId ?? block.user_id,
    source_notes: block.notes?.trim() || null,
    created_at: options.createdAt ?? new Date().toISOString(),
    ...insight,
  }
}
