import type { ReactNode } from "react"
import type {
  CompanionMessage,
  CompanionMessageInsight,
  TimeBlock,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
} from "@/lib/types"

export interface DashboardSkillInput {
  blocks: TimeBlock[]
  noteInsights: TimeBlockInsight[]
  chatInsights: CompanionMessageInsight[]
  chatMessages: CompanionMessage[]
  categories: TimeBlockCategoryRecord[]
  noteVersionCreatedAtById: Map<string, string>
}

export interface DashboardSkill {
  id: string
  slug: string
  label: string
  tagline: string
  description: string
  render: (input: DashboardSkillInput) => ReactNode
}
