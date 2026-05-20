import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarRange,
  Heart,
  Lock,
  MessageCircleQuestion,
  Network,
  NotebookPen,
  Play,
  Plus,
  SearchCheck,
  Timer,
  type LucideIcon,
} from "lucide-react"

interface Feature {
  icon: LucideIcon
  title: string
  body: string
}

const FEATURES: Feature[] = [
  {
    icon: Timer,
    title: "timer-first blocks",
    body: "start without planning, stop when the block is real, then add the task, category, tags, and notes after the fact.",
  },
  {
    icon: Plus,
    title: "manual time blocks",
    body: "backfill missed work with the same structure as tracked time: start, end, task, category, hashtags, and notes.",
  },
  {
    icon: NotebookPen,
    title: "notes as evidence",
    body: "write what actually happened: parallel activity, attention shifts, friction, feelings, useful distractions, and outcomes.",
  },
  {
    icon: MessageCircleQuestion,
    title: "chat as reconstruction",
    body: "use chat to start or stop the timer, log completed work, ask for missing details, or help turn a messy memory into a better note.",
  },
  {
    icon: CalendarRange,
    title: "timeline record",
    body: "today's blocks keep exact times, duration, categories, notes, edit/delete controls, and a resume button for the latest block.",
  },
  {
    icon: BarChart3,
    title: "dashboard mirror",
    body: "the dashboard summarizes categories, rhythm, markers, and note-derived observations without turning the day into a score.",
  },
  {
    icon: SearchCheck,
    title: "notes-first analysis",
    body: "when you ask what happened, Alibi prioritizes your notes, then metadata, then linked chat, then broader chat context.",
  },
  {
    icon: Network,
    title: "future RAG experiment",
    body: "the ambition is source-backed retrieval: patterns and answers that cite dated blocks, note excerpts, chat turns, and evidence items.",
  },
  {
    icon: Lock,
    title: "private account data",
    body: "authenticated data is protected with Supabase row-level security. the public demo stays in your browser until you choose to import it.",
  },
]

export default function LandingPage() {
  return (
    <main className="alibi-page relative w-full">
      <nav className="alibi-pill fixed left-1/2 top-6 z-50 flex -translate-x-1/2 items-center gap-5 px-6 py-3">
        <span className="text-[15px] font-black tracking-tight text-alibi-blue">alibi</span>
        <div className="h-4 w-px bg-alibi-lavender/40" />
        <Link
          href="/demo"
          className="text-[13px] font-bold text-alibi-teal transition-colors hover:text-alibi-pink"
        >
          demo
        </Link>
        <Link
          href="/docs"
          className="text-[13px] font-bold text-alibi-teal transition-colors hover:text-alibi-pink"
        >
          docs
        </Link>
        <Link
          href="/auth/login"
          className="alibi-button-primary flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px]"
        >
          sign in
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
        </Link>
      </nav>

      <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 pb-16 pt-32 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="alibi-label">notes-first time evidence</p>
          <h1 className="mt-4 text-balance text-4xl font-black tracking-tight text-alibi-ink sm:text-5xl md:text-6xl">
            the friend who remembers
            <br />
            <span className="text-alibi-pink">your day</span>
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-[16px] leading-relaxed text-alibi-teal">
            Alibi is a witness for messy lived time. It helps you track what happened, write the
            nuance your memory loses, and later ask for patterns grounded in dated evidence.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/demo"
              className="alibi-button-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px]"
            >
              <Play className="h-4 w-4" strokeWidth={2.4} />
              try the demo
            </Link>
            <Link
              href="/auth/sign-up"
              className="alibi-button-secondary inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px]"
            >
              create account
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
            </Link>
          </div>

          <p className="mt-4 max-w-xl text-[12.5px] leading-6 text-alibi-teal/75">
            The demo uses browser storage. If you sign up after trying it, completed demo blocks can
            be imported into your account.
          </p>
        </div>

        <section className="alibi-card-pop p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                what it is
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-alibi-blue">
                a timeline with memory
              </h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-alibi-pink/15 text-alibi-pink">
              <Heart className="h-5 w-5" strokeWidth={2.3} />
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <PromiseRow
              icon={Timer}
              title="capture"
              body="timer, manual entry, and chat create the same time-block record."
            />
            <PromiseRow
              icon={NotebookPen}
              title="preserve"
              body="notes keep the messy human evidence: intention, drift, feeling, friction, and outcome."
            />
            <PromiseRow
              icon={SearchCheck}
              title="reflect"
              body="analysis reads notes first and keeps observations tied to the original evidence."
            />
            <PromiseRow
              icon={Network}
              title="retrieve"
              body="future RAG work will search source-backed chunks instead of inventing vague summaries."
            />
          </div>
        </section>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <header className="mb-8 max-w-3xl">
          <p className="alibi-label">what alibi does</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-alibi-ink sm:text-3xl">
            a complete record, not a clean fiction
          </h2>
          <p className="mt-3 text-[14px] leading-6 text-alibi-teal">
            The current app already supports timer tracking, manual blocks, editable notes, custom
            categories, chat logging, dashboard summaries, and note-derived insights. The larger
            experiment is to turn that record into a trustworthy retrieval system for work patterns.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="alibi-inset px-7 py-7 text-center">
          <BookOpen className="mx-auto h-5 w-5 text-alibi-pink" strokeWidth={2.3} />
          <h2 className="mt-3 text-2xl font-black tracking-tight text-alibi-blue">
            built as a RAG experiment, but grounded in the product first
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-7 text-alibi-ink">
            RAG only becomes useful when the source material is clean. Alibi's first job is to
            preserve dated notes, chat context, and derived evidence. The next job is retrieval that
            can answer questions like "when does admin become avoidance?" with citations back to
            actual blocks.
          </p>
          <Link
            href="/demo"
            className="alibi-button-primary mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px]"
          >
            start with a demo session
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-alibi-blue/15 py-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold tracking-[0.04em] text-alibi-teal">
            alibi - for the days you can't see clearly
          </p>
          <Link
            href="/privacy"
            className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-alibi-teal/60 transition hover:text-alibi-pink"
          >
            privacy
          </Link>
          <Link
            href="/terms"
            className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-alibi-teal/60 transition hover:text-alibi-pink"
          >
            terms
          </Link>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon

  return (
    <article className="alibi-card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-alibi-pink/15 text-alibi-pink">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-[14px] font-semibold tracking-tight text-alibi-ink">
          {feature.title}
        </h3>
      </div>
      <p className="text-[13px] leading-relaxed text-alibi-teal">{feature.body}</p>
    </article>
  )
}

function PromiseRow({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon
  title: string
  body: string
}) {
  return (
    <div className="alibi-doc-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-alibi-teal/15 text-alibi-teal">
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div>
          <h3 className="text-[13px] font-black uppercase tracking-[0.06em] text-alibi-blue">
            {title}
          </h3>
          <p className="mt-1 text-[13px] leading-6 text-alibi-teal">{body}</p>
        </div>
      </div>
    </div>
  )
}
