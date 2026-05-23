import Link from "next/link"
import type { DashboardViewRecord } from "@/lib/types"
import { createDashboardViewDraftAction } from "@/app/actions/dashboard-views"
import { CustomViewCreateForm } from "@/components/dashboard/custom-view-create-form"

export function CustomViewWorkbench({
  draftViews,
  schemaReady = true,
}: {
  draftViews: DashboardViewRecord[]
  schemaReady?: boolean
}) {
  return (
    <section className="alibi-card space-y-4 p-5">
      <div>
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
          create a dashboard view
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-alibi-teal">
          describe what you want to inspect. alibi drafts a fixed-format view from
          your saved dashboard data.
        </p>
      </div>
      <CustomViewCreateForm
        action={createDashboardViewDraftAction}
        schemaReady={schemaReady}
      />
      {!schemaReady ? (
        <p className="alibi-banner-error">
          custom dashboard storage is not set up yet. apply
          db/migrations/008_dashboard_views.sql before creating a view.
        </p>
      ) : null}
      {draftViews.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-alibi-lavender/20 pt-4">
          <span className="shrink-0 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            drafts
          </span>
          {draftViews.map((view) => (
            <Link
              key={view.id}
              href={`/app/dashboard?view=${view.slug}`}
              className="alibi-button-secondary inline-flex h-9 max-w-[14rem] items-center justify-center px-3 text-xs font-black"
            >
              <span className="truncate">{view.title}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}
