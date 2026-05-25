import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  deriveWindow,
  getDayRange,
  inferCategoryFromText,
  resolveCategory,
} from "@/lib/block-draft-utils"
import type { CompanionDraft } from "@/lib/block-draft-utils"

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

describe("deriveWindow", () => {
  it("returns null when draft has no time information", () => {
    expect(deriveWindow(emptyDraft())).toBeNull()
  })

  it("returns window from explicit started_at + ended_at", () => {
    const draft = emptyDraft({
      started_at: "2026-05-05T10:00:00.000Z",
      ended_at: "2026-05-05T11:00:00.000Z",
    })
    const result = deriveWindow(draft)
    expect(result).not.toBeNull()
    expect(result?.startedAt).toBe("2026-05-05T10:00:00.000Z")
    expect(result?.endedAt).toBe("2026-05-05T11:00:00.000Z")
  })

  it("returns null when ended_at is before started_at", () => {
    const draft = emptyDraft({
      started_at: "2026-05-05T11:00:00.000Z",
      ended_at: "2026-05-05T10:00:00.000Z",
    })
    expect(deriveWindow(draft)).toBeNull()
  })

  it("derives start from ended_at + duration_minutes", () => {
    const draft = emptyDraft({
      ended_at: "2026-05-05T11:00:00.000Z",
      duration_minutes: 60,
    })
    const result = deriveWindow(draft)
    expect(result?.startedAt).toBe("2026-05-05T10:00:00.000Z")
    expect(result?.endedAt).toBe("2026-05-05T11:00:00.000Z")
  })

  it("derives end from started_at + duration_minutes", () => {
    const draft = emptyDraft({
      started_at: "2026-05-05T10:00:00.000Z",
      duration_minutes: 90,
    })
    const result = deriveWindow(draft)
    expect(result?.startedAt).toBe("2026-05-05T10:00:00.000Z")
    expect(result?.endedAt).toBe("2026-05-05T11:30:00.000Z")
  })

  it("derives a recent completed window ending now when only duration_minutes is given", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-05T12:00:00.000Z"))
    const draft = emptyDraft({ duration_minutes: 30 })
    const result = deriveWindow(draft)
    expect(result?.startedAt).toBe("2026-05-05T11:30:00.000Z")
    expect(result?.endedAt).toBe("2026-05-05T12:00:00.000Z")
    vi.useRealTimers()
  })
})

describe("inferCategoryFromText", () => {
  it("matches deep_work keywords", () => {
    expect(inferCategoryFromText("worked on coding the new feature")).toBe("deep_work")
  })

  it("matches rest keywords", () => {
    expect(inferCategoryFromText("took a nap to recover")).toBe("rest")
  })

  it("returns null for ambiguous text matching multiple categories", () => {
    // "email" (admin) + "meeting" (social)
    expect(inferCategoryFromText("email about the meeting")).toBeNull()
  })

  it("returns null for text with no keyword matches", () => {
    expect(inferCategoryFromText("did a thing")).toBeNull()
  })
})

describe("resolveCategory", () => {
  it("returns extracted when category is set on draft", () => {
    const draft = emptyDraft({ category: "admin" })
    const result = resolveCategory(draft)
    expect(result.source).toBe("extracted")
    expect(result.category).toBe("admin")
  })

  it("returns inferred when no explicit category but text matches", () => {
    const draft = emptyDraft({ task_name: "write the client proposal" })
    const result = resolveCategory(draft)
    expect(result.source).toBe("inferred")
    expect(result.category).toBe("deep_work")
  })

  it("returns none when no category and no keyword match", () => {
    const draft = emptyDraft({ task_name: "did a thing" })
    const result = resolveCategory(draft)
    expect(result.source).toBe("none")
    expect(result.category).toBeNull()
  })

  it("considers hashtags when inferring category", () => {
    const draft = emptyDraft({ hashtags: ["exercise"] })
    const result = resolveCategory(draft)
    expect(result.source).toBe("inferred")
    expect(result.category).toBe("care")
  })
})

describe("getDayRange", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-05T14:30:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("start is midnight of the current server day", () => {
    const { start } = getDayRange()
    const d = new Date(start)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })

  it("end is exactly 24 hours after start", () => {
    const { start, end } = getDayRange()
    const diff = new Date(end).getTime() - new Date(start).getTime()
    expect(diff).toBe(86_400_000)
  })
})
