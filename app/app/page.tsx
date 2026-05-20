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
    <main className="alibi-page px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <TopNav userEmail={user.email ?? null} activeHref="/app" />
        <TimerTrackerApp
          initialActiveTimer={activeTimer}
          initialCategories={categories}
          initialCompanionThread={companionThread ?? undefined}
        />
      </div>
    </main>
  )
}
