import { dashboardSkills, defaultDashboardSkill } from "./registry"
import type { DashboardSkillInput } from "./types"

export interface SkillCatalogEntry {
  slug: string
  label: string
  description: string
}

// Picks which skill best fits the user's current data. Stubbed: returns the
// default. The extension point is an LLM (fast model) that reads recent
// blocks/chat and chooses a skill — or composes several into one view.
export async function pickDashboardSkillSlug(
  _input: DashboardSkillInput,
): Promise<string> {
  return defaultDashboardSkill.slug
}

export function listSkillCatalog(): SkillCatalogEntry[] {
  return dashboardSkills.map((skill) => ({
    slug: skill.slug,
    label: skill.label,
    description: skill.description,
  }))
}
