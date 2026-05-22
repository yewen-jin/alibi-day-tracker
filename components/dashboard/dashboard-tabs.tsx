import type { DashboardSkill } from "@/lib/skills/types"
import type { DashboardViewRecord } from "@/lib/types"
import { DashboardTabsClient } from "@/components/dashboard/dashboard-tabs-client"

interface DashboardTabsProps {
  skills: DashboardSkill[]
  customViews?: DashboardViewRecord[]
  draftViews?: DashboardViewRecord[]
  customViewsSchemaReady?: boolean
  customViewNotice?: string
  activeSlug: string
}

export function DashboardTabs({
  skills,
  customViews = [],
  draftViews = [],
  customViewsSchemaReady = true,
  customViewNotice,
  activeSlug,
}: DashboardTabsProps) {
  const tabs = [
    ...skills.map((skill) => ({
      slug: skill.slug,
      label: skill.label,
      description: skill.description,
    })),
    ...customViews.map((view) => ({
      slug: view.slug,
      label: view.title,
      description: view.description ?? "custom dashboard view",
    })),
  ]

  return (
    <DashboardTabsClient
      tabs={tabs}
      draftViews={draftViews}
      customViewsSchemaReady={customViewsSchemaReady}
      customViewNotice={customViewNotice}
      activeSlug={activeSlug}
    />
  )
}
