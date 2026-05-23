import { redirect } from "next/navigation"
import { getCompanionThread } from "@/app/actions/process-message"
import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import {
  getActiveTimerForUser,
  listTimeBlockCategories,
} from "@/lib/repositories/time-blocks"
import { TopNav } from "@/components/top-nav"
import { TimerTrackerApp } from "@/components/timer-tracker-app"

export default async function AppPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth/login")
  }

  await syncAppUser(user)

  const [activeTimer, categories, companionThread] = await Promise.all([
    getActiveTimerForUser(user.id),
    listTimeBlockCategories(user.id),
    getCompanionThread(),
  ])

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 p-8">
        <TopNav activeHref="/app" />
        <TimerTrackerApp
          initialActiveTimer={activeTimer}
          initialCategories={categories}
          initialCompanionThread={companionThread ?? undefined}
        />
      </div>
    </main>
  )
}
