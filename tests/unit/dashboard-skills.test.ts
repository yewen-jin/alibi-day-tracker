import { describe, expect, it } from "vitest"
import { getDashboardSkill } from "@/lib/skills/registry"

describe("dashboard skill slugs", () => {
  it("maps the legacy adhd slug to productivity-pattern", () => {
    expect(getDashboardSkill("adhd").slug).toBe("productivity-pattern")
  })
})
