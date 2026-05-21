import { adhdResearchSkill } from "./adhd-research"
import type { DashboardSkill } from "./types"

export const dashboardSkills: DashboardSkill[] = [adhdResearchSkill]

export const defaultDashboardSkill = dashboardSkills[0]

export function getDashboardSkill(slug: string | undefined | null): DashboardSkill {
  if (slug) {
    const found = dashboardSkills.find((skill) => skill.slug === slug)
    if (found) return found
  }
  return defaultDashboardSkill
}
