import "server-only"

import {
  deriveChatInsightFromMessage,
  deriveCompanionMessageInsightRecord,
} from "@/lib/chat-insights"
import { attachEvidenceSourceId } from "@/lib/evidence-claims"
import { deriveInsightFromNotes } from "@/lib/note-insights"
import {
  listRecentCompanionMessageInsights,
  listRecentUserCompanionMessages,
} from "@/lib/repositories/companion"
import {
  listRecentCompletedTimeBlocks,
  listTimeBlockCategories,
  listTimeBlockInsightsForBlocks,
  listTimeBlockNoteVersionsByIds,
} from "@/lib/repositories/time-blocks"
import type { CompanionConversation, CompanionMessageInsight } from "@/lib/types"
import type { DashboardSkillInput } from "@/lib/skills/types"

export async function loadDashboardSkillInput(userId: string): Promise<DashboardSkillInput> {
  const since = new Date()
  since.setDate(since.getDate() - 90)

  const [blocks, chatInsights, categories, userMessages] = await Promise.all([
    listRecentCompletedTimeBlocks(userId, since),
    listRecentCompanionMessageInsights(userId, { since }),
    listTimeBlockCategories(userId),
    listRecentUserCompanionMessages(userId, { since }),
  ])
  const blockIds = blocks.map((block) => block.id)
  const insights = await listTimeBlockInsightsForBlocks(userId, blockIds)
  const noteVersionIds = Array.from(
    new Set(
      insights
        .map((insight) => insight.note_version_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const noteVersions = await listTimeBlockNoteVersionsByIds(userId, noteVersionIds)
  const noteVersionCreatedAtById = new Map(
    noteVersions.map((version) => [version.id, version.created_at]),
  )
  const hydratedNoteInsights = insights.map((insight) => {
    if (insight.evidence_claims?.length || !insight.source_notes?.trim()) {
      return insight
    }

    const derived = deriveInsightFromNotes(insight.source_notes)
    return {
      ...insight,
      evidence_claims: attachEvidenceSourceId(
        derived?.evidence_claims ?? [],
        insight.note_version_id ?? insight.time_block_id,
      ),
    }
  })
  const messagesById = new Map(userMessages.map((message) => [message.id, message]))
  const hydratedChatInsights = chatInsights.map((insight) => {
    if (insight.evidence_claims?.length) {
      return insight
    }

    const message = messagesById.get(insight.message_id)
    const derived = deriveChatInsightFromMessage(message?.content ?? null)
    return {
      ...insight,
      evidence_claims: attachEvidenceSourceId(
        derived?.evidence_claims ?? [],
        insight.message_id,
      ),
    }
  })
  const messageBackfillInsights = userMessages
    .map((message) =>
      deriveCompanionMessageInsightRecord(
        message,
        {
          kind: message.related_time_block_id ? "time_block" : "general",
        } satisfies Pick<CompanionConversation, "kind">,
        {
          id: `dashboard-derived-${message.id}`,
          createdAt: message.created_at,
        },
      ),
    )
    .filter((insight): insight is CompanionMessageInsight => Boolean(insight))
  const insightMessageIds = new Set(
    hydratedChatInsights.map((insight) => insight.message_id),
  )
  const mergedChatInsights = [
    ...hydratedChatInsights,
    ...messageBackfillInsights.filter(
      (insight) => !insightMessageIds.has(insight.message_id),
    ),
  ]

  return {
    blocks,
    noteInsights: hydratedNoteInsights,
    chatInsights: mergedChatInsights,
    chatMessages: userMessages,
    categories,
    noteVersionCreatedAtById,
  }
}
