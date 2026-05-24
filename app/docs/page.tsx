import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Heart,
  Lock,
  MessageCircleQuestion,
  NotebookPen,
  Route,
  SearchCheck,
  Split,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { TopNav } from "@/components/top-nav"
import { getCurrentUser } from "@/lib/auth/session"

interface WikiSection {
  id: string
  icon: LucideIcon
  title: string
  intro: string
  points: string[]
}

const SECTIONS: WikiSection[] = [
  {
    id: "what-it-is",
    icon: BookOpen,
    title: "what alibi is",
    intro:
      "alibi is a witness for lived time. it helps you keep evidence of what actually happened, especially when the day was messy, mixed, or hard to remember clearly.",
    points: [
      "it is not a planner, todo list, scorecard, or productivity dashboard.",
      "it records completed time, not expectations.",
      "it treats nuanced notes as the most important part of the record.",
      "it uses chat to help you reconstruct details, not to judge or push you.",
    ],
  },
  {
    id: "how-it-works",
    icon: Route,
    title: "how the system works",
    intro:
      "the app has three ways to create the same kind of record: timer, manual block, and chat. all three write to the time-block timeline.",
    points: [
      "a time block gives the note coordinates: date, start, end, duration, category, and tags.",
      "the note explains what really happened inside that time.",
      "the general companion chat can start or stop the timer, add a completed block, or ask for missing details.",
      "each completed block can open its own companion thread for reflection about that block.",
      "derived insights are stored beside your notes, but they never replace the original text.",
    ],
  },
  {
    id: "notes",
    icon: NotebookPen,
    title: "how to write useful notes",
    intro:
      "a useful note does not need to be tidy. it should preserve the texture of the block so future-you and the agent can understand what the timestamp alone cannot say.",
    points: [
      "write what you intended to do and what actually happened.",
      "include parallel activity, attention shifts, interruptions, and useful distractions.",
      "name friction: what slowed you down, what you avoided, what felt unclear.",
      "include feeling: guilt, relief, pride, flatness, anxiety, satisfaction, or mixed states.",
      "record outcome without judging it: what moved, what changed, what became clearer.",
      "edit later if your interpretation changes. note history is preserved.",
    ],
  },
  {
    id: "chat",
    icon: MessageCircleQuestion,
    title: "how to make chat useful",
    intro:
      "chat is best when you use it as a reconstruction partner. ask it to help pull out details, feelings, and patterns instead of only asking it to log a clean task.",
    points: [
      "ask it to help reconstruct a messy block when you remember fragments.",
      "ask it to turn a rambling description into a time-block note.",
      "use natural duration language: ongoing work starts an open timer in the past, while completed work logs the duration ending now.",
      "tell it to ask follow-up questions before saving if task or category evidence is unclear.",
      "ask for evidence-backed reflections, such as what your notes show this week.",
      "use it when you feel like you did nothing; it can read saved blocks back with specifics.",
      "use chat about this on a saved block when you want reflection scoped to one block and its note.",
    ],
  },
  {
    id: "block-threads",
    icon: Split,
    title: "general chat vs block chats",
    intro:
      "alibi now keeps the main companion chat separate from block-specific threads. the main chat can operate the timer and log blocks. a block thread is reflective: it stays focused on one saved block.",
    points: [
      "open a block thread from the message button on a completed time block.",
      "opening the same block again returns to the same thread instead of starting over.",
      "the block note is included as fixed context, so the companion can discuss what actually happened inside that block.",
      "block threads can summarize, reframe, and help you reinterpret the block, but they do not edit stored data in this version.",
      "use main chat when you want to log new work, start or stop the timer, or ask about the whole day.",
    ],
  },
  {
    id: "insights",
    icon: SearchCheck,
    title: "how insights should be read",
    intro:
      "insights are interpretations of your evidence. they are useful for pattern spotting, but the raw note and chat history remain the source of truth.",
    points: [
      "the strongest evidence is a note tied to a dated time block.",
      "metadata like category, duration, mood, effort, and tags adds context.",
      "block-specific companion threads can explain feelings or missing details around a block.",
      "the notes mirror shows what happened inside saved blocks; the chat mirror shows patterns in how you describe the day.",
      "chat-derived insights can surface intention, avoidance, useful drift, mismatch, and feeling language without turning every message into a block.",
      "good observations should point back to dates, blocks, excerpts, or messages.",
    ],
  },
  {
    id: "privacy",
    icon: Lock,
    title: "privacy and data",
    intro:
      "your timeline is stored in your own authenticated account. the app keeps raw input and derived interpretation separate so your words remain intact.",
    points: [
      "row-level security protects time blocks, active timer state, categories, note versions, insights, and chat messages.",
      "timer, manual entry, and chat share the same time-block data structure.",
      "companion conversations keep general chat separate from block-specific chats.",
      "block chats store compact block context so the agent can use the note without loading unrelated history.",
      "note versions preserve meaningful edits instead of silently losing the old version.",
      "retrieval uses source-linked records and memory chunks; observations should stay tied to dated blocks, excerpts, or messages.",
    ],
  },
  {
    id: "ai-models",
    icon: Sparkles,
    title: "ai models, providers, and cost",
    intro:
      "alibi runs on two model slots. a fast slot handles routing, extraction, and acknowledgments. a companion slot writes the voice that talks back. you can keep the hosted defaults or bring your own keys from /app/settings.",
    points: [
      "hosted default fast model is deepseek chat v3. it classifies what you typed and pulls structured fields like time and category.",
      "hosted default companion model is anthropic claude haiku 4.5. it writes the reply and matches the alibi voice guide.",
      "non-visible work like chat-insight and note-insight extraction runs on the fast model so the bill stays small. custom dashboards use the companion model internally to analyze a server-built evidence packet.",
      "chat-insight and note-insight extraction run inline on the fast model so derived mirrors stay reliable after each saved message or note.",
      "the analyse path uses the fast model to gather evidence from the memory packet, then the companion model rewrites only that summary in the alibi voice. the long evidence packet never pays companion-tier price.",
      "on direct anthropic profiles, the system prompt and voice guide are sent with ephemeral prompt caching, so repeat turns bill cached input at a fraction of the normal rate.",
      "settings ships presets for openrouter, openai, anthropic, deepseek, qwen (dashscope), zhipu glm, and moonshot kimi. any openai-compatible base url also works, including a local llama.cpp or vllm server.",
      "your provider key is encrypted at rest and is only used in the request that needs it. nothing about your messages is shared with alibi infrastructure beyond that request.",
    ],
  },
]

const NOTE_EXAMPLES = [
  {
    title: "quick version",
    text: "meant to answer email, got pulled into fixing the gallery upload bug. useful detour, but i felt guilty because the invoice is still open.",
  },
  {
    title: "reflection version",
    text: "started with admin. avoided the invoice for about 15 minutes by cleaning up tabs, then actually found the missing receipt. felt scattered but less stuck after that.",
  },
  {
    title: "parallel activity version",
    text: "had the meeting on in the background while editing the proposal. mostly proposal work, but the meeting gave me two useful phrasing changes. energy was low but focus improved near the end.",
  },
]

const CHAT_PROMPTS = [
  "help me reconstruct the last two hours before you save anything.",
  "ask me questions to turn this into a useful note: i bounced between the invoice and gallery bug.",
  "log a block from 2 to 3:15, but help me name what actually happened.",
  "i've been doing email for 30 minutes.",
  "i did email for 30 minutes.",
  "what do my notes this week suggest about when admin turns into avoidance?",
  "i feel like i did nothing today. can you read back the evidence from my blocks?",
  "turn this messy description into a note, and keep the uncertainty in it.",
]

const BLOCK_THREAD_PROMPTS = [
  "what does this note say that the task name misses?",
  "help me name the actual work inside this block.",
  "summarize this block without making it sound cleaner than it was.",
  "what friction shows up here?",
  "what should future-me remember about this block?",
]

const NAV_EXTRAS = [
  { id: "examples", title: "note and chat examples" },
  { id: "roadmap", title: "where this is going" },
]

const NAV_LINKS = [
  ...SECTIONS.map(({ id, title }) => ({ id, title })),
  ...NAV_EXTRAS,
]

export default async function DocsPage() {
  const user = await getCurrentUser()

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col gap-6 p-6 sm:p-8">
        {user ? (
          <TopNav activeHref="/docs" />
        ) : (
          <PublicDocsNav />
        )}

        <header className="px-1 sm:px-2">
          <div>
            <span className="alibi-label">wiki</span>
            <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-alibi-blue">
              how to use alibi well
            </h1>
          </div>
          <p className="mt-3 max-w-3xl text-[14px] leading-[1.6] text-alibi-teal">
            this page is the working manual for alibi: what it is, how the record is built, how to
            write notes that future-you can actually use, and how to talk to the companion when the
            day was too tangled for a clean label.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="alibi-card h-fit px-5 py-5 lg:sticky lg:top-6">
            <p className="alibi-label mb-3">on this page</p>
            <nav className="flex flex-col gap-2" aria-label="documentation sections">
              {NAV_LINKS.map(({ id, title }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-xl px-2 py-1.5 text-[12.5px] font-semibold text-alibi-teal transition hover:bg-alibi-lavender/10 hover:text-alibi-pink hover:shadow-[inset_0_2px_5px_rgba(50,83,199,0.08)]"
                >
                  {title}
                </a>
              ))}
            </nav>
          </aside>

          <div className="flex flex-col gap-5">
            <section className="alibi-card px-6 py-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-alibi-pink/15 text-alibi-pink">
                  <Heart className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <div>
                  <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
                    the basic idea
                  </h2>
                  <p className="mt-2 text-[14px] leading-[1.7] text-alibi-ink">
                    a clean time tracker assumes work is simple: you planned a task, did it, then
                    stopped. alibi assumes the real day is messier. the timestamp matters, but the
                    note is where the useful truth usually lives.
                  </p>
                </div>
              </div>
            </section>

            {SECTIONS.map((section) => (
              <WikiSectionBlock key={section.id} section={section} />
            ))}

            <section id="examples" className="alibi-card p-6 scroll-mt-6">
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-alibi-pink" strokeWidth={2.3} />
                <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
                  note and chat examples
                </h2>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h3 className="text-[13px] font-black uppercase tracking-[0.06em] text-alibi-teal">
                    useful note shapes
                  </h3>
                  <div className="mt-3 flex flex-col gap-3">
                    {NOTE_EXAMPLES.map((example) => (
                      <article
                        key={example.title}
                        className="alibi-doc-card"
                      >
                        <h4 className="text-[13px] font-semibold text-alibi-ink">
                          {example.title}
                        </h4>
                        <p className="mt-2 font-mono text-[11.5px] leading-[1.6] text-alibi-teal">
                          {example.text}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[13px] font-black uppercase tracking-[0.06em] text-alibi-teal">
                    prompts for main chat
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2">
                    {CHAT_PROMPTS.map((prompt) => (
                      <li
                        key={prompt}
                        className="alibi-doc-card px-4 py-3 font-mono text-[11.5px] leading-[1.5] text-alibi-teal"
                      >
                        {prompt}
                      </li>
                    ))}
                  </ul>

                  <h3 className="mt-5 text-[13px] font-black uppercase tracking-[0.06em] text-alibi-teal">
                    prompts for chat about this
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2">
                    {BLOCK_THREAD_PROMPTS.map((prompt) => (
                      <li
                        key={prompt}
                        className="alibi-doc-card px-4 py-3 font-mono text-[11.5px] leading-[1.5] text-alibi-teal"
                      >
                        {prompt}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section id="roadmap" className="alibi-card px-6 py-6 scroll-mt-6">
              <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
                where this is going
              </h2>
              <p className="mt-2 text-[14px] leading-[1.7] text-alibi-ink">
                alibi now has the first retrieval layer: SQL range context plus source-linked memory
                chunks from blocks, notes, insights, and companion messages. the next version should
                make that layer more reliable around timezone scopes, fallback filtering, and longer
                notes while keeping every observation connected to dated evidence.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <RoadmapCard
                  title="better notes"
                  body="support richer reflection without forcing a form: intended versus actual, attention shifts, friction, feeling, and outcome."
                />
                <RoadmapCard
                  title="better evidence"
                  body="extract small source-linked claims from notes and chat so every pattern can point back to what you wrote."
                />
                <RoadmapCard
                  title="better retrieval"
                  body="tighten source and date scoping so vector fallback never widens a question beyond the evidence the user asked for."
                />
              </div>
            </section>

            {!user && (
              <section className="flex flex-col items-center gap-3 px-2 py-6 text-center">
                <p className="text-[13px] text-alibi-teal">
                  start with one honest block. messy is useful.
                </p>
                <Link
                  href="/demo"
                  className="alibi-button-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px]"
                >
                  try the demo
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                </Link>
                <Link
                  href="/auth/sign-up"
                  className="alibi-button-secondary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px]"
                >
                  create account
                </Link>
              </section>
            )}
          </div>
        </div>

        <footer className="text-center text-sm font-semibold tracking-[0.04em] text-alibi-teal">
          alibi - for the days you can&apos;t see clearly
        </footer>
      </div>
    </main>
  )
}

function PublicDocsNav() {
  return (
    <nav
      aria-label="public"
      className="alibi-pill flex items-center justify-between gap-3 px-4 py-2"
    >
      <Link
        href="/"
        className="flex items-baseline gap-2 px-1 transition-opacity hover:opacity-80"
      >
        <span className="text-[15px] font-black tracking-tight text-alibi-blue">alibi</span>
        <span className="hidden rounded-full bg-alibi-pink/15 px-2 py-0.5 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink sm:inline">
          docs
        </span>
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/demo"
          className="text-[13px] font-bold text-alibi-teal transition-colors hover:text-alibi-pink"
        >
          demo
        </Link>
        <Link
          href="/auth/login"
          className="alibi-button-primary inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px]"
        >
          sign in
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
        </Link>
      </div>
    </nav>
  )
}

function WikiSectionBlock({ section }: { section: WikiSection }) {
  const Icon = section.icon

  return (
    <section id={section.id} className="alibi-card p-6 scroll-mt-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-alibi-pink/15 text-alibi-pink">
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div>
          <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
            {section.title}
          </h2>
          <p className="mt-2 text-[14px] leading-[1.7] text-alibi-ink">{section.intro}</p>
        </div>
      </div>
      <ul className="mt-5 grid gap-2 md:grid-cols-2">
        {section.points.map((point) => (
          <li
            key={point}
            className="alibi-doc-card px-4 py-3 text-[13px] leading-[1.5] text-alibi-teal"
          >
            {point}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RoadmapCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="alibi-doc-card">
      <h3 className="text-[13px] font-black uppercase tracking-[0.06em] text-alibi-blue">
        {title}
      </h3>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-alibi-teal">{body}</p>
    </article>
  )
}
