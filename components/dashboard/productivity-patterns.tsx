import type {
  CompanionMessage,
  CompanionMessageInsight,
  TimeBlock,
  TimeBlockInsight,
} from "@/lib/types"
import { buildWorkPatternObservations } from "@/lib/dashboard-data"
import { PatternSources } from "@/components/dashboard/pattern-sources"

interface ProductivityPatternsProps {
  blocks: TimeBlock[]
  insights?: TimeBlockInsight[]
  chatInsights?: CompanionMessageInsight[]
  chatMessages?: CompanionMessage[]
  noteVersionCreatedAtById?: Map<string, string>
}

export function ProductivityPatterns({
  blocks,
  insights = [],
  chatInsights = [],
  chatMessages = [],
  noteVersionCreatedAtById,
}: ProductivityPatternsProps) {
  const patterns = buildWorkPatternObservations({
    blocks,
    noteInsights: insights,
    chatInsights,
    messages: chatMessages,
    noteVersionCreatedAtById,
  })

  return (
    <section className="alibi-card space-y-4 p-5">
      <div>
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
          work patterns
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-alibi-teal">
          patterns that currently have evidence across notes, chat, and saved blocks.
        </p>
      </div>

      {patterns.length === 0 ? (
        <p className="text-sm font-semibold text-alibi-teal">
          no patterns detected yet. keep logging and i&apos;ll start noticing.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {patterns.map((pattern) => (
            <article key={pattern.key} className="alibi-block-item">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[14px] font-black tracking-tight text-alibi-blue">
                  {pattern.title}
                </h3>
                <span className="font-mono text-sm font-black tabular-nums text-alibi-pink">
                  {pattern.count}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-alibi-ink">
                {pattern.body}
              </p>
              <PatternSources sources={pattern.sources} />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
