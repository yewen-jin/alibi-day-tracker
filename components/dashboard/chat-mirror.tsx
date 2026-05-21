import { buildChatMirrorObservations } from "@/lib/dashboard-data"
import type { CompanionMessage, CompanionMessageInsight, TimeBlock } from "@/lib/types"
import { PatternSources } from "@/components/dashboard/pattern-sources"

export function ChatMirror({
  blocks,
  insights,
  messages = [],
}: {
  blocks: TimeBlock[]
  insights: CompanionMessageInsight[]
  messages?: CompanionMessage[]
}) {
  const observations = buildChatMirrorObservations(insights, blocks, messages)

  return (
    <section className="alibi-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">chat mirror</h2>
        <span className="alibi-label">message-grounded</span>
      </div>
      <p className="mt-1 text-sm font-semibold leading-6 text-alibi-teal">
        patterns in how you describe the day, kept separate from saved block notes.
      </p>

      {observations.length === 0 ? (
        <div className="alibi-banner-info mt-4">
          use chat for messy intentions, drift, friction, or feelings and this panel will mirror the language back with excerpts.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {observations.map((observation) => (
            <article
              key={observation.title}
              className="alibi-block-item"
            >
              <h3 className="text-[14px] font-semibold tracking-tight text-alibi-ink">
                {observation.title}
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-alibi-ink">
                {observation.body}
              </p>
              <p className="mt-3 wrap-break-words border-t border-alibi-lavender/25 pt-3 text-xs font-semibold leading-5 text-alibi-teal">
                {observation.evidence}
              </p>
              <PatternSources sources={observation.sources} />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
