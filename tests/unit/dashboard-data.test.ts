import { describe, expect, it } from "vitest"
import {
  aggregateByCategory,
  aggregateByHour,
  aggregateByWeekday,
  blocksForLocalDate,
  buildChatMirrorObservations,
  buildDailyTimelineItems,
  buildNotesMirrorObservations,
  bucketByDay,
} from "@/lib/dashboard-data"
import type { CompanionMessage, CompanionMessageInsight, TimeBlock, TimeBlockInsight } from "@/lib/types"

function makeBlock(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    id: "test-id",
    user_id: "user-1",
    task_name: "test task",
    category_id: null,
    category: "deep_work",
    hashtags: [],
    notes: null,
    started_at: "2026-05-05T10:00:00.000Z",
    ended_at: "2026-05-05T11:00:00.000Z",
    duration_seconds: 3600,
    mood: null,
    effort_level: null,
    satisfaction: null,
    avoidance_marker: false,
    hyperfocus_marker: false,
    guilt_marker: false,
    novelty_marker: false,
    created_at: "2026-05-05T10:00:00.000Z",
    updated_at: "2026-05-05T10:00:00.000Z",
    ...overrides,
  }
}

function makeNoteInsight(overrides: Partial<TimeBlockInsight> = {}): TimeBlockInsight {
  return {
    id: "note-insight-1",
    time_block_id: "test-id",
    note_version_id: "note-version-1",
    user_id: "user-1",
    source: "notes",
    source_notes: "i got stuck on admin but felt relieved after",
    actions: [],
    emotional_tone: null,
    friction_points: [],
    avoidance_signals: [],
    hyperfocus_signals: [],
    satisfaction_signals: [],
    uncertainty_signals: [],
    people: [],
    projects: [],
    themes: [],
    evidence_excerpt: "i got stuck on admin but felt relieved after",
    evidence_claims: [],
    model_version: "test",
    created_at: "2026-05-05T10:30:00.000Z",
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
    intended_actions: [],
    avoided_or_deferred: [],
    friction_points: [],
    emotional_signals: [],
    useful_drift: [],
    mismatch_signals: [],
    themes: [],
    evidence_excerpt: "i felt scattered after lunch",
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
    content: "i meant to work on the proposal but got stuck",
    message_type: "chat",
    model: "manual",
    related_time_block_id: null,
    metadata: {},
    created_at: "2026-05-05T09:45:00.000Z",
    ...overrides,
  }
}

describe("bucketByDay", () => {
  it("groups blocks by calendar date key", () => {
    const blocks = [
      makeBlock({ started_at: "2026-05-05T10:00:00.000Z" }),
      makeBlock({ started_at: "2026-05-05T14:00:00.000Z" }),
      makeBlock({ started_at: "2026-05-06T09:00:00.000Z" }),
    ]
    const result = bucketByDay(blocks)
    expect(result.size).toBe(2)
    expect(result.get("2026-05-05")?.count).toBe(2)
    expect(result.get("2026-05-06")?.count).toBe(1)
  })

  it("sums minutes correctly from duration_seconds", () => {
    const blocks = [
      makeBlock({ duration_seconds: 3600 }),
      makeBlock({ duration_seconds: 1800 }),
    ]
    const result = bucketByDay(blocks)
    const bucket = result.get("2026-05-05")
    expect(bucket?.totalMinutes).toBe(90)
  })

  it("returns an empty map for no blocks", () => {
    expect(bucketByDay([])).toHaveProperty("size", 0)
  })
})

describe("aggregateByCategory", () => {
  it("groups and sorts by total minutes descending", () => {
    const blocks = [
      makeBlock({ category: "admin", duration_seconds: 1800 }),
      makeBlock({ category: "deep_work", duration_seconds: 7200 }),
      makeBlock({ category: "admin", duration_seconds: 1800 }),
    ]
    const result = aggregateByCategory(blocks)
    expect(result[0].category).toBe("deep work")
    expect(result[1].category).toBe("admin")
    expect(result[1].count).toBe(2)
    expect(result[1].totalMinutes).toBe(60)
  })

  it("labels blocks with no category as uncategorized", () => {
    const block = makeBlock({ category: null })
    const result = aggregateByCategory([block])
    expect(result[0].category).toBe("uncategorized")
  })
})

describe("aggregateByWeekday", () => {
  it("returns 7 entries one per weekday", () => {
    const result = aggregateByWeekday([])
    expect(result).toHaveLength(7)
  })

  it("increments the correct weekday slot", () => {
    // 2026-05-05 is a Tuesday (weekday 2)
    const block = makeBlock({ started_at: "2026-05-05T10:00:00.000Z" })
    const result = aggregateByWeekday([block])
    expect(result[2].count).toBe(1)
    expect(result[2].label).toBe("tue")
  })
})

describe("aggregateByHour", () => {
  it("returns 24 entries one per hour", () => {
    const result = aggregateByHour([])
    expect(result).toHaveLength(24)
  })

  it("increments the correct hour slot from started_at", () => {
    const started_at = "2026-05-05T14:30:00.000Z"
    const block = makeBlock({ started_at })
    const result = aggregateByHour([block])
    // getHours() reads local time; derive expected slot the same way
    const expectedHour = new Date(started_at).getHours()
    expect(result[expectedHour].count).toBe(1)
  })
})

describe("blocksForLocalDate", () => {
  it("returns only blocks for the matching local date", () => {
    const blocks = [
      makeBlock({ id: "one", started_at: "2026-05-05T10:00:00.000Z" }),
      makeBlock({ id: "two", started_at: "2026-05-06T09:00:00.000Z" }),
      makeBlock({ id: "three", started_at: "2026-05-05T08:00:00.000Z" }),
    ]

    const result = blocksForLocalDate(blocks, "2026-05-05")

    expect(result.map((block) => block.id)).toEqual(["three", "one"])
  })
})

describe("buildDailyTimelineItems", () => {
  it("places a block starting and ending within the same hour", () => {
    const result = buildDailyTimelineItems([
      makeBlock({
        started_at: "2026-05-05T10:15:00.000Z",
        ended_at: "2026-05-05T10:45:00.000Z",
        duration_seconds: null,
      }),
    ])
    const expectedStart = new Date("2026-05-05T10:15:00.000Z")
    const expectedStartMinutes = expectedStart.getHours() * 60 + expectedStart.getMinutes()

    expect(result).toHaveLength(1)
    expect(result[0].startMinutes).toBe(expectedStartMinutes)
    expect(result[0].durationMinutes).toBe(30)
    expect(result[0].topPercent).toBeCloseTo((expectedStartMinutes / 1440) * 100)
    expect(result[0].heightPercent).toBeCloseTo((30 / 1440) * 100)
  })

  it("places a block spanning multiple hours", () => {
    const result = buildDailyTimelineItems([
      makeBlock({
        started_at: "2026-05-05T09:30:00.000Z",
        ended_at: "2026-05-05T12:00:00.000Z",
        duration_seconds: null,
      }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].durationMinutes).toBe(150)
    expect(result[0].heightPercent).toBeCloseTo((150 / 1440) * 100)
  })

  it("ignores blocks with missing ended_at and invalid duration", () => {
    const result = buildDailyTimelineItems([
      makeBlock({
        started_at: "2026-05-05T10:00:00.000Z",
        ended_at: null,
        duration_seconds: null,
      }),
      makeBlock({
        started_at: "2026-05-05T11:00:00.000Z",
        ended_at: "2026-05-05T10:30:00.000Z",
        duration_seconds: null,
      }),
    ])

    expect(result).toHaveLength(0)
  })
})

describe("buildChatMirrorObservations", () => {
  it("turns chat insights into mirror observations", () => {
    const result = buildChatMirrorObservations([
      makeChatInsight({
        intended_actions: ["meant to work on proposal"],
        evidence_excerpt: "i meant to work on the proposal but got stuck",
      }),
    ])

    expect(result[0].title).toBe("intended versus actual")
    expect(result[0].evidence).toContain("general chat")
    expect(result[0].evidence).not.toContain("message-")
  })

  it("prefers exact claim evidence over broad chat excerpts", () => {
    const result = buildChatMirrorObservations([
      makeChatInsight({
        intended_actions: ["meant to work on proposal"],
        evidence_excerpt: "i meant to work on the proposal but got stuck after lunch",
        evidence_claims: [
          {
            id: "claim-1",
            source_type: "companion_message",
            source_id: "message-1",
            source_field: "intended_actions",
            kind: "action",
            text: "meant to work on the proposal",
            context_excerpt: "i meant to work on the proposal but got stuck",
            start_index: 2,
            end_index: 33,
          },
        ],
      }),
    ])

    expect(result[0].evidence).toContain("\"meant to work on the proposal\"")
    expect(result[0].evidence).not.toContain("after lunch")
    expect(result[0].sources[0]).toMatchObject({
      type: "chat",
      exact_text: "meant to work on the proposal",
      context_excerpt: "i meant to work on the proposal but got stuck",
    })
  })

  it("falls back to broad excerpts for legacy rows without claims", () => {
    const result = buildChatMirrorObservations([
      makeChatInsight({
        friction_points: ["got stuck"],
        evidence_excerpt: "i got stuck naming what this was",
        evidence_claims: [],
      }),
    ])

    expect(result[0].evidence).toContain("\"i got stuck naming what this was\"")
    expect(result[0].sources[0].exact_text).toBe("i got stuck naming what this was")
  })

  it("keeps note insights and chat insights separate by only using chat insight fields", () => {
    const result = buildChatMirrorObservations([
      makeChatInsight({
        did_actions: ["fixed bug"],
        evidence_excerpt: "fixed the bug",
      }),
    ])

    expect(result).toHaveLength(0)
  })

  it("block-linked chat insights can cite the related block", () => {
    const block = makeBlock({ id: "block-1", task_name: "receipt cleanup" })
    const result = buildChatMirrorObservations(
      [
        makeChatInsight({
          related_time_block_id: "block-1",
          scope: "time_block",
          friction_points: ["stuck"],
          evidence_excerpt: "i got stuck naming what this was",
        }),
      ],
      [block],
    )

    expect(result[0].evidence).toContain("chat about")
    expect(result[0].evidence).toContain("receipt cleanup")
  })

  it("uses user message metadata for chat mirror sources", () => {
    const result = buildChatMirrorObservations(
      [
        makeChatInsight({
          intended_actions: ["meant to work on proposal"],
          evidence_claims: [
            {
              id: "claim-1",
              source_type: "companion_message",
              source_id: "message-1",
              source_field: "intended_actions",
              kind: "action",
              text: "meant to work on the proposal",
              context_excerpt: "i meant to work on the proposal but got stuck",
              start_index: 2,
              end_index: 33,
            },
          ],
        }),
      ],
      [],
      [makeMessage()],
    )

    expect(result[0].sources[0]).toMatchObject({
      type: "chat",
      written_at: "2026-05-05T09:45:00.000Z",
      context_label: "general chat",
      full_text: "i meant to work on the proposal but got stuck",
    })
  })

  it("lists every matching chat source on a pattern card", () => {
    const result = buildChatMirrorObservations([
      makeChatInsight({
        id: "chat-insight-1",
        message_id: "message-1",
        intended_actions: ["proposal"],
        evidence_excerpt: "i meant to work on the proposal",
      }),
      makeChatInsight({
        id: "chat-insight-2",
        message_id: "message-2",
        intended_actions: ["invoice"],
        evidence_excerpt: "i intended to clear the invoice queue",
      }),
    ])

    expect(result[0].title).toBe("intended versus actual")
    expect(result[0].sources).toHaveLength(2)
    expect(result[0].sources.map((source) => source.exact_text)).toEqual([
      "i meant to work on the proposal",
      "i intended to clear the invoice queue",
    ])
  })

  it("empty chat insights produce no observations for neutral empty state rendering", () => {
    expect(buildChatMirrorObservations([])).toHaveLength(0)
  })
})

describe("buildNotesMirrorObservations", () => {
  it("includes source entries for claim-backed notes", () => {
    const result = buildNotesMirrorObservations(
      [makeBlock({ task_name: "admin block" })],
      [
        makeNoteInsight({
          friction_points: ["got stuck"],
          evidence_claims: [
            {
              id: "claim-1",
              source_type: "time_block_note",
              source_id: "note-version-1",
              source_field: "friction_points",
              kind: "friction",
              text: "got stuck",
              context_excerpt: "i got stuck on admin but felt relieved after",
              start_index: 2,
              end_index: 11,
            },
          ],
        }),
      ],
      new Map([["note-version-1", "2026-05-05T11:15:00.000Z"]]),
    )

    expect(result[0].evidence).toContain("\"got stuck\"")
    expect(result[0].evidence).not.toContain("source")
    expect(result[0].sources[0]).toMatchObject({
      type: "note",
      written_at: "2026-05-05T11:15:00.000Z",
      context_label: "5 May, admin block",
      exact_text: "got stuck",
      context_excerpt: "i got stuck on admin but felt relieved after",
    })
  })

  it("legacy note rows with source notes still produce sources", () => {
    const result = buildNotesMirrorObservations(
      [makeBlock()],
      [
        makeNoteInsight({
          note_version_id: null,
          friction_points: ["got stuck"],
          evidence_claims: [],
          source_notes: "legacy note said i got stuck naming the task",
          evidence_excerpt: "i got stuck naming the task",
        }),
      ],
    )

    expect(result[0].sources[0]).toMatchObject({
      type: "note",
      written_at: "2026-05-05T10:30:00.000Z",
      exact_text: "i got stuck naming the task",
      context_excerpt: "legacy note said i got stuck naming the task",
    })
  })

  it("lists every matching note source on a pattern card", () => {
    const result = buildNotesMirrorObservations(
      [
        makeBlock({ id: "block-1", task_name: "admin" }),
        makeBlock({ id: "block-2", task_name: "email" }),
      ],
      [
        makeNoteInsight({
          id: "note-insight-1",
          time_block_id: "block-1",
          friction_points: ["stuck"],
          evidence_excerpt: "stuck on admin naming",
        }),
        makeNoteInsight({
          id: "note-insight-2",
          time_block_id: "block-2",
          friction_points: ["blocked"],
          evidence_excerpt: "blocked by the email backlog",
        }),
      ],
    )

    expect(result[0].title).toBe("recurring friction")
    expect(result[0].sources).toHaveLength(2)
    expect(result[0].sources.map((source) => source.context_label)).toEqual([
      "5 May, admin",
      "5 May, email",
    ])
  })

  it("missing note source text falls back to the current evidence excerpt", () => {
    const result = buildNotesMirrorObservations(
      [makeBlock({ notes: null })],
      [
        makeNoteInsight({
          friction_points: ["blocked"],
          source_notes: null,
          evidence_excerpt: "blocked at the handoff",
          evidence_claims: [],
        }),
      ],
    )

    expect(result[0].sources[0].exact_text).toBe("blocked at the handoff")
    expect(result[0].sources[0].context_excerpt).toBe("blocked at the handoff")
  })
})
