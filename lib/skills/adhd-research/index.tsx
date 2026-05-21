import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import type { DashboardSkill, DashboardSkillInput } from "@/lib/skills/types"

function AdhdResearchView(input: DashboardSkillInput) {
  return (
    <DashboardOverview
      blocks={input.blocks}
      insights={input.noteInsights}
      categories={input.categories.length > 0 ? input.categories : undefined}
      chatInsights={input.chatInsights}
      chatMessages={input.chatMessages}
      noteVersionCreatedAtById={input.noteVersionCreatedAtById}
    />
  )
}

export const adhdResearchSkill: DashboardSkill = {
  id: "adhd-research",
  slug: "adhd",
  label: "adhd reflections",
  tagline: "what you've been doing",
  description:
    "patterns from notes and chat: friction, avoidance, hyperfocus, useful drift, emotional load. evidence-led, no scoring.",
  render: AdhdResearchView,
}
