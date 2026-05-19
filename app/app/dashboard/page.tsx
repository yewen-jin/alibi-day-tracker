import { redirect } from "next/navigation"
import { deriveCompanionMessageInsightRecord } from "@/lib/chat-insights"
import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import {
  listRecentCompanionMessageInsights,
  listRecentUserCompanionMessages,
} from "@/lib/repositories/companion"
import {
  listRecentCompletedTimeBlocks,
  listTimeBlockCategories,
  listTimeBlockInsightsForBlocks,
} from "@/lib/repositories/time-blocks"
import type {
  CompanionConversation,
  CompanionMessageInsight,
} from "@/lib/types"
import { TopNav } from "@/components/top-nav"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/")

  await syncAppUser(user)

  const since = new Date()
  since.setDate(since.getDate() - 90)

  const [
    safeBlocks,
    safeChatInsights,
    safeCategories,
    userMessages,
  ] = await Promise.all([
    listRecentCompletedTimeBlocks(user.id, since),
    listRecentCompanionMessageInsights(user.id),
    listTimeBlockCategories(user.id),
    listRecentUserCompanionMessages(user.id),
  ])
  const blockIds = safeBlocks.map((block) => block.id)
  const safeInsights = await listTimeBlockInsightsForBlocks(user.id, blockIds)
  const messageBackfillInsights = userMessages
    .map((message) =>
      deriveCompanionMessageInsightRecord(
        message,
        {
          kind: message.related_time_block_id
            ? "time_block"
            : "general",
        } satisfies Pick<CompanionConversation, "kind">,
        {
          id: `dashboard-derived-${message.id}`,
          createdAt: message.created_at,
        },
      ),
    )
    .filter((insight): insight is CompanionMessageInsight => Boolean(insight))
  const insightMessageIds = new Set(
    safeChatInsights.map((insight) => insight.message_id),
  )
  const mergedChatInsights = [
    ...safeChatInsights,
    ...messageBackfillInsights.filter(
      (insight) => !insightMessageIds.has(insight.message_id),
    ),
  ]

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 p-8">
        <TopNav userEmail={user.email ?? null} activeHref="/app/dashboard" />

        <header className="px-2 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[1.8rem] font-black tracking-tight text-alibi-blue">
              the dashboard
            </h1>
            <span className="rounded-full bg-alibi-pink/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
              what you&apos;ve been doing
            </span>
          </div>
          <p className="mt-1 text-base font-semibold leading-relaxed text-alibi-teal">
            a quiet look back. nothing graded, just shown.
          </p>
        </header>

        <DashboardOverview
          blocks={safeBlocks}
          insights={safeInsights}
          categories={safeCategories.length > 0 ? safeCategories : undefined}
          chatInsights={mergedChatInsights}
        />

        <footer className="text-center text-sm font-semibold tracking-[0.04em] text-alibi-teal">
          alibi — for the days you can&apos;t see clearly
        </footer>
      </div>
    </main>
  )
}
