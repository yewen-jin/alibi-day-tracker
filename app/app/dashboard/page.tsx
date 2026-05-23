import { redirect } from "next/navigation"
import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import { TopNav } from "@/components/top-nav"
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs"
import { CustomDashboardRenderer } from "@/components/dashboard/custom-dashboard-renderer"
import { loadDashboardSkillInput } from "@/lib/dashboard-context"
import {
  getDashboardViewBySlug,
  getLatestDashboardViewRun,
  hasDashboardViewsSchema,
  listActiveDashboardViews,
} from "@/lib/repositories/dashboard-views"
import { dashboardSkills, getDashboardSkill } from "@/lib/skills/registry"
import { validateDashboardViewResult, validateDashboardViewSpec } from "@/lib/dashboard-view-spec"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; custom_view?: string }>
}) {
  const { view, custom_view: customViewNotice } = await searchParams

  const user = await getCurrentUser()

  if (!user) redirect("/")

  await syncAppUser(user)

  const [dashboardInput, customViews, customViewsSchemaReady] = await Promise.all([
    loadDashboardSkillInput(user.id),
    listActiveDashboardViews(user.id),
    hasDashboardViewsSchema(),
  ])
  const customView =
    view && !dashboardSkills.some((skill) => skill.slug === view || skill.aliases?.includes(view))
      ? await getDashboardViewBySlug(user.id, view)
      : null
  const activeSkill = customView ? null : getDashboardSkill(view)
  const latestCustomRun = customView
    ? await getLatestDashboardViewRun(user.id, customView.id)
    : null
  const draftViews = customViews.filter((item) => item.status === "draft")
  const activeTagline = customView
    ? customView.status === "draft"
      ? "draft custom view"
      : "custom view"
    : activeSkill?.tagline

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 p-8">
        <TopNav activeHref="/app/dashboard" />

        <header className="px-2 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[1.8rem] font-black tracking-tight text-alibi-blue">
              the dashboard
            </h1>
            <span className="rounded-full bg-alibi-pink/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
              {activeTagline}
            </span>
          </div>
          <p className="mt-1 text-base font-semibold leading-relaxed text-alibi-teal">
            a quiet look back. nothing graded, just shown.
          </p>
        </header>

        <DashboardTabs
          skills={dashboardSkills}
          customViews={customViews.filter((item) => item.status === "published")}
          draftViews={draftViews}
          customViewsSchemaReady={customViewsSchemaReady}
          customViewNotice={customViewNotice}
          activeSlug={customView?.slug ?? activeSkill?.slug ?? dashboardSkills[0].slug}
        />

        {customView ? (
          <CustomDashboardRenderer
            view={customView}
            spec={validateDashboardViewSpec(customView.spec)}
            result={
              latestCustomRun?.result
                ? validateDashboardViewResult(latestCustomRun.result)
                : null
            }
            run={latestCustomRun}
          />
        ) : (
          activeSkill?.render(dashboardInput)
        )}

        <footer className="text-center text-sm font-semibold tracking-[0.04em] text-alibi-teal">
          alibi — for the days you can&apos;t see clearly
        </footer>
      </div>
    </main>
  )
}
