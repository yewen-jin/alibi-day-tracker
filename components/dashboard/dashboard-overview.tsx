import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type {
  CompanionMessageInsight,
  CompanionMessage,
  TimeBlock,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
} from "@/lib/types"
import { StatsOverview } from "@/components/dashboard/stats-overview"
import { ProductivityPatterns } from "@/components/dashboard/productivity-patterns"
import { NotesMirror } from "@/components/dashboard/notes-mirror"
import { ChatMirror } from "@/components/dashboard/chat-mirror"

interface DashboardOverviewProps {
  blocks: TimeBlock[]
  insights: TimeBlockInsight[]
  categories?: TimeBlockCategoryRecord[]
  chatInsights?: CompanionMessageInsight[]
  chatMessages?: CompanionMessage[]
  noteVersionCreatedAtById?: Map<string, string>
  emptyHref?: string
  emptyAction?: string
}

export function DashboardOverview({
  blocks,
  insights,
  categories,
  chatInsights = [],
  chatMessages = [],
  noteVersionCreatedAtById,
  emptyHref = "/app",
  emptyAction = "start tracking",
}: DashboardOverviewProps) {
  if (blocks.length === 0 && chatInsights.length === 0) {
    return (
      <section className="alibi-card-pop flex flex-col items-center justify-center px-8 py-16 text-center">
        <p className="text-[15px] font-bold leading-[1.5] text-alibi-blue">
          nothing on the record yet.
        </p>
        <p className="mt-1 text-base font-semibold text-alibi-teal">
          start a timer, then save the block here.
        </p>
        <Link
          href={emptyHref}
          className="alibi-button-primary mt-6 inline-flex items-center gap-2 py-2.5 text-base active:scale-95"
        >
          {emptyAction}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
        </Link>
      </section>
    )
  }

  if (blocks.length === 0) {
    return (
      <div className="space-y-5">
        <section className="alibi-card-pop flex flex-col items-center justify-center px-8 py-10 text-center">
          <p className="text-[15px] font-bold leading-[1.5] text-alibi-blue">
            no saved blocks yet.
          </p>
          <p className="mt-1 text-base font-semibold text-alibi-teal">
            chat can still show how you have been describing the day.
          </p>
          <Link
            href={emptyHref}
            className="alibi-button-primary mt-6 inline-flex items-center gap-2 py-2.5 text-base active:scale-95"
          >
            {emptyAction}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
          </Link>
        </section>
        <ChatMirror blocks={blocks} insights={chatInsights} messages={chatMessages} />
        <ProductivityPatterns
          blocks={blocks}
          insights={insights}
          chatInsights={chatInsights}
          chatMessages={chatMessages}
          noteVersionCreatedAtById={noteVersionCreatedAtById}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <StatsOverview blocks={blocks} />
      <NotesMirror
        blocks={blocks}
        insights={insights}
        noteVersionCreatedAtById={noteVersionCreatedAtById}
      />
      <ChatMirror blocks={blocks} insights={chatInsights} messages={chatMessages} />
      <ProductivityPatterns
        blocks={blocks}
        insights={insights}
        chatInsights={chatInsights}
        chatMessages={chatMessages}
        noteVersionCreatedAtById={noteVersionCreatedAtById}
      />
    </div>
  )
}
