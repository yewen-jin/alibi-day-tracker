import type { DashboardViewRecord, DashboardViewRunRecord } from "@/lib/types"
import type { DashboardViewResult, DashboardViewSpec } from "@/lib/dashboard-view-spec"
import {
  archiveDashboardViewAction,
  publishDashboardViewAction,
  renameDashboardViewAction,
  refreshDashboardViewAction,
  updateDashboardViewAction,
} from "@/app/actions/dashboard-views"
import { CustomViewEditForm } from "@/components/dashboard/custom-view-edit-form"

function formatDate(value: string | null | undefined) {
  if (!value) return "no data window yet"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function SectionShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="alibi-card space-y-4 p-5">
      <div>
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-sm font-semibold text-alibi-teal">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function CustomDashboardRenderer({
  view,
  spec,
  result,
  run,
}: {
  view: DashboardViewRecord
  spec: DashboardViewSpec
  result: DashboardViewResult | null
  run: DashboardViewRunRecord | null
}) {
  const resultBySection = new Map(result?.sections.map((section) => [section.id, section]))

  return (
    <div className="space-y-5">
      <section className="alibi-card-pop space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-xl font-black tracking-tight text-alibi-blue">
                {view.title}
              </h2>
              <span className="shrink-0 rounded-full bg-alibi-lavender/20 px-2.5 py-1 text-xs font-black uppercase tracking-[0.1em] text-alibi-blue">
                {view.status}
              </span>
            </div>
            {view.description ? (
              <p className="mt-1 max-w-3xl break-words text-sm font-semibold leading-6 text-alibi-teal">
                {view.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
              {formatDate(result?.input_window_start)} to {formatDate(result?.input_window_end)}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:w-auto lg:justify-end">
            <CustomViewEditForm
              title={view.title}
              description={view.description}
              renameAction={renameDashboardViewAction.bind(null, view.id)}
              updateAction={updateDashboardViewAction.bind(null, view.id)}
            />
            {view.status === "draft" ? (
              <form action={publishDashboardViewAction.bind(null, view.id)}>
                <button
                  type="submit"
                  className="alibi-button-primary inline-flex h-10 w-full items-center justify-center px-4 text-sm font-black sm:w-auto"
                >
                  publish
                </button>
              </form>
            ) : null}
            <form action={refreshDashboardViewAction.bind(null, view.id)}>
              <button
                type="submit"
                className="alibi-button-secondary inline-flex h-10 w-full items-center justify-center px-4 text-sm font-black sm:w-auto"
              >
                refresh
              </button>
            </form>
            <form action={archiveDashboardViewAction.bind(null, view.id)}>
              <button
                type="submit"
                className="alibi-button-secondary inline-flex h-10 w-full items-center justify-center px-4 text-sm font-black sm:w-auto"
              >
                archive
              </button>
            </form>
          </div>
        </div>
        {run?.status === "error" ? (
          <p className="alibi-banner-error">{run.error ?? "the last refresh failed."}</p>
        ) : null}
        {!result ? (
          <p className="alibi-banner-info">
            this view is ready, but it has not produced a snapshot yet.
          </p>
        ) : null}
      </section>

      {spec.sections.map((section) => {
        const sectionResult = resultBySection.get(section.id)
        if (!sectionResult) {
          return (
            <SectionShell
              key={section.id}
              title={section.title}
              description={section.description}
            >
              <p className="alibi-banner-info">no snapshot data for this section yet.</p>
            </SectionShell>
          )
        }

        if (sectionResult.type === "metric_cards") {
          return (
            <SectionShell
              key={section.id}
              title={section.title}
              description={section.description}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {sectionResult.metrics.map((metric) => (
                  <article key={metric.label} className="alibi-block-item min-w-0">
                    <p className="break-words text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                      {metric.label}
                    </p>
                    <p className="mt-2 break-words text-xl font-black text-alibi-blue sm:text-2xl">
                      {metric.value}
                    </p>
                    {metric.detail ? (
                      <p className="mt-1 break-words text-sm font-semibold text-alibi-teal">
                        {metric.detail}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </SectionShell>
          )
        }

        if (sectionResult.type === "simple_chart") {
          const max = Math.max(...sectionResult.points.map((point) => point.value), 1)
          return (
            <SectionShell
              key={section.id}
              title={section.title}
              description={section.description}
            >
              <div className="space-y-3">
                {sectionResult.points.slice(0, 12).map((point) => (
                  <div
                    key={point.label}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 sm:grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)_3rem] sm:items-center"
                  >
                    <span className="min-w-0 break-words text-sm font-black text-alibi-blue sm:truncate">
                      {point.label}
                    </span>
                    <span className="text-right font-mono text-sm font-black text-alibi-pink sm:order-last">
                      {point.value}
                    </span>
                    <span className="col-span-full h-3 rounded-full bg-alibi-lavender/20 sm:col-span-1 sm:col-start-2">
                      <span
                        className="block h-3 rounded-full bg-alibi-teal"
                        style={{ width: `${Math.max((point.value / max) * 100, 4)}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </SectionShell>
          )
        }

        if (sectionResult.type === "source_panel") {
          return (
            <SectionShell
              key={section.id}
              title={section.title}
              description={section.description}
            >
              <div className="space-y-3">
                {sectionResult.panels.map((panel) => (
                  <article key={panel.title} className="alibi-inset min-w-0 space-y-3 p-4">
                    <h3 className="break-words text-sm font-black text-alibi-blue">{panel.title}</h3>
                    {panel.sources.map((source) => (
                      <p
                        key={source.id}
                        className="break-words border-t border-alibi-lavender/20 pt-3 text-sm font-semibold leading-6 text-alibi-teal first:border-t-0 first:pt-0"
                      >
                        <span className="font-black text-alibi-blue">{source.label}: </span>
                        {source.excerpt}
                      </p>
                    ))}
                  </article>
                ))}
              </div>
            </SectionShell>
          )
        }

        const items =
          sectionResult.type === "pattern_cards"
            ? sectionResult.patterns
            : sectionResult.observations

        return (
          <SectionShell
            key={section.id}
            title={section.title}
            description={section.description}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <article key={item.title} className="alibi-block-item min-w-0">
                  <h3 className="break-words text-[14px] font-black tracking-tight text-alibi-blue">
                    {item.title}
                  </h3>
                  <p className="mt-2 break-words text-sm font-semibold leading-6 text-alibi-ink">
                    {item.body}
                  </p>
                  {item.evidence.length > 0 ? (
                    <div className="mt-3 space-y-2 border-t border-alibi-lavender/25 pt-3">
                      {item.evidence.slice(0, 2).map((source) => (
                        <p
                          key={source.id}
                          className="break-words text-xs font-semibold leading-5 text-alibi-teal"
                        >
                          <span className="font-black text-alibi-blue">
                            {source.label}:{" "}
                          </span>
                          {source.excerpt}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </SectionShell>
        )
      })}
    </div>
  )
}
