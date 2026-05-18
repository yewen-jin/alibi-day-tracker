import { redirect } from "next/navigation"
import { getCompanionThread } from "@/app/actions/process-message"
import { getCurrentUser } from "@/lib/auth/session"
import { TimerTrackerApp } from "@/components/timer-tracker-app"

export default async function AppPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth/login")
  }

  const companionThread = await getCompanionThread()

  return (
    <TimerTrackerApp
      userEmail={user.email ?? null}
      initialCompanionThread={companionThread ?? undefined}
    />
  )
}
