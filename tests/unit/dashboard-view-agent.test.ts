import { describe, expect, it, vi } from "vitest"
import { NoObjectGeneratedError, type LanguageModel } from "ai"
import {
  dashboardGenerationErrorMessage,
  dashboardSystemPrompt,
  generateDashboardCreateSnapshot,
  generateDashboardRefreshSnapshot,
  validateDashboardCreateOutput,
} from "@/lib/dashboard-view-agent"
import type {
  DashboardViewEvidence,
  DashboardViewEvidencePacket,
  DashboardViewResult,
  DashboardViewSpec,
} from "@/lib/dashboard-view-spec"

const evidence: DashboardViewEvidence = {
  id: "block-admin",
  type: "block",
  label: "admin invoices",
  excerpt: "finished invoices after putting them off",
  written_at: "2026-01-01T10:00:00.000Z",
}

function packet(): DashboardViewEvidencePacket {
  return {
    version: 1,
    generated_at: "2026-01-02T00:00:00.000Z",
    input_window_start: "2026-01-01T10:00:00.000Z",
    input_window_end: "2026-01-01T11:00:00.000Z",
    summary: {
      block_count: 1,
      total_minutes: 60,
      note_insight_count: 0,
      chat_insight_count: 0,
    },
    categories: [
      {
        name: "admin",
        slug: "admin",
        color: "#93A5E4",
      },
    ],
    aggregates: {
      time_by_category: [{ label: "admin", value: 60 }],
      hourly: [{ label: "10:00", value: 1 }],
      effort: [{ label: "hard", count: 1, pct: 100 }],
      satisfaction: [{ label: "satisfied", count: 1, pct: 100 }],
    },
    blocks: [
      {
        id: "admin",
        started_at: "2026-01-01T10:00:00.000Z",
        ended_at: "2026-01-01T11:00:00.000Z",
        duration_minutes: 60,
        category: "admin",
        task_name: "invoices",
        notes_excerpt: "finished invoices after putting them off",
        effort_level: "hard",
        satisfaction: "satisfied",
        markers: ["avoidance"],
      },
    ],
    evidence: [evidence],
  }
}

function spec(): DashboardViewSpec {
  return {
    version: 1,
    title: "admin avoidance",
    description: "patterns around avoided admin work",
    sections: [
      {
        id: "admin-patterns",
        type: "pattern_cards",
        title: "admin patterns",
        source: "patterns",
      },
      {
        id: "source-check",
        type: "source_panel",
        title: "source check",
        source: "evidence",
      },
    ],
  }
}

function result(savedSpec = spec(), body = "Admin work shows an avoidance marker in the current record."): DashboardViewResult {
  return {
    version: 1,
    generated_at: "2026-01-02T00:00:00.000Z",
    input_window_start: "2026-01-01T10:00:00.000Z",
    input_window_end: "2026-01-01T11:00:00.000Z",
    sections: savedSpec.sections.map((section) => {
      if (section.type === "pattern_cards") {
        return {
          id: section.id,
          type: section.type,
          patterns: [
            {
              title: "admin starts late",
              body,
              evidence: [evidence],
            },
          ],
        }
      }

      return {
        id: section.id,
        type: section.type,
        panels: [
          {
            title: "admin evidence",
            sources: [evidence],
          },
        ],
      }
    }),
  }
}

function generator(outputs: unknown[]) {
  return vi.fn(async () => ({ output: outputs.shift() }))
}

const model = {} as LanguageModel

describe("dashboard view agent", () => {
  it("prompts the model to compose dashboard UI from evidence", () => {
    const prompt = dashboardSystemPrompt("create")

    expect(prompt).toContain("packet.blocks are saved time blocks")
    expect(prompt).toContain("packet.evidence contains qualitative notes, chat, and block excerpts")
    expect(prompt).toContain("which categories leave me satisfied")
    expect(prompt).toContain("Numeric metric values must be strings")
    expect(prompt).toContain("Chart point values must be numbers")
  })

  it("accepts a valid nuanced dashboard output", async () => {
    const output = { spec: spec(), result: result() }
    const generate = generator([output])

    const snapshot = await generateDashboardCreateSnapshot(
      "why do I avoid admin work?",
      packet(),
      { dashboardModel: model },
      { generate: generate as never },
    )

    expect(snapshot.spec.sections.map((section) => section.type)).toEqual([
      "pattern_cards",
      "source_panel",
    ])
    expect(snapshot.result.sections[0]).toMatchObject({
      id: "admin-patterns",
      type: "pattern_cards",
    })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it("retries once with a repair prompt when the first response is invalid", async () => {
    const invalid = {
      spec: spec(),
      result: {
        ...result(),
        sections: [
          {
            id: "wrong-id",
            type: "pattern_cards",
            patterns: [],
          },
        ],
      },
    }
    const generate = generator([invalid, { spec: spec(), result: result() }])

    const snapshot = await generateDashboardCreateSnapshot(
      "why do I avoid admin work?",
      packet(),
      { dashboardModel: model },
      { generate: generate as never },
    )

    expect(snapshot.result.sections[0].id).toBe("admin-patterns")
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[1][0].prompt).toContain("failed validation")
    expect(generate.mock.calls[1][0].prompt).toContain("dashboard result sections do not match")
  })

  it("strictly validates JSON extracted from an unparseable structured response", async () => {
    const generate = vi.fn(async () => {
      throw new NoObjectGeneratedError({
        message: "No object generated: could not parse the response.",
        text: `Here is the dashboard JSON:\n\`\`\`json\n${JSON.stringify({
          spec: spec(),
          result: result(),
        })}\n\`\`\``,
        response: {} as never,
        usage: {} as never,
        finishReason: "stop",
      })
    })

    const snapshot = await generateDashboardCreateSnapshot(
      "why do I avoid admin work?",
      packet(),
      { dashboardModel: model },
      { generate: generate as never },
    )

    expect(snapshot.result.sections[0].id).toBe("admin-patterns")
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it("throws a readable error after the repair response is still invalid", async () => {
    const invalid = {
      spec: spec(),
      result: {
        ...result(),
        sections: [
          {
            id: "admin-patterns",
            type: "pattern_cards",
            patterns: [
              {
                title: "bad evidence",
                body: "cites an invented source.",
                evidence: [
                  {
                    ...evidence,
                    id: "invented",
                  },
                ],
              },
            ],
          },
          result().sections[1],
        ],
      },
    }
    const generate = generator([invalid, invalid])

    await expect(
      generateDashboardCreateSnapshot(
        "why do I avoid admin work?",
        packet(),
        { dashboardModel: model },
        { generate: generate as never },
      ),
    ).rejects.toThrow(dashboardGenerationErrorMessage())
  })

  it("rejects invented evidence ids", () => {
    expect(() =>
      validateDashboardCreateOutput(
        {
          spec: spec(),
          result: {
            ...result(),
            sections: [
              {
                id: "admin-patterns",
                type: "pattern_cards",
                patterns: [
                  {
                    title: "invented",
                    body: "this should be rejected.",
                    evidence: [{ ...evidence, id: "invented" }],
                  },
                ],
              },
              result().sections[1],
            ],
          },
        },
        packet(),
      ),
    ).toThrow(/unknown or altered evidence/)
  })

  it("refresh preserves the saved spec and replaces only result content", async () => {
    const savedSpec = spec()
    const freshResult = result(savedSpec, "Fresh evidence changes the pattern wording.")
    const generate = generator([{ result: freshResult }])

    const refreshed = await generateDashboardRefreshSnapshot(
      "why do I avoid admin work?",
      savedSpec,
      packet(),
      { dashboardModel: model },
      { generate: generate as never },
    )

    expect(refreshed.sections.map((section) => [section.id, section.type])).toEqual(
      savedSpec.sections.map((section) => [section.id, section.type]),
    )
    expect(JSON.stringify(refreshed)).toContain("Fresh evidence changes the pattern wording.")
    expect(generate.mock.calls[0][0].prompt).toContain("Saved dashboard spec")
  })
})
