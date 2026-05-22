import type { DashboardViewRecord, DashboardViewRunRecord } from "@/lib/types"
import type { DashboardViewResult, DashboardViewSpec } from "@/lib/dashboard-view-spec"
import {
  archiveDashboardViewAction,
  publishDashboardViewAction,
  refreshDashboardViewAction,
} from "@/app/actions/dashboard-views"

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
      <section className="alibi-card-pop space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black tracking-tight text-alibi-blue">
                {view.title}
              </h2>
              <span className="rounded-full bg-alibi-lavender/20 px-2.5 py-1 text-xs font-black uppercase tracking-[0.1em] text-alibi-blue">
                {view.status}
              </span>
            </div>
            {view.description ? (
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-alibi-teal">
                {view.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
              {formatDate(result?.input_window_start)} to {formatDate(result?.input_window_end)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {view.status === "draft" ? (
              <form action={publishDashboardViewAction.bind(null, view.id)}>
                <button
                  type="submit"
                  className="alibi-button-primary inline-flex h-10 items-center justify-center px-4 text-sm font-black"
                >
                  publish
                </button>
              </form>
            ) : null}
            <form action={refreshDashboardViewAction.bind(null, view.id)}>
              <button
                type="submit"
                className="alibi-button-secondary inline-flex h-10 items-center justify-center px-4 text-sm font-black"
              >
                refresh
              </button>
            </form>
            <form action={archiveDashboardViewAction.bind(null, view.id)}>
              <button
                type="submit"
                className="alibi-button-secondary inline-flex h-10 items-center justify-center px-4 text-sm font-black"
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
                  <article key={metric.label} className="alibi-block-item">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-2xl font-black text-alibi-blue">
                      {metric.value}
                    </p>
                    {metric.detail ? (
                      <p className="mt-1 text-sm font-semibold text-alibi-teal">
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
                  <div key={point.label} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3">
                    <span className="truncate text-sm font-black text-alibi-blue">
                      {point.label}
                    </span>
                    <span className="h-3 rounded-full bg-alibi-lavender/20">
                      <span
                        className="block h-3 rounded-full bg-alibi-teal"
                        style={{ width: `${Math.max((point.value / max) * 100, 4)}%` }}
                      />
                    </span>
                    <span className="text-right font-mono text-sm font-black text-alibi-pink">
                      {point.value}
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
                  <article key={panel.title} className="alibi-inset space-y-3 p-4">
                    <h3 className="text-sm font-black text-alibi-blue">{panel.title}</h3>
                    {panel.sources.map((source) => (
                      <p
                        key={source.id}
                        className="border-t border-alibi-lavender/20 pt-3 text-sm font-semibold leading-6 text-alibi-teal first:border-t-0 first:pt-0"
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
                <article key={item.title} className="alibi-block-item">
                  <h3 className="text-[14px] font-black tracking-tight text-alibi-blue">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-alibi-ink">
                    {item.body}
                  </p>
                  {item.evidence.length > 0 ? (
                    <div className="mt-3 space-y-2 border-t border-alibi-lavender/25 pt-3">
                      {item.evidence.slice(0, 2).map((source) => (
                        <p
                          key={source.id}
                          className="text-xs font-semibold leading-5 text-alibi-teal"
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
