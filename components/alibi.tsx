"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp, Lock, Mic } from "lucide-react"
import { TopNav } from "@/components/top-nav"
import { GLASS_PANEL_STYLE } from "@/lib/ui-styles"
import { processMessage } from "@/app/actions/process-message"
import { getEntries } from "@/app/actions/get-entries"
import type { Entry } from "@/lib/types"

/* Local message shape for the chat transcript (replaces ai-sdk's Message). */
interface ChatMsg {
  id: string
  role: "user" | "assistant"
  text: string
}

/* ------------------------------------------------------------------ */
/*  Types & placeholder data                                           */
/* ------------------------------------------------------------------ */

type Project =
  | "deep_work"
  | "admin"
  | "social"
  | "errands"
  | "care"
  | "creative"
  | "rest"

interface DoneEntry {
  id: string
  time: string // "HH:MM"
  text: string
  project: Project
}

interface DayGroup {
  label: string
  count: number
  entries: DoneEntry[]
}

/* Map a free-form project string from the DB to one of the seven hardcoded
 * Project keys used for pill colors. Anything we don't recognize gets bucketed
 * into a sensible default so the UI never breaks. */
const PROJECT_ALIASES: Record<string, Project> = {
  // care / self
  self: "care",
  care: "care",
  family: "care",
  // admin / errands
  admin: "admin",
  errands: "errands",
  "job-hunt": "admin",
  // social / home
  social: "social",
  home: "rest",
  // deep work — coding, real building
  cinecircle: "deep_work",
  dawkeeper: "deep_work",
  "speakers-corner": "deep_work",
  portfolio: "deep_work",
  deep_work: "deep_work",
  work: "deep_work",
  // creative
  music: "creative",
  creative: "creative",
  // rest / learning
  rest: "rest",
  learning: "rest",
}

function mapProject(raw: string | null): Project {
  if (!raw) return "admin"
  const key = raw.trim().toLowerCase()
  return PROJECT_ALIASES[key] ?? "admin"
}

/* Group entries by local-calendar day, newest day first. Within each day,
 * entries are oldest-first so the receipt reads top-to-bottom in chronological
 * order. */
function groupEntriesByDay(entries: Entry[]): DayGroup[] {
  const now = new Date()
  const todayKey = localDateKey(now)
  const yesterdayKey = localDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  const byKey = new Map<string, Entry[]>()
  for (const e of entries) {
    const key = localDateKey(new Date(e.created_at))
    const list = byKey.get(key) ?? []
    list.push(e)
    byKey.set(key, list)
  }

  const sortedKeys = Array.from(byKey.keys()).sort((a, b) => (a < b ? 1 : -1))

  return sortedKeys.map((key) => {
    const dayEntries = (byKey.get(key) ?? [])
      .slice()
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))

    let label: string
    if (key === todayKey) label = "TODAY"
    else if (key === yesterdayKey) label = "YESTERDAY"
    else {
      const d = new Date(`${key}T12:00:00`)
      label = d
        .toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
        .toUpperCase()
    }

    return {
      label,
      count: dayEntries.length,
      entries: dayEntries.map((e) => ({
        id: e.id,
        time: new Date(e.created_at).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        text: e.content,
        project: mapProject(e.project),
      })),
    }
  })
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/* Project pill: solid hex base, 30% alpha appended (0x4D). */
const PROJECT_PILL: Record<Project, string> = {
  deep_work: "#8B95A84D",
  admin: "#B5A8984D",
  social: "#D49B8C4D",
  errands: "#C9B87A4D",
  care: "#8B9D7F4D",
  creative: "#A89BC84D",
  rest: "#C8B89F4D",
}

const PROJECT_LABEL: Record<Project, string> = {
  deep_work: "deep work",
  admin: "admin",
  social: "social",
  errands: "errands",
  care: "care",
  creative: "creative",
  rest: "rest",
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface AlibiProps {}

export function Alibi(_: AlibiProps) {
  const [input, setInput] = useState("")
  const [recording, setRecording] = useState(false)
  const [filed, setFiled] = useState(false)
  const [todoTooltip, setTodoTooltip] = useState(false)
  const [now, setNow] = useState<string | null>(null)

  const filedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])

  /* Pull live entries on mount so the receipt reflects what's actually in the DB. */
  const refreshEntries = useCallback(async () => {
    try {
      const entries = await getEntries()
      setDayGroups(groupEntriesByDay(entries))
    } catch (err) {
      console.log("[v0] getEntries failed:", err)
    }
  }, [])

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  /* Live clock for the empty-state stamp. Computed client-side to avoid hydration drift. */
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      )
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  /* Auto-scroll on new messages. */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, isThinking])

  /* Auto-resize textarea. */
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isThinking) return

    // Optimistic user bubble.
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "user",
      text,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    setIsThinking(true)

    try {
      const result = await processMessage(text)
      const replyId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      if (result.type === "logged") {
        // Filed indicator + ack bubble; if Alibi spontaneously spoke up, append that too.
        setFiled(true)
        if (filedTimer.current) clearTimeout(filedTimer.current)
        filedTimer.current = setTimeout(() => setFiled(false), 1500)
        // Pull the freshly-saved entry into the receipt panel.
        refreshEntries()

        setMessages((prev) => {
          const next = [...prev, { id: replyId, role: "assistant" as const, text: result.ack }]
          return next
        })
      } else if (result.type === "analysis") {
        setMessages((prev) => [
          ...prev,
          { id: replyId, role: "assistant", text: result.message },
        ])
      } else if (result.type === "clarify") {
        setMessages((prev) => [
          ...prev,
          { id: replyId, role: "assistant", text: result.question },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: replyId,
            role: "assistant",
            text: "ack" in result ? result.ack : result.message,
          },
        ])
      }
    } catch (err) {
      console.log("[v0] processMessage failed:", err)
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: "couldn't reach me just now. try once more?",
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }, [input, isThinking, refreshEntries])

  return (
    <main className="relative h-screen w-full overflow-hidden text-[#2A1F14]">
      {/* Page padding 32px, two-column 40/60 with 24px gap, max 1280px */}
      <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-4 p-6">
        <TopNav activeHref="/app" />
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[40fr_60fr]">
          {/* ─────────────────── LEFT — CHAT ─────────────────── */}
          <section
            className="relative flex min-h-0 flex-col overflow-hidden"
            style={GLASS_PANEL_STYLE}
          >
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-5">
              <div className="flex items-baseline gap-3">
                <h1 className="text-[1.05rem] font-semibold tracking-tight text-[#2A1F14]">
                  alibi
                </h1>
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#A89680]">
                  done-list
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="alibi-listen-dot block h-2 w-2 rounded-full bg-[#8B9D7F]"
                />
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B5A47]">
                  listening
                </span>
              </div>
            </header>

            <div
              aria-hidden
              className="mx-6"
              style={{ borderTop: "1px solid rgba(60, 40, 20, 0.08)" }}
            />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                  <p className="text-[15px] leading-[1.5] text-[#6B5A47]">
                    nothing on the record yet.
                  </p>
                  <p className="mt-1 text-[13px] text-[#A89680]">
                    tell me what you&apos;ve been up to.
                  </p>
                  <p className="mt-6 font-mono text-[11px] tracking-[0.12em] text-[#C8B89F]">
                    {now ?? "—"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isUser = m.role === "user"
                    const text = m.text
                    if (!text) return null
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        {isUser ? (
                          <div
                            className="alibi-soft-rise max-w-[80%] text-[14.5px] leading-[1.5] text-white"
                            style={{
                              background: "rgba(200, 85, 61, 0.85)",
                              backdropFilter: "blur(12px) saturate(140%)",
                              WebkitBackdropFilter: "blur(12px) saturate(140%)",
                              padding: "12px 16px",
                              borderRadius: 14,
                              boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px rgba(200,85,61,0.18)",
                            }}
                          >
                            {text}
                          </div>
                        ) : (
                          <p
                            className="alibi-soft-rise max-w-[80%] text-[14.5px] leading-[1.5] text-[#2A1F14]"
                            style={{ padding: "12px 16px 12px 0" }}
                          >
                            {text}
                          </p>
                        )}
                      </div>
                    )
                  })}
                  {isThinking && (
                    <p className="px-1 text-[12px] italic tracking-wide text-[#A89680]">
                      noting...
                    </p>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div
              className="px-5 pb-5 pt-3"
              style={{ borderTop: "1px solid rgba(60, 40, 20, 0.06)" }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
              >
                <div
                  className="flex items-end gap-2 px-3 py-2"
                  style={{
                    background: "rgba(244, 237, 224, 0.55)",
                    border: "1px solid rgba(60, 40, 20, 0.08)",
                    borderRadius: 12,
                    boxShadow: "inset 0 1px 3px rgba(60, 40, 20, 0.08)",
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      autoResize(e.target)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    rows={1}
                    placeholder={
                      recording ? "listening..." : "what have you been up to?"
                    }
                    aria-label="chat input"
                    className="flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[14.5px] leading-[1.5] text-[#2A1F14] outline-none placeholder:text-[#A89680]"
                  />
                  <button
                    type="button"
                    onClick={() => setRecording((v) => !v)}
                    aria-label={recording ? "stop recording" : "start voice input"}
                    aria-pressed={recording}
                    className={`${
                      recording ? "alibi-record-pulse" : ""
                    } flex h-9 w-9 flex-shrink-0 items-center justify-center transition-colors`}
                    style={{
                      borderRadius: 10,
                      background: recording ? "#C8553D" : "transparent",
                      border: recording
                        ? "1px solid #C8553D"
                        : "1px solid rgba(60, 40, 20, 0.18)",
                      color: recording ? "#FFFFFF" : "#6B5A47",
                    }}
                  >
                    <Mic className="h-4 w-4" strokeWidth={recording ? 2.5 : 2} />
                  </button>
                  <button
                    type="submit"
                    disabled={!input.trim() || isThinking}
                    aria-label="send"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      background: "#C8553D",
                      boxShadow:
                        "0 2px 6px rgba(200, 85, 61, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                    }}
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={2.6} />
                  </button>
                </div>
              </form>
              <div className="mt-2 h-4 text-center" aria-live="polite">
                {filed && (
                  <span className="alibi-fade-in text-[11px] tracking-[0.05em] text-[#8B9D7F]">
                    filed ✓
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ─────────────────── RIGHT — RECEIPT ─────────────────── */}
          <section
            className="flex min-h-0 flex-col overflow-hidden"
            style={GLASS_PANEL_STYLE}
          >
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-6 py-4">
              <Tab active>Done</Tab>
              <TabLocked
                tooltipOpen={todoTooltip}
                onShow={() => setTodoTooltip(true)}
                onHide={() => setTodoTooltip(false)}
              />
              <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.2em] text-[#A89680]">
                on the record
              </span>
            </div>

            <div
              aria-hidden
              className="mx-6"
              style={{ borderTop: "1px solid rgba(60, 40, 20, 0.08)" }}
            />

            {/* Receipt — thermal-paper inset */}
            <div className="min-h-0 flex-1 p-5">
              <div
                className="relative h-full overflow-y-auto scrollbar-thin"
                style={{
                  background:
                    "linear-gradient(180deg, #F8F1E3 0%, #F4ECDA 100%)",
                  borderRadius: 12,
                  boxShadow:
                    "inset 0 2px 6px rgba(60, 40, 20, 0.08), inset 0 -1px 0 rgba(255,255,255,0.6)",
                }}
              >
                {/* Faint paper grain — pure CSS, no assets. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    opacity: 0.06,
                    borderRadius: 12,
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, rgba(60,40,20,0.7) 1px, transparent 0)",
                    backgroundSize: "3px 3px",
                  }}
                />

                <div className="relative px-7 py-7">
                  {dayGroups.length === 0 ? (
                    <EmptyReceipt now={now} />
                  ) : (
                    dayGroups.map((day, i) => (
                      <DaySection key={day.label} day={day} first={i === 0} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="text-center text-[11px] tracking-[0.04em] text-[#A89680]">
          alibi — for the days you can&apos;t see clearly
        </footer>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Tab({
  active,
  children,
}: {
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-selected={active}
      className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors"
      style={
        active
          ? {
              borderRadius: 10,
              background: "rgba(255, 255, 255, 0.65)",
              color: "#2A1F14",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 0 rgba(60,40,20,0.06)",
            }
          : {
              borderRadius: 10,
              background: "transparent",
              color: "#6B5A47",
            }
      }
    >
      {children}
    </button>
  )
}

function TabLocked({
  tooltipOpen,
  onShow,
  onHide,
}: {
  tooltipOpen: boolean
  onShow: () => void
  onHide: () => void
}) {
  return (
    <span
      tabIndex={0}
      role="button"
      aria-disabled
      onMouseEnter={onShow}
      onMouseLeave={onHide}
      onFocus={onShow}
      onBlur={onHide}
      className="relative flex cursor-not-allowed items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#A89680] outline-none focus-visible:ring-2 focus-visible:ring-[#C8553D]/30"
      style={{ borderRadius: 10 }}
    >
      <Lock className="h-3 w-3" strokeWidth={2.5} />
      Todo
      {tooltipOpen && (
        <span
          role="tooltip"
          className="alibi-fade-in absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-[11px] normal-case tracking-normal text-[#C8553D]"
          style={{
            background: "rgba(255, 250, 240, 0.85)",
            backdropFilter: "blur(16px) saturate(140%)",
            WebkitBackdropFilter: "blur(16px) saturate(140%)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            borderRadius: 10,
            boxShadow:
              "0 8px 24px rgba(60, 40, 20, 0.14), inset 0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          we don&apos;t do that here.
        </span>
      )}
    </span>
  )
}

function EmptyReceipt({ now }: { now: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-[15px] leading-[1.5] text-[#6B5A47]">
        nothing on the record yet.
      </p>
      <p className="mt-1 text-[13px] text-[#A89680]">
        tell me what you&apos;ve been up to.
      </p>
      <p className="mt-6 font-mono text-[11px] tracking-[0.12em] text-[#C8B89F]">
        {now ?? "—"}
      </p>
    </div>
  )
}

function DaySection({ day, first }: { day: DayGroup; first: boolean }) {
  return (
    <section className={first ? "" : "mt-7"}>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2A1F14]">
          {day.label}
        </h2>
        <hr className="flex-1 border-0" style={{ borderTop: "1px dashed #C8B89F" }} />
        <span className="font-mono text-[10px] tracking-[0.12em] text-[#A89680]">
          {String(day.count).padStart(2, "0")} ITEMS
        </span>
      </div>

      <ul>
        {day.entries.map((entry, idx) => (
          <li key={entry.id} className="alibi-soft-rise">
            <ReceiptRow entry={entry} />
            {idx < day.entries.length - 1 && (
              <hr
                className="border-0"
                style={{ borderTop: "1px dashed rgba(200, 184, 159, 0.55)" }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReceiptRow({ entry }: { entry: DoneEntry }) {
  return (
    <div
      className="group flex items-center gap-4 px-2 py-2.5 transition-colors hover:bg-[#F8F1E3]"
      style={{ borderRadius: 6 }}
    >
      <span
        className="flex-shrink-0 font-mono text-[12px] tracking-[0.06em] text-[#6B5A47]"
        style={{ width: "3.25rem" }}
      >
        {entry.time}
      </span>
      <span className="flex-1 text-[14px] leading-[1.5] text-[#2A1F14]">
        {entry.text}
      </span>
      <span
        className="flex-shrink-0 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
        style={{
          background: PROJECT_PILL[entry.project],
          color: "#2A1F14",
          borderRadius: 6,
        }}
      >
        {PROJECT_LABEL[entry.project]}
      </span>
    </div>
  )
}
