"use client"

import { useMemo } from "react"
import type { TimeBlock } from "@/lib/types"
import { aggregateByHour, aggregateByWeekday } from "@/lib/dashboard-data"

interface RhythmChartProps {
  blocks: TimeBlock[]
}

export function RhythmChart({ blocks }: RhythmChartProps) {
  const weekday = useMemo(() => aggregateByWeekday(blocks), [blocks])
  const hour = useMemo(() => aggregateByHour(blocks), [blocks])

  const maxWeekday = Math.max(...weekday.map((w) => w.count), 1)
  const maxHour = Math.max(...hour.map((h) => h.count), 1)

  return (
    <section className="alibi-card p-5">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
          your rhythm
        </h2>
        <span className="rounded-full bg-alibi-pink/15 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
          when you track
        </span>
      </div>

      <div className="space-y-5">
        {/* Day of week */}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            by day of week
          </p>
          <div className="flex h-24 items-end gap-2" role="presentation">
            {weekday.map((w) => {
              const height = (w.count / maxWeekday) * 100
              return (
                <div
                  key={w.weekday}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div className="relative flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${Math.max(height, w.count > 0 ? 4 : 0)}%`,
                        background:
                          w.count > 0
                            ? "linear-gradient(180deg, #BF7DAD, #3253C7)"
                            : "transparent",
                      }}
                      title={`${w.label}: ${w.count} entries`}
                    />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-alibi-teal">
                    {w.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Hour of day */}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            by hour
          </p>
          <div className="flex h-16 items-end gap-[2px]" role="presentation">
            {hour.map((h) => {
              const height = (h.count / maxHour) * 100
              const showLabel = h.hour % 6 === 0
              return (
                <div
                  key={h.hour}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="relative flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${Math.max(height, h.count > 0 ? 6 : 0)}%`,
                        background:
                          h.count > 0
                            ? "linear-gradient(180deg, #43849D, #93A5E4)"
                            : "transparent",
                      }}
                      title={`${formatHour(h.hour)}: ${h.count} entries`}
                    />
                  </div>
                  {showLabel && (
                    <span className="font-mono text-xs font-bold tabular-nums text-alibi-teal">
                      {formatHour(h.hour)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function formatHour(h: number): string {
  if (h === 0) return "12a"
  if (h === 12) return "12p"
  return h < 12 ? `${h}a` : `${h - 12}p`
}
