"use client"

import { useState } from "react"
import type { MirrorSource } from "@/lib/dashboard-data"

function formatWrittenAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown time"

  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function HighlightedExcerpt({
  exactText,
  excerpt,
}: {
  exactText: string
  excerpt: string
}) {
  const index = exactText ? excerpt.toLowerCase().indexOf(exactText.toLowerCase()) : -1

  if (index < 0) {
    return <>{excerpt}</>
  }

  const before = excerpt.slice(0, index)
  const match = excerpt.slice(index, index + exactText.length)
  const after = excerpt.slice(index + exactText.length)

  return (
    <>
      {before}
      <span className="font-black text-alibi-blue">{match}</span>
      {after}
    </>
  )
}

export function PatternSources({ sources }: { sources: MirrorSource[] }) {
  const [open, setOpen] = useState(false)

  if (sources.length === 0) return null

  return (
    <div className="mt-3 border-t border-alibi-lavender/25 pt-3">
      <button
        type="button"
        className="alibi-button-secondary inline-flex h-8 items-center justify-center px-3 text-xs font-black lowercase"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        sources
      </button>

      {open ? (
        <div className="alibi-inset mt-3 space-y-3 p-3">
          {sources.map((source, index) => (
            <div
              key={`${source.type}-${source.written_at}-${index}`}
              className="space-y-2 border-b border-alibi-lavender/25 pb-3 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.1em] text-alibi-teal">
                <span>{source.type}</span>
                <span aria-hidden="true">&middot;</span>
                <time dateTime={source.written_at}>{formatWrittenAt(source.written_at)}</time>
              </div>
              <p className="text-xs font-black leading-5 text-alibi-blue">
                {source.context_label}
              </p>
              <p className="wrap-break-words text-xs font-semibold leading-5 text-alibi-teal">
                <HighlightedExcerpt
                  exactText={source.exact_text}
                  excerpt={source.context_excerpt}
                />
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
