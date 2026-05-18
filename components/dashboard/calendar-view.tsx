"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { TimeBlock, TimeBlockCategoryRecord } from "@/lib/types"
import {
  blocksForLocalDate,
  bucketByDay,
  buildDailyTimelineItems,
  buildCalendarGrid,
  type DayBucket,
} from "@/lib/dashboard-data"
import {
  FALLBACK_CATEGORIES,
  formatDuration,
  formatTime,
  getCategoryMeta,
} from "@/lib/time-block-display"
import { cn } from "@/lib/utils"

interface CalendarViewProps {
  blocks: TimeBlock[]
  categories?: TimeBlockCategoryRecord[]
  detailSlot?: React.ReactNode
  onSelectedBlockChange?: (block: TimeBlock | null) => void
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

export function CalendarView({
  blocks,
  categories = FALLBACK_CATEGORIES,
  detailSlot,
  onSelectedBlockChange,
}: CalendarViewProps) {
  const todayKey = toDateKey(new Date())
  const buckets = useMemo(() => bucketByDay(blocks), [blocks])
  const initialSelection = useMemo(() => {
    if (buckets.has(todayKey)) return todayKey

    return Array.from(buckets.keys()).sort().at(-1) ?? todayKey
  }, [buckets, todayKey])
  const initialDate = new Date(`${initialSelection}T00:00:00`)
  const [year, setYear] = useState(initialDate.getFullYear())
  const [month, setMonth] = useState(initialDate.getMonth())
  const [selectedKey, setSelectedKey] = useState(initialSelection)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  const cells = useMemo(
    () => buildCalendarGrid(year, month, buckets),
    [year, month, buckets]
  )

  const maxCount = useMemo(() => {
    let max = 0
    cells.forEach((c) => {
      if (c.bucket && c.bucket.count > max) max = c.bucket.count
    })
    return max
  }, [cells])

  const selected: DayBucket = buckets.get(selectedKey) ?? {
    date: selectedKey,
    count: 0,
    totalMinutes: 0,
    blocks: [],
  }
  const selectedBlocks = useMemo(
    () => blocksForLocalDate(blocks, selectedKey),
    [blocks, selectedKey]
  )
  const timelineItems = useMemo(
    () => buildDailyTimelineItems(selectedBlocks),
    [selectedBlocks]
  )
  const selectedBlock =
    selectedBlockId === null
      ? null
      : selectedBlocks.find((block) => block.id === selectedBlockId) ?? null
  const hasSelectedBlockDetail = selectedBlock !== null

  useEffect(() => {
    onSelectedBlockChange?.(selectedBlock)
  }, [onSelectedBlockChange, selectedBlock])

  const goPrev = () => {
    const nextYear = month === 0 ? year - 1 : year
    const nextMonth = month === 0 ? 11 : month - 1
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
    setSelectedKey(defaultKeyForMonth(nextYear, nextMonth, buckets))
    setSelectedBlockId(null)
  }
  const goNext = () => {
    const nextYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 0 : month + 1
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
    setSelectedKey(defaultKeyForMonth(nextYear, nextMonth, buckets))
    setSelectedBlockId(null)
  }

  return (
    <section className="alibi-card p-5">
      <div
        className={cn(
          "grid gap-5",
          hasSelectedBlockDetail
            ? "lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.45fr)]"
            : "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]",
        )}
      >
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
                {MONTHS[month]} {year}
              </h2>
              <span className="rounded-full bg-alibi-lavender/20 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                calendar
              </span>
            </div>
            <div className="flex items-center gap-1">
              <NavBtn onClick={goPrev} ariaLabel="previous month">
                <ChevronLeft className="h-4 w-4" />
              </NavBtn>
              <NavBtn onClick={goNext} ariaLabel="next month">
                <ChevronRight className="h-4 w-4" />
              </NavBtn>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="pb-2 text-center text-xs font-black uppercase tracking-[0.1em] text-alibi-teal"
              >
                {d}
              </div>
            ))}
            {cells.map((cell, i) => {
              if (cell.dateKey === null) {
                return <div key={`blank-${i}`} aria-hidden="true" />
              }
              const intensity =
                cell.bucket && maxCount > 0 ? cell.bucket.count / maxCount : 0
              const isSelected = selectedKey === cell.dateKey
              const alpha = cell.bucket ? 0.14 + intensity * 0.48 : 0
              const bg = cell.bucket
                ? `rgba(191, 125, 173, ${alpha.toFixed(3)})`
                : "rgba(147, 165, 228, 0.12)"

              let borderColor = "rgba(50, 83, 199, 0.14)"
              if (isSelected) borderColor = "#3253C7"
              else if (cell.isToday) borderColor = "#43849D"

              return (
                <button
                  key={cell.dateKey}
                  onClick={() => {
                    setSelectedKey(cell.dateKey ?? selectedKey)
                    setSelectedBlockId(null)
                  }}
                  aria-label={`${cell.dateKey}: ${cell.bucket?.count ?? 0} blocks${
                    cell.isToday ? ", today" : ""
                  }`}
                  aria-pressed={isSelected}
                  className="relative aspect-square rounded-2xl text-sm font-black transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-alibi-pink/25"
                  style={{
                    background: bg,
                    border: `1px solid ${borderColor}`,
                    boxShadow: isSelected
                      ? "0 0 0 4px rgba(50, 83, 199, 0.18), inset 0 2px 5px rgba(50, 83, 199, 0.08)"
                      : "0 1px 2px rgba(50, 83, 199, 0.05), inset 0 2px 5px rgba(50, 83, 199, 0.08)",
                    color: cell.bucket ? "#162044" : "#43849D",
                  }}
                >
                  <span className="absolute left-1.5 top-1 font-medium tabular-nums">
                    {cell.day}
                  </span>
                  {cell.bucket && (
                    <span className="absolute bottom-1 right-1.5 font-mono text-xs tabular-nums opacity-70">
                      {cell.bucket.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 text-xs font-black uppercase tracking-[0.1em] text-alibi-teal">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "rgba(191, 125, 173, 0.22)" }}
                aria-hidden
              />
              quiet
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "rgba(191, 125, 173, 0.62)" }}
                aria-hidden
              />
              busy
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full border border-alibi-teal"
                style={{ background: "transparent" }}
                aria-hidden
              />
              today
            </span>
          </div>
        </div>

        <DailyTimelinePane
          dateKey={selectedKey}
          bucket={selected}
          items={timelineItems}
          selectedBlock={selectedBlock}
          selectedBlockId={selectedBlockId}
          categories={categories}
          onSelectBlock={setSelectedBlockId}
          detailSlot={hasSelectedBlockDetail ? detailSlot : null}
        />
      </div>
    </section>
  )
}

function DailyTimelinePane({
  dateKey,
  bucket,
  items,
  selectedBlock,
  selectedBlockId,
  categories,
  onSelectBlock,
  detailSlot,
}: {
  dateKey: string
  bucket: DayBucket
  items: ReturnType<typeof buildDailyTimelineItems>
  selectedBlock: TimeBlock | null
  selectedBlockId: string | null
  categories: TimeBlockCategoryRecord[]
  onSelectBlock: (id: string) => void
  detailSlot?: React.ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      // Each hour row = 3rem = 48px; scroll to 8am
      scrollRef.current.scrollTop = 8 * 48
    }
  }, [dateKey])

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            selected day
          </p>
          <h3 className="mt-1 text-xl font-black text-alibi-blue">
            {formatDateLabel(dateKey)}
          </h3>
        </div>
        <span className="font-mono text-xs font-black tracking-[0.08em] text-alibi-teal">
          {String(bucket.count).padStart(2, "0")} BLOCKS
          {bucket.totalMinutes > 0 && ` · ${formatMinutes(bucket.totalMinutes)}`}
        </span>
      </div>

      <div
        className={cn(
          "grid gap-4",
          selectedBlock
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.64fr)]"
            : "xl:grid-cols-1",
        )}
      >
        <div ref={scrollRef} className="alibi-inset max-h-[34rem] overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex min-h-72 items-center justify-center px-4 text-center text-sm font-semibold leading-6 text-alibi-teal">
              no completed blocks for this day.
            </div>
          ) : (
            <div className="grid min-h-[72rem] grid-cols-[3.25rem_minmax(0,1fr)]">
              <div className="grid grid-rows-24 pr-2">
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="border-t border-alibi-lavender/30 pt-1 text-right font-mono text-[11px] font-bold text-alibi-teal/70"
                  >
                    {String(hour).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              <div className="relative grid grid-rows-24">
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="border-t border-alibi-lavender/30"
                    aria-hidden
                  />
                ))}
                {items.map((item) => (
                  <TimelineBlockButton
                    key={item.block.id}
                    item={item}
                    categories={categories}
                    selected={
                      selectedBlockId === null
                        ? selectedBlock?.id === item.block.id
                        : selectedBlockId === item.block.id
                    }
                    onClick={() => onSelectBlock(item.block.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedBlock &&
          (detailSlot ?? (
            <BlockDetail block={selectedBlock} categories={categories} />
          ))}
      </div>
    </div>
  )
}

function TimelineBlockButton({
  item,
  categories,
  selected,
  onClick,
}: {
  item: ReturnType<typeof buildDailyTimelineItems>[number]
  categories: TimeBlockCategoryRecord[]
  selected: boolean
  onClick: () => void
}) {
  const category = getCategoryMeta(item.block.category, categories)
  const minHeight = 2.75

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${formatTime(item.block.started_at)} ${item.block.task_name || "unnamed time block"}`}
      className="absolute left-1 right-1 overflow-hidden rounded-2xl border p-2 text-left text-white shadow-[0_1px_3px_rgba(50,83,199,0.12)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-alibi-pink/25"
      style={{
        top: `${item.topPercent}%`,
        height: `max(${minHeight}rem, ${item.heightPercent}%)`,
        backgroundColor: category.color,
        borderColor: selected ? "#162044" : "rgba(255,255,255,0.62)",
        boxShadow: selected
          ? "0 0 0 3px rgba(22, 32, 68, 0.18)"
          : "0 1px 3px rgba(50,83,199,0.12)",
      }}
    >
      <span className="block truncate font-mono text-[11px] font-black uppercase tracking-[0.08em] opacity-90">
        {formatTime(item.block.started_at)}-{formatTime(item.block.ended_at)}
      </span>
      <span className="mt-0.5 block truncate text-sm font-black">
        {item.block.task_name || "unnamed time block"}
      </span>
      <span className="block truncate text-xs font-bold opacity-90">
        {category.name}
      </span>
    </button>
  )
}

function BlockDetail({
  block,
  categories,
}: {
  block: TimeBlock | null
  categories: TimeBlockCategoryRecord[]
}) {
  if (!block) {
    return (
      <div className="alibi-banner-info flex min-h-32 items-center justify-center text-center">
        select a saved block to see details.
      </div>
    )
  }

  const category = getCategoryMeta(block.category, categories)

  return (
    <article className="alibi-block-item min-w-0">
      <div className="font-mono text-sm font-semibold leading-6 text-alibi-teal">
        <div>{formatTime(block.started_at)}</div>
        <div>{formatTime(block.ended_at)}</div>
        <div className="mt-1 font-sans text-sm font-black text-alibi-blue">
          {formatDuration(block.duration_seconds, block.started_at, block.ended_at)}
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <span className="text-sm font-black uppercase tracking-[0.08em] text-alibi-teal">
            {category.name}
          </span>
        </div>
        <h3 className="mt-2 wrap-break-words text-base font-black text-alibi-ink">
          {block.task_name || "unnamed time block"}
        </h3>
        {block.notes && (
          <p className="mt-1 wrap-break-words text-sm font-medium leading-6 text-alibi-teal">
            {block.notes}
          </p>
        )}
        {block.hashtags && block.hashtags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {block.hashtags.map((hashtag) => (
              <span key={hashtag} className="alibi-chip">
                #{hashtag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function NavBtn({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-7 w-7 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-lavender/20 hover:text-alibi-blue focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-alibi-pink/20"
    >
      {children}
    </button>
  )
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function defaultKeyForMonth(
  year: number,
  month: number,
  buckets: Map<string, DayBucket>
): string {
  const todayKey = toDateKey(new Date())
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`

  if (todayKey.startsWith(monthPrefix)) {
    return todayKey
  }

  const latestWithBlocks = Array.from(buckets.keys())
    .filter((key) => key.startsWith(monthPrefix))
    .sort()
    .at(-1)

  return latestWithBlocks ?? `${monthPrefix}01`
}

function formatDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dateKey}T00:00:00`))
}
