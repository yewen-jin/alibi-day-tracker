import { productivityPatternSkill } from "./productivity-pattern"
import type { DashboardSkill } from "./types"

export const dashboardSkills: DashboardSkill[] = [productivityPatternSkill]

export const defaultDashboardSkill = dashboardSkills[0]

export function getDashboardSkill(slug: string | undefined | null): DashboardSkill {
  if (slug) {
    const found = dashboardSkills.find(
      (skill) => skill.slug === slug || skill.aliases?.includes(slug),
    )
    if (found) return found
  }
  return defaultDashboardSkill
}
