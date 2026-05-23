import { buildNotesMirrorObservations } from "@/lib/dashboard-data"
import type { TimeBlock, TimeBlockInsight } from "@/lib/types"
import { PatternSources } from "@/components/dashboard/pattern-sources"

export function NotesMirror({
  blocks,
  insights,
  noteVersionCreatedAtById,
}: {
  blocks: TimeBlock[]
  insights: TimeBlockInsight[]
  noteVersionCreatedAtById?: Map<string, string>
}) {
  const observations = buildNotesMirrorObservations(blocks, insights, noteVersionCreatedAtById)

  return (
    <section className="alibi-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">notes mirror</h2>
        <span className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
          note-grounded
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold leading-6 text-alibi-teal">
        observations from what you wrote happened, with the trail left visible.
      </p>

      {observations.length === 0 ? (
        <div className="alibi-banner-info mt-4">
          add notes to a few blocks and this panel will start showing themes without scoring them.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {observations.map((observation) => (
            <article
              key={observation.title}
              className="alibi-block-item"
            >
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-alibi-blue">
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
