import type { TimeBlock, TimeBlockInsight } from "@/lib/types"
import {
  aggregateMarkers,
  aggregateEffort,
  aggregateSatisfaction,
} from "@/lib/dashboard-data"

interface AdhdMarkersProps {
  blocks: TimeBlock[]
  insights?: TimeBlockInsight[]
}

const MARKER_COLORS: Record<string, string> = {
  avoidance: "#43849D",
  hyperfocus: "#3253C7",
  guilt: "#BF7DAD",
  novelty: "#93A5E4",
}

const EFFORT_COLORS: Record<string, string> = {
  easy: "#93A5E4",
  medium: "#43849D",
  hard: "#3253C7",
  grind: "#BF7DAD",
}

const SATISFACTION_COLORS: Record<string, string> = {
  satisfied: "#43849D",
  mixed: "#93A5E4",
  frustrated: "#BF7DAD",
  unclear: "#3253C7",
}

export function AdhdMarkers({ blocks, insights = [] }: AdhdMarkersProps) {
  const markers = aggregateMarkers(blocks)
  const blockIdsByMarker = {
    avoidance: new Set(blocks.filter((block) => block.avoidance_marker).map((block) => block.id)),
    hyperfocus: new Set(blocks.filter((block) => block.hyperfocus_marker).map((block) => block.id)),
    guilt: new Set(blocks.filter((block) => block.guilt_marker).map((block) => block.id)),
    novelty: new Set(blocks.filter((block) => block.novelty_marker).map((block) => block.id)),
  }

  for (const insight of insights) {
    if (insight.avoidance_signals.length > 0) {
      blockIdsByMarker.avoidance.add(insight.time_block_id)
    }
    if (insight.hyperfocus_signals.length > 0) {
      blockIdsByMarker.hyperfocus.add(insight.time_block_id)
    }
    if (insight.emotional_tone === "self-critical" || insight.uncertainty_signals.length > 0) {
      blockIdsByMarker.guilt.add(insight.time_block_id)
    }
  }

  const totalBlocks = blocks.length
  const mergedMarkers = markers.map((marker) => {
    const count = blockIdsByMarker[marker.key].size
    return {
      ...marker,
      count,
      pct: totalBlocks > 0 ? Math.round((count / totalBlocks) * 100) : 0,
    }
  })
  const effort = aggregateEffort(blocks)
  const satisfaction = aggregateSatisfaction(blocks)

  const hasAnyMarkers = mergedMarkers.some((m) => m.count > 0)
  const hasEffortData = effort.some((e) => e.count > 0)
  const hasSatisfactionData = satisfaction.some((s) => s.count > 0)

  return (
    <section className="alibi-card space-y-4 p-5">
      <div>
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
          work patterns
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-alibi-teal">
          what your blocks say about how you work
        </p>
      </div>

      {/* Markers Grid */}
      <div className="grid grid-cols-2 gap-3">
        {mergedMarkers.map((m) => (
          <div key={m.key} className="alibi-doc-card p-3">
            <div className="flex items-baseline justify-between">
              <span
                className="font-mono text-[1.4rem] font-semibold leading-none tabular-nums"
                style={{ color: MARKER_COLORS[m.key] }}
              >
                {m.count}
              </span>
              {m.pct > 0 && (
                <span className="text-xs font-bold text-alibi-teal">{m.pct}%</span>
              )}
            </div>
            <p className="mt-1 text-sm font-bold text-alibi-blue">
              {m.label}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-alibi-teal">{m.description}</p>
          </div>
        ))}
      </div>

      {/* Effort Distribution */}
      {hasEffortData && (
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-alibi-teal">
            effort level
          </p>
          <div className="flex h-3 overflow-hidden rounded-full bg-alibi-lavender/20">
            {effort
              .filter((e) => e.count > 0)
              .map((e) => (
                <div
                  key={e.level}
                  className="transition-all"
                  style={{
                    width: `${e.pct}%`,
                    backgroundColor: EFFORT_COLORS[e.level],
                  }}
                  title={`${e.level}: ${e.count} (${e.pct}%)`}
                />
              ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {effort
              .filter((e) => e.count > 0)
              .map((e) => (
                <span key={e.level} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: EFFORT_COLORS[e.level] }}
                  />
                  <span className="text-xs font-semibold text-alibi-teal">
                    {e.level} ({e.count})
                  </span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Satisfaction Distribution */}
      {hasSatisfactionData && (
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-alibi-teal">
            satisfaction
          </p>
          <div className="flex h-3 overflow-hidden rounded-full bg-alibi-lavender/20">
            {satisfaction
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.level}
                  className="transition-all"
                  style={{
                    width: `${s.pct}%`,
                    backgroundColor: SATISFACTION_COLORS[s.level],
                  }}
                  title={`${s.level}: ${s.count} (${s.pct}%)`}
                />
              ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {satisfaction
              .filter((s) => s.count > 0)
              .map((s) => (
                <span key={s.level} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SATISFACTION_COLORS[s.level] }}
                  />
                  <span className="text-xs font-semibold text-alibi-teal">
                    {s.level} ({s.count})
                  </span>
                </span>
              ))}
          </div>
        </div>
      )}

      {!hasAnyMarkers && !hasEffortData && !hasSatisfactionData && (
        <p className="text-sm font-semibold text-alibi-teal">
          no patterns detected yet. keep logging and i&apos;ll start noticing.
        </p>
      )}
    </section>
  )
}
