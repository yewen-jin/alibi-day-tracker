import { redirect } from "next/navigation"
import { getCompanionThread } from "@/app/actions/process-message"
import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import {
  listCompletedTimeBlocksInRange,
  listTimeBlockCategories,
} from "@/lib/repositories/time-blocks"
import { getMonthRange } from "@/lib/time-block-display"
import { getGoogleCalendarConnection } from "@/lib/google-calendar"
import { TopNav } from "@/components/top-nav"
import { CalendarWorkspace } from "@/components/calendar-workspace"
import { CalendarSyncControls } from "@/components/calendar-sync-controls"

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function googleStatusMessage(status: string | undefined, message: string | undefined) {
  if (status === "connected") {
    return { type: "success" as const, text: "google calendar connected." }
  }

  if (status === "not_configured") {
    return { type: "error" as const, text: "google calendar is not configured. check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and NEXT_PUBLIC_SITE_URL." }
  }

  if (status === "missing") {
    return { type: "error" as const, text: message || "google did not return the required callback values." }
  }

  if (status === "error") {
    return { type: "error" as const, text: message || "google calendar connection failed." }
  }

  return null
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getCurrentUser()

  if (!user) redirect("/auth/login")

  await syncAppUser(user)

  const params = searchParams ? await searchParams : {}
  const googleStatus = googleStatusMessage(
    firstSearchParam(params.google),
    firstSearchParam(params.message),
  )
  const month = getMonthRange()
  const [timeBlocks, categories, companionThread, calendarConnection] = await Promise.all([
    listCompletedTimeBlocksInRange(user.id, month.input.start, month.input.end),
    listTimeBlockCategories(user.id),
    getCompanionThread(),
    getGoogleCalendarConnection(user.id),
  ])

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 p-8">
        <TopNav activeHref="/app/calendar" />

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

        {googleStatus && (
          <div
            role={googleStatus.type === "error" ? "alert" : undefined}
            className={
              googleStatus.type === "error"
                ? "alibi-banner-error"
                : "alibi-banner-info"
            }
          >
            {googleStatus.text}
          </div>
        )}

        <CalendarSyncControls connection={calendarConnection} />

        <footer className="text-center text-sm font-semibold tracking-[0.04em] text-alibi-teal">
          alibi — for the days you can&apos;t see clearly
        </footer>
      </div>
    </main>
  )
}
