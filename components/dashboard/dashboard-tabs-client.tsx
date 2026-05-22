"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { DashboardViewRecord } from "@/lib/types"
import { CustomViewWorkbench } from "@/components/dashboard/custom-view-workbench"

interface DashboardTab {
  slug: string
  label: string
  description: string
}

export function DashboardTabsClient({
  tabs,
  draftViews,
  customViewsSchemaReady,
  customViewNotice,
  activeSlug,
}: {
  tabs: DashboardTab[]
  draftViews: DashboardViewRecord[]
  customViewsSchemaReady: boolean
  customViewNotice?: string
  activeSlug: string
}) {
  const [createOpen, setCreateOpen] = useState(
    customViewNotice === "schema-missing",
  )

  return (
    <div>
      <nav
        aria-label="dashboard views"
        className="alibi-pill flex flex-wrap items-center gap-1 px-2 py-1.5"
      >
        <span className="px-2 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
          view
        </span>
        <ul className="flex flex-wrap items-center gap-1">
          {tabs.map((tab) => {
            const isActive = tab.slug === activeSlug
            return (
              <li key={tab.slug}>
                <Link
                  href={`/app/dashboard?view=${tab.slug}`}
                  aria-current={isActive ? "page" : undefined}
                  title={tab.description}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold transition",
                    isActive
                      ? "bg-alibi-blue text-white shadow-[0_8px_16px_rgba(50,83,199,0.25)]"
                      : "text-alibi-teal hover:-translate-y-0.5 hover:bg-alibi-teal hover:text-white",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          aria-expanded={createOpen}
          onClick={() => setCreateOpen((value) => !value)}
          className="inline-flex items-center rounded-full bg-alibi-pink px-3 py-1.5 text-sm font-bold text-white shadow-[0_8px_16px_rgba(191,125,173,0.24)] transition hover:-translate-y-0.5 hover:bg-alibi-teal"
        >
          create your own dashboard
        </button>
      </nav>
      {createOpen ? (
        <div className="mt-4">
          <CustomViewWorkbench
            draftViews={draftViews}
            schemaReady={customViewsSchemaReady}
          />
        </div>
      ) : null}
    </div>
  )
}
