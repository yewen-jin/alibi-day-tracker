import { describe, expect, it } from "vitest"
import {
  buildDashboardEvidencePacket,
  buildDashboardViewResult,
  validateDashboardViewResult,
  validateDashboardViewSpec,
} from "@/lib/dashboard-view-spec"
import type { DashboardSkillInput } from "@/lib/skills/types"

function emptyInput(): DashboardSkillInput {
  return {
    blocks: [],
    noteInsights: [],
    chatInsights: [],
    chatMessages: [],
    categories: [],
    noteVersionCreatedAtById: new Map(),
  }
}

describe("dashboard view spec validation", () => {
  it("rejects unknown component types", () => {
    expect(() =>
      validateDashboardViewSpec({
        version: 1,
        title: "bad",
        description: "bad",
        sections: [{ id: "x", type: "html", title: "x" }],
      }),
    ).toThrow()
  })

  it("rejects unsafe extra fields", () => {
    expect(() =>
      validateDashboardViewSpec({
        version: 1,
        title: "bad",
        description: "bad",
        sections: [
          {
            id: "x",
            type: "metric_cards",
            title: "x",
            formula: "process.env.SECRET",
          },
        ],
      }),
    ).toThrow()
  })

  it("rejects malformed result data", () => {
    expect(() =>
      validateDashboardViewResult({
        version: 1,
        generated_at: "now",
        input_window_start: null,
        input_window_end: null,
        sections: [
          {
            id: "x",
            type: "simple_chart",
            points: [{ label: "x", value: -1 }],
          },
        ],
      }),
    ).toThrow()
  })

  it("builds an empty renderer-safe result", () => {
    const spec = validateDashboardViewSpec({
      version: 1,
      title: "empty",
      description: "empty result",
      sections: [
        {
          id: "summary",
          type: "metric_cards",
          title: "summary",
          metric: "summary",
        },
        {
          id: "patterns",
          type: "pattern_cards",
          title: "patterns",
        },
      ],
    })

    const result = buildDashboardViewResult(spec, emptyInput())

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].type).toBe("metric_cards")
    expect(result.sections[1].type).toBe("pattern_cards")
  })

  it("builds a bounded evidence packet with stable ids", () => {
    const input = emptyInput()
    input.blocks = [
      {
        id: "block-1",
        user_id: "user-1",
        started_at: "2026-01-01T10:00:00.000Z",
        ended_at: "2026-01-01T11:00:00.000Z",
        duration_seconds: 3600,
        category_id: null,
        task_name: "invoice",
        category: "admin",
        hashtags: [],
        notes: "finished the invoice after avoiding it",
        mood: null,
        effort_level: "hard",
        satisfaction: "satisfied",
        avoidance_marker: true,
        hyperfocus_marker: false,
        guilt_marker: false,
        novelty_marker: false,
        created_at: "2026-01-01T11:00:00.000Z",
        updated_at: "2026-01-01T11:00:00.000Z",
      },
    ]

    const packet = buildDashboardEvidencePacket(input)

    expect(packet.summary.total_minutes).toBe(60)
    expect(packet.blocks[0]).toMatchObject({
      id: "block-1",
      notes_excerpt: "finished the invoice after avoiding it",
      markers: ["avoidance"],
    })
    expect(packet.evidence[0]).toMatchObject({
      id: "block-block-1",
      type: "block",
    })
    expect(Object.keys(packet.blocks[0])).not.toContain("user_id")
  })

  it("builds evidence when legacy insight rows have missing evidence claims", () => {
    const input = emptyInput()
    input.noteInsights = [
      {
        id: "insight-1",
        time_block_id: "block-1",
        note_version_id: null,
        user_id: "user-1",
        source: "notes",
        source_notes: "legacy notes",
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
        evidence_excerpt: "legacy excerpt",
        evidence_claims: undefined as never,
        model_version: "test",
        created_at: "2026-01-01T10:00:00.000Z",
      },
    ]

    const packet = buildDashboardEvidencePacket(input)

    expect(packet.evidence[0]).toMatchObject({
      id: "note-block-1-excerpt",
      type: "note",
      excerpt: "legacy excerpt",
    })
  })

  it("rejects invented evidence references", () => {
    const spec = validateDashboardViewSpec({
      version: 1,
      title: "evidence",
      description: "evidence result",
      sections: [
        {
          id: "observations",
          type: "observation_list",
          title: "observations",
        },
      ],
    })

    expect(() =>
      validateDashboardViewResult(
        {
          version: 1,
          generated_at: "2026-01-01T00:00:00.000Z",
          input_window_start: null,
          input_window_end: null,
          sections: [
            {
              id: "observations",
              type: "observation_list",
              observations: [
                {
                  title: "invented",
                  body: "this cites something outside the packet.",
                  evidence: [
                    {
                      id: "missing",
                      type: "note",
                      label: "note",
                      excerpt: "not in the packet",
                      written_at: "2026-01-01T00:00:00.000Z",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          spec,
          allowedEvidence: [
            {
              id: "known",
              type: "note",
              label: "note",
              excerpt: "from the packet",
              written_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ),
    ).toThrow(/unknown or altered evidence/)
  })

  it("accepts retrieved dashboard evidence only when copied exactly", () => {
    const input = emptyInput()
    const packet = buildDashboardEvidencePacket(input, {
      rag: {
        query: "invoice friction",
        chunks: [
          {
            id: "time_block:block-1:0",
            sourceType: "time_block",
            sourceCreatedAt: "2026-01-01T10:00:00.000Z",
            chunkText: "saved time block: invoice\nnotes: finished after avoiding it",
            metadata: { source_label: "invoice" },
          },
        ],
      },
    })
    const spec = validateDashboardViewSpec({
      version: 1,
      title: "retrieved",
      description: "retrieved evidence result",
      sections: [
        {
          id: "observations",
          type: "observation_list",
          title: "observations",
        },
      ],
    })
    const evidence = packet.evidence[0]

    expect(packet.evidence_synthesis?.cited_chunk_ids).toContain("time_block:block-1:0")
    expect(() =>
      validateDashboardViewResult(
        {
          version: 1,
          generated_at: "2026-01-01T00:00:00.000Z",
          input_window_start: null,
          input_window_end: null,
          sections: [
            {
              id: "observations",
              type: "observation_list",
              observations: [
                {
                  title: "invoice",
                  body: "the retrieved record shows invoice friction.",
                  evidence: [evidence],
                },
              ],
            },
          ],
        },
        { spec, allowedEvidence: packet.evidence },
      ),
    ).not.toThrow()

    expect(() =>
      validateDashboardViewResult(
        {
          version: 1,
          generated_at: "2026-01-01T00:00:00.000Z",
          input_window_start: null,
          input_window_end: null,
          sections: [
            {
              id: "observations",
              type: "observation_list",
              observations: [
                {
                  title: "altered",
                  body: "this changes the copied retrieved source.",
                  evidence: [{ ...evidence, excerpt: "altered excerpt" }],
                },
              ],
            },
          ],
        },
        { spec, allowedEvidence: packet.evidence },
      ),
    ).toThrow(/unknown or altered evidence/)
  })
})
