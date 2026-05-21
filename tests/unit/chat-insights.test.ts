import { describe, expect, it } from "vitest"
import { deriveChatInsightFromMessage } from "@/lib/chat-insights"

describe("deriveChatInsightFromMessage", () => {
  it("returns null for empty messages", () => {
    expect(deriveChatInsightFromMessage(null)).toBeNull()
    expect(deriveChatInsightFromMessage("")).toBeNull()
    expect(deriveChatInsightFromMessage("   ")).toBeNull()
  })

  it("extracts intended action from meant-to language", () => {
    const result = deriveChatInsightFromMessage("i meant to work on the proposal but got stuck")
    expect(result?.intended_actions[0]).toContain("meant to work on the proposal")
    expect(result?.themes).toContain("intention")
  })

  it("extracts useful drift from a sidetrack with value", () => {
    const result = deriveChatInsightFromMessage("got distracted but fixed the gallery upload bug")
    expect(result?.useful_drift[0]).toContain("got distracted but fixed")
    expect(result?.themes).toContain("useful drift")
  })

  it("extracts guilt and mismatch from did-nothing language with a correction", () => {
    const result = deriveChatInsightFromMessage("felt like i did nothing but actually fixed the receipt mess")
    expect(result?.mismatch_signals.length).toBeGreaterThan(0)
    expect(result?.emotional_signals.length).toBeGreaterThan(0)
    expect(result?.themes).toContain("mismatch")
  })

  it("does not create missing-work claims without stated intent", () => {
    const result = deriveChatInsightFromMessage("i felt scattered after lunch")
    expect(result?.intended_actions).toHaveLength(0)
    expect(result?.avoided_or_deferred).toHaveLength(0)
    expect(result?.mismatch_signals).toHaveLength(0)
  })

  it("creates exact claims for chat signals", () => {
    const message = [
      "i meant to finish invoices but deferred the receipt cleanup.",
      "got stuck on reconciliation and felt anxious.",
      "got distracted but fixed the upload bug.",
      "felt like i did nothing but actually finished the draft.",
    ].join(" ")

    const result = deriveChatInsightFromMessage(message)
    const claims = result?.evidence_claims ?? []

    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: "companion_message",
          source_field: "intended_actions",
          kind: "action",
          text: "i meant to finish invoices but deferred the receipt cleanup",
        }),
        expect.objectContaining({
          source_field: "avoided_or_deferred",
          kind: "avoidance",
          text: "deferred the receipt cleanup",
        }),
        expect.objectContaining({
          source_field: "friction_points",
          kind: "friction",
          text: "stuck on reconciliation and felt anxious",
        }),
        expect.objectContaining({
          source_field: "emotional_signals",
          kind: "emotion",
          text: "felt anxious",
        }),
        expect.objectContaining({
          source_field: "useful_drift",
          kind: "useful_drift",
          text: "got distracted but fixed the upload bug",
        }),
        expect.objectContaining({
          source_field: "mismatch_signals",
          kind: "mismatch",
          text: "felt like i did nothing but actually finished the draft",
        }),
      ]),
    )

    for (const claim of claims) {
      expect(message).toContain(claim.text)
    }
  })
})
