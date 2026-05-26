"use client"

import { useMemo } from "react"
import type { TimeBlock, TimeBlockCategoryRecord } from "@/lib/types"
import { aggregateByCategory } from "@/lib/dashboard-data"
import { FALLBACK_CATEGORIES, getCategoryMeta } from "@/lib/time-block-display"

interface ProjectDistributionProps {
  blocks: TimeBlock[]
  categories?: TimeBlockCategoryRecord[]
}

export function ProjectDistribution({
  blocks,
  categories = FALLBACK_CATEGORIES,
}: ProjectDistributionProps) {
  const categoryStats = useMemo(() => aggregateByCategory(blocks), [blocks])
  const total = categoryStats.reduce((sum, category) => sum + category.totalMinutes, 0)

  if (categoryStats.length === 0) {
    return (
      <section className="alibi-card p-5">
        <h2 className="mb-2 text-[17px] font-black tracking-tight text-alibi-blue">
          where you spent time
        </h2>
        <p className="text-base font-semibold text-alibi-teal">
          nothing tracked yet.
        </p>
      </section>
    )
  }

  return (
    <section className="alibi-card p-5">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
          where you spent time
        </h2>
        <span className="rounded-full bg-alibi-lavender/20 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
          by category
        </span>
      </div>

      {/* Stacked horizontal bar */}
      <div
        className="mb-4 flex h-3 w-full overflow-hidden"
        style={{
          borderRadius: 999,
          background: "rgba(147, 165, 228, 0.22)",
        }}
        role="img"
        aria-label="project distribution bar"
      >
        {categoryStats.map((category) => {
          const pct = total > 0 ? (category.totalMinutes / total) * 100 : 0
          const meta = getCategoryMeta(category.categorySlug, categories)
          if (pct < 1) return null
          return (
            <div
              key={category.categorySlug ?? category.category}
              style={{
                width: `${pct}%`,
                background: meta.color,
              }}
              title={`${category.category}: ${formatMinutes(category.totalMinutes)}`}
            />
          )
        })}
      </div>

      {/* Legend / list */}
      <ul className="space-y-2">
        {categoryStats.slice(0, 8).map((category) => {
          const pct = total > 0 ? (category.totalMinutes / total) * 100 : 0
          const meta = getCategoryMeta(category.categorySlug, categories)
          return (
            <li
              key={category.categorySlug ?? category.category}
              className="flex items-center gap-3 text-base"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: meta.color,
                }}
                aria-hidden="true"
              />
              <span className="flex-1 font-semibold capitalize text-alibi-ink">
                {category.category}
              </span>
              <span className="font-mono font-bold tabular-nums text-alibi-blue">
                {formatMinutes(category.totalMinutes)}
              </span>
              <span className="w-10 text-right font-mono font-bold tabular-nums text-alibi-teal">
                {pct.toFixed(0)}%
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function formatMinutes(min: number): string {
  if (min <= 0) return "0m"
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
