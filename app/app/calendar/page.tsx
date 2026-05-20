import { redirect } from "next/navigation"
import { getCompanionThread } from "@/app/actions/process-message"
import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import {
  listCompletedTimeBlocksInRange,
  listTimeBlockCategories,
} from "@/lib/repositories/time-blocks"
import { getMonthRange } from "@/lib/time-block-display"
import { TopNav } from "@/components/top-nav"
import { CalendarWorkspace } from "@/components/calendar-workspace"

export default async function CalendarPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/auth/login")

  await syncAppUser(user)

  const month = getMonthRange()
  const [timeBlocks, categories, companionThread] = await Promise.all([
    listCompletedTimeBlocksInRange(user.id, month.input.start, month.input.end),
    listTimeBlockCategories(user.id),
    getCompanionThread(),
  ])

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 p-8">
        <TopNav userEmail={user.email ?? null} activeHref="/app/calendar" />

        <header className="px-2 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[1.9rem] font-black tracking-tight text-alibi-blue">
              calendar
            </h1>
            <span className="rounded-full bg-alibi-pink/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
              timeline workspace
            </span>
          </div>
          <p className="mt-1 text-base font-semibold leading-relaxed text-alibi-teal">
            scan days, inspect blocks, and reflect without leaving the timeline.
          </p>
        </header>

        <CalendarWorkspace
          initialBlocks={timeBlocks}
          initialCategories={categories}
          initialCompanionThread={companionThread ?? undefined}
        />

        <footer className="text-center text-sm font-semibold tracking-[0.04em] text-alibi-teal">
          alibi — for the days you can&apos;t see clearly
        </footer>
      </div>
    </main>
  )
}
