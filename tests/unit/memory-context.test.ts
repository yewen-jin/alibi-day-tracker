import { describe, expect, it } from "vitest"
import {
  formatMemoryContext,
  inferMemoryRange,
  type CompanionMemoryContext,
} from "@/lib/memory-context"
import type { CompanionDraft } from "@/lib/block-draft-utils"
import type {
  CompanionMessage,
  CompanionMessageInsight,
  TimeBlock,
  TimeBlockInsight,
} from "@/lib/types"

const now = new Date("2026-05-05T12:00:00.000Z")
const dayMs = 24 * 60 * 60 * 1000

function emptyDraft(overrides: Partial<CompanionDraft> = {}): CompanionDraft {
  return {
    task_name: null,
    category: null,
    hashtags: [],
    notes: null,
    started_at: null,
    ended_at: null,
    duration_minutes: null,
    mood: null,
    effort_level: null,
    satisfaction: null,
    avoidance_marker: false,
    hyperfocus_marker: false,
    guilt_marker: false,
    novelty_marker: false,
    ...overrides,
  }
}

function makeBlock(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    id: "block-1",
    user_id: "user-1",
    started_at: "2026-05-05T09:00:00.000Z",
    ended_at: "2026-05-05T10:00:00.000Z",
    duration_seconds: 3600,
    category_id: null,
    task_name: "wrote project notes",
    category: "deep_work",
    hashtags: ["planning"],
    notes: "I got distracted, but the detour helped clarify the launch plan.",
    mood: null,
    effort_level: "medium",
    satisfaction: "mixed",
    avoidance_marker: false,
    hyperfocus_marker: false,
    guilt_marker: false,
    novelty_marker: true,
    created_at: "2026-05-05T09:00:00.000Z",
    updated_at: "2026-05-05T10:00:00.000Z",
    ...overrides,
  }
}

function makeNoteInsight(overrides: Partial<TimeBlockInsight> = {}): TimeBlockInsight {
  return {
    id: "note-insight-1",
    time_block_id: "block-1",
    note_version_id: null,
    user_id: "user-1",
    source: "notes",
    source_notes: "I got distracted, but the detour helped clarify the launch plan.",
    actions: ["wrote project notes"],
    emotional_tone: "mixed",
    friction_points: ["distracted"],
    avoidance_signals: [],
    hyperfocus_signals: [],
    satisfaction_signals: ["helped clarify"],
    uncertainty_signals: [],
    people: [],
    projects: ["launch"],
    themes: ["friction", "satisfaction"],
    evidence_excerpt: "the detour helped clarify the launch plan",
    evidence_claims: [],
    model_version: "test",
    created_at: "2026-05-05T10:00:00.000Z",
    ...overrides,
  }
}

function makeMessage(overrides: Partial<CompanionMessage> = {}): CompanionMessage {
  return {
    id: "message-1",
    conversation_id: "conversation-1",
    user_id: "user-1",
    role: "user",
    content: "i meant to write the launch notes but got sidetracked usefully",
    message_type: "chat",
    model: "test",
    related_time_block_id: null,
    metadata: {},
    created_at: "2026-05-05T11:00:00.000Z",
    ...overrides,
  }
}

function makeChatInsight(overrides: Partial<CompanionMessageInsight> = {}): CompanionMessageInsight {
  return {
    id: "chat-insight-1",
    user_id: "user-1",
    message_id: "message-1",
    conversation_id: "conversation-1",
    related_time_block_id: null,
    scope: "general",
    did_actions: [],
    intended_actions: ["meant to write the launch notes"],
    avoided_or_deferred: [],
    friction_points: ["got sidetracked"],
    emotional_signals: [],
    useful_drift: ["sidetracked usefully"],
    mismatch_signals: [],
    themes: ["intention", "useful drift"],
    evidence_excerpt: "i meant to write the launch notes but got sidetracked usefully",
    evidence_claims: [],
    model_version: "test",
    created_at: "2026-05-05T11:00:00.000Z",
    ...overrides,
  }
}

describe("inferMemoryRange", () => {
  it("defaults to today's memory scope", () => {
    const result = inferMemoryRange("how am i doing?", null, now)

    expect(result.scope).toBe("today")
    expect(result.label).toBe("today")
  })

  it("expands last-few-days questions to a three-day scope", () => {
    const result = inferMemoryRange("what pattern do you see in the last few days?", null, now)

    expect(result.scope).toBe("recent_days")
    expect(result.label).toBe("last 3 days")
    expect(new Date(result.end).getTime() - new Date(result.start).getTime()).toBe(3 * dayMs)
  })

  it("expands week questions to a seven-day scope", () => {
    const result = inferMemoryRange("what happened this week?", null, now)

    expect(result.scope).toBe("recent_days")
    expect(result.label).toBe("last 7 days")
    expect(new Date(result.end).getTime() - new Date(result.start).getTime()).toBe(7 * dayMs)
  })

  it("uses a complete draft window as explicit context", () => {
    const result = inferMemoryRange(
      "analyse that block",
      emptyDraft({
        started_at: "2026-05-04T13:00:00.000Z",
        ended_at: "2026-05-04T14:30:00.000Z",
      }),
      now,
    )

    expect(result.scope).toBe("date_range")
    expect(result.start).toBe("2026-05-04T13:00:00.000Z")
    expect(result.end).toBe("2026-05-04T14:30:00.000Z")
  })
})

describe("formatMemoryContext", () => {
  it("keeps time blocks, note insights, chat insights, and recent messages visible", () => {
    const range = inferMemoryRange("what pattern do you see today?", null, now)
    const context: Omit<CompanionMemoryContext, "evidenceText"> = {
      scope: range.scope,
      range,
      blocks: [makeBlock()],
      noteInsights: [makeNoteInsight()],
      linkedMessages: [makeMessage({ related_time_block_id: "block-1" })],
      chatInsights: [makeChatInsight()],
      recentMessages: [makeMessage()],
    }

    const result = formatMemoryContext(context)

    expect(result).toContain("memory scope: today")
    expect(result).toContain("wrote project notes")
    expect(result).toContain("note-derived insights")
    expect(result).toContain("friction=distracted")
    expect(result).toContain("chat-derived insights")
    expect(result).toContain("intended=meant to write the launch notes")
    expect(result).toContain("recent visible messages")
  })

  it("includes claim-level evidence when available", () => {
    const range = inferMemoryRange("what pattern do you see today?", null, now)
    const context: Omit<CompanionMemoryContext, "evidenceText"> = {
      scope: range.scope,
      range,
      blocks: [],
      noteInsights: [
        makeNoteInsight({
          evidence_claims: [
            {
              id: "claim-1",
              source_type: "time_block_note",
              source_id: "block-1",
              source_field: "friction_points",
              kind: "friction",
              text: "got distracted",
              context_excerpt: "I got distracted, but the detour helped",
            },
          ],
        }),
      ],
      linkedMessages: [],
      chatInsights: [
        makeChatInsight({
          evidence_claims: [
            {
              id: "claim-2",
              source_type: "companion_message",
              source_id: "message-1",
              source_field: "intended_actions",
              kind: "action",
              text: "meant to write the launch notes",
              context_excerpt: "i meant to write the launch notes but got sidetracked",
            },
          ],
        }),
      ],
      recentMessages: [],
    }

    const result = formatMemoryContext(context)

    expect(result).toContain('claim_evidence=friction_points="got distracted"')
    expect(result).toContain('intended_actions="meant to write the launch notes"')
  })
})
