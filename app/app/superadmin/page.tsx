import { redirect } from "next/navigation"
import { getCurrentUser, isSuperadmin } from "@/lib/auth/session"
import {
  getSuperadminOverview,
  listSuperadminUserUsage,
  normalizeSuperadminWindowDays,
  SUPERADMIN_WINDOW_OPTIONS,
} from "@/lib/repositories/superadmin"
import {
  SuperadminAccessDenied,
  SuperadminDashboard,
} from "@/components/superadmin/superadmin-dashboard"

export const dynamic = "force-dynamic"

interface SuperadminPageProps {
  searchParams?: Promise<{
    window?: string | string[]
  }>
}

function parseWindowDays(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 30

  return normalizeSuperadminWindowDays(parsed)
}

export default async function SuperadminPage({
  searchParams,
}: SuperadminPageProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth/login")
  }

  if (!(await isSuperadmin(user.id))) {
    return <SuperadminAccessDenied />
  }

  const resolvedSearchParams = await searchParams
  const windowDays = parseWindowDays(resolvedSearchParams?.window)
  const [overview, users] = await Promise.all([
    getSuperadminOverview(windowDays),
    listSuperadminUserUsage(),
  ])

  return (
    <SuperadminDashboard
      overview={overview}
      users={users}
      windowOptions={SUPERADMIN_WINDOW_OPTIONS}
    />
  )
}
