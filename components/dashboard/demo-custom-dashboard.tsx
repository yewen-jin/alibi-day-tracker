"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowRight, Loader2, Sparkles } from "lucide-react"
import {
  buildDashboardViewResult,
  slugifyDashboardViewTitle,
  validateDashboardViewSpec,
  type DashboardViewResult,
  type DashboardViewSpec,
} from "@/lib/dashboard-view-spec"
import type { DashboardSkillInput } from "@/lib/skills/types"
import type { DashboardViewRecord } from "@/lib/types"

interface DemoCustomDashboard {
  view: DashboardViewRecord
  result: Record<string, unknown> | null
}

function demoSpecFromPrompt(prompt: string): DashboardViewSpec {
  const lower = prompt.toLowerCase()
  const chartMetric = lower.includes("time") || lower.includes("hour") || lower.includes("when")
    ? "hourly"
    : "time_by_category"
  const chartTitle = chartMetric === "hourly" ? "time-of-day rhythm" : "category shape"

  return validateDashboardViewSpec({
    version: 1,
    title: prompt.replace(/\s+/g, " ").trim().slice(0, 72),
    description: "a one-off demo dashboard drafted from local demo blocks, notes, and chat signals.",
    sections: [
      {
        id: "snapshot",
        type: "metric_cards",
        title: "snapshot",
        description: "the current shape of the demo record.",
        metric: "summary",
        source: "summary",
      },
      {
        id: "comparison",
        type: "simple_chart",
        title: chartTitle,
        description: "a bounded numeric comparison from saved blocks.",
        metric: chartMetric,
        source: "summary",
      },
      {
        id: "patterns",
        type: "pattern_cards",
        title: "patterns with evidence",
        description: "signals pulled from notes and companion chat.",
        source: "patterns",
      },
      {
        id: "sources",
        type: "source_panel",
        title: "source material",
        description: "the excerpts behind the custom view.",
        source: "evidence",
      },
    ],
  })
}

function demoViewRecord(prompt: string, spec: DashboardViewSpec): DashboardViewRecord {
  const now = new Date().toISOString()
  return {
    id: `demo-dashboard-${Date.now()}`,
    user_id: "demo",
    slug: `${slugifyDashboardViewTitle(spec.title)}-${Date.now().toString(36)}`,
    title: spec.title,
    description: spec.description,
    status: "draft",
    source_prompt: prompt,
    spec,
    created_at: now,
    updated_at: now,
    published_at: null,
  }
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
        <h3 className="text-[17px] font-black tracking-tight text-alibi-blue">{title}</h3>
        {description ? <p className="mt-0.5 text-sm font-semibold text-alibi-teal">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function DemoDashboardSnapshot({
  view,
  result,
}: {
  view: DashboardViewRecord
  result: DashboardViewResult
}) {
  const spec = validateDashboardViewSpec(view.spec)
  const resultBySection = new Map(result.sections.map((section) => [section.id, section]))

  return (
    <div className="space-y-5">
      <section className="alibi-card-pop space-y-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 break-words text-xl font-black tracking-tight text-alibi-blue">
            {view.title}
          </h2>
          <span className="rounded-full bg-alibi-lavender/20 px-2.5 py-1 text-xs font-black uppercase tracking-[0.1em] text-alibi-blue">
            demo draft
          </span>
        </div>
        <p className="max-w-3xl text-sm font-semibold leading-6 text-alibi-teal">
          {view.description}
        </p>
      </section>

      {spec.sections.map((section) => {
        const sectionResult = resultBySection.get(section.id)
        if (!sectionResult) return null

        if (sectionResult.type === "metric_cards") {
          return (
            <SectionShell key={section.id} title={section.title} description={section.description}>
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
                      <p className="mt-1 break-words text-sm font-semibold text-alibi-teal">{metric.detail}</p>
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
            <SectionShell key={section.id} title={section.title} description={section.description}>
              <div className="space-y-3">
                {sectionResult.points.filter((point) => point.value > 0).slice(0, 12).map((point) => (
                  <div key={point.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 sm:grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)_3rem] sm:items-center">
                    <span className="min-w-0 break-words text-sm font-black text-alibi-blue sm:truncate">{point.label}</span>
                    <span className="text-right font-mono text-sm font-black text-alibi-pink sm:order-last">{point.value}</span>
                    <span className="col-span-full h-3 rounded-full bg-alibi-lavender/20 sm:col-span-1 sm:col-start-2">
                      <span className="block h-3 rounded-full bg-alibi-teal" style={{ width: `${Math.max((point.value / max) * 100, 4)}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </SectionShell>
          )
        }

        if (sectionResult.type === "pattern_cards") {
          return (
            <SectionShell key={section.id} title={section.title} description={section.description}>
              <div className="grid gap-3 md:grid-cols-2">
                {sectionResult.patterns.map((pattern) => (
                  <article key={pattern.title} className="alibi-block-item min-w-0">
                    <h4 className="break-words text-sm font-black text-alibi-blue">{pattern.title}</h4>
                    <p className="mt-2 break-words text-sm font-semibold leading-6 text-alibi-teal">{pattern.body}</p>
                  </article>
                ))}
              </div>
            </SectionShell>
          )
        }

        if (sectionResult.type === "source_panel") {
          return (
            <SectionShell key={section.id} title={section.title} description={section.description}>
              <div className="space-y-3">
                {sectionResult.panels.map((panel) => (
                  <article key={panel.title} className="alibi-inset min-w-0 space-y-3 p-4">
                    <h4 className="break-words text-sm font-black text-alibi-blue">{panel.title}</h4>
                    {panel.sources.map((source) => (
                      <p key={source.id} className="break-words border-t border-alibi-lavender/20 pt-3 text-sm font-semibold leading-6 text-alibi-teal first:border-t-0 first:pt-0">
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

        if (sectionResult.type === "observation_list") {
          return (
            <SectionShell key={section.id} title={section.title} description={section.description}>
              <div className="space-y-3">
                {sectionResult.observations.map((observation) => (
                  <article key={observation.title} className="alibi-block-item min-w-0">
                    <h4 className="break-words text-sm font-black text-alibi-blue">{observation.title}</h4>
                    <p className="mt-2 break-words text-sm font-semibold leading-6 text-alibi-teal">{observation.body}</p>
                  </article>
                ))}
              </div>
            </SectionShell>
          )
        }

        return null
      })}
    </div>
  )
}

export function DemoCustomDashboard({
  input,
  dashboard,
  onCreate,
}: {
  input: DashboardSkillInput
  dashboard: DemoCustomDashboard | null
  onCreate: (dashboard: DemoCustomDashboard) => void
}) {
  const [prompt, setPrompt] = useState("")
  const [pending, setPending] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if (trimmed.length < 8 || pending || dashboard) return

    setPending(true)
    window.setTimeout(() => {
      const spec = demoSpecFromPrompt(trimmed)
      const result = buildDashboardViewResult(spec, input)
      onCreate({
        view: demoViewRecord(trimmed, spec),
        result,
      })
      setPrompt("")
      setPending(false)
    }, 450)
  }

  return (
    <section className="space-y-5">
      <section className="alibi-card space-y-4 p-5">
        <div>
          <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
            create a custom dashboard
          </h2>
          <p className="mt-0.5 text-sm font-semibold leading-6 text-alibi-teal">
            demo mode lets you draft one custom dashboard from local demo data. create an account
            to save multiple views, refresh them, and connect retrieval.
          </p>
        </div>
        {dashboard ? (
          <div className="alibi-banner-info flex flex-wrap items-center justify-between gap-3">
            <span>you have used the one custom dashboard available in demo mode.</span>
            <Link href="/auth/sign-up?from=demo" className="alibi-button-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black">
              create account for more
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              minLength={8}
              maxLength={800}
              rows={2}
              className="alibi-input py-3 text-sm font-semibold leading-6"
              placeholder="ask for one focused dashboard: what pattern to inspect, which work types to compare, and whether you want evidence from notes or chat"
            />
            <button
              type="submit"
              disabled={prompt.trim().length < 8 || pending}
              className="alibi-button-primary inline-flex h-10 w-fit items-center justify-center gap-2 px-4 text-sm font-black"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pending ? "drafting" : "draft view"}
            </button>
          </form>
        )}
      </section>

      {dashboard?.result ? (
        <DemoDashboardSnapshot
          view={dashboard.view}
          result={dashboard.result as DashboardViewResult}
        />
      ) : null}
    </section>
  )
}
