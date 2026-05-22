import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { fastModelId } from "@/lib/ai"
import { AI_PROVIDER_PRESETS } from "@/lib/ai-provider-presets"

describe("ai model defaults", () => {
  it("uses deepseek chat v3 as the hosted fast model", () => {
    expect(fastModelId).toBe("deepseek/deepseek-chat-v3")
    expect(
      AI_PROVIDER_PRESETS.find((preset) => preset.id === "openrouter-default"),
    ).toMatchObject({
      fastModel: "deepseek/deepseek-chat-v3",
    })
  })

  it("migrates only rows that still use the previous fast default", () => {
    const migration = readFileSync(
      "db/migrations/009_default_fast_model_deepseek_v3.sql",
      "utf8",
    )

    expect(migration).toContain("set fast_model = 'deepseek/deepseek-chat-v3'")
    expect(
      migration.match(new RegExp("where fast_model = 'openai/gpt-4\\.1-nano'", "g")),
    ).toHaveLength(2)
  })
})
