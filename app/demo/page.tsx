"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock,
  KeyRound,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Play,
  RotateCcw,
  Send,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-react"
import {
  DEMO_DEFAULT_CATEGORIES,
  DEMO_SESSION_VERSION,
  clearDemoSession,
  createDemoAiSettings,
  demoBlockToTimeBlock,
  demoDurationSeconds,
  makeDemoMessage,
  readDemoSession,
  upsertDemoChatInsight,
  upsertDemoInsight,
  writeDemoSession,
  type DemoStoredBlock,
  type DemoStoredMessage,
  type DemoStoredSession,
  type DemoAiSettings,
} from "@/lib/demo-storage"
import { generateDemoBlockInsight, processDemoCompanionMessage } from "@/app/actions/demo"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import type { CompanionDraft } from "@/lib/block-draft-utils"
import {
  DEMO_COMPANION_MIN_TOKENS,
  DEMO_INSIGHT_MIN_TOKENS,
  addDemoTokenUsage,
  canSpendDemoTokens,
  createDemoAiUsage,
  type DemoAiUsage,
} from "@/lib/demo-token-budget"
import type { CompanionMessageInsight, TimeBlockCategoryRecord, TimeBlockInsight } from "@/lib/types"
import { cn } from "@/lib/utils"
import { defaultCategoryColor, getCategoryMeta } from "@/lib/time-block-display"

type DemoActiveTimer = NonNullable<DemoStoredSession["active_timer"]>
type DemoView = "tracker" | "dashboard"

type DemoActiveThread =
  | {
      kind: "general"
    }
  | {
      kind: "time_block"
      blockId: string
    }

type EditorState = {
  block?: DemoStoredBlock
  isNewlyStopped: boolean
  isManual: boolean
  taskName: string
  category: string
  hashtags: string
  notes: string
  startedAt: string
  endedAt: string
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":")
}

function formatTime(value: string | null) {
  if (!value) return "--:--"

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatChatTimestamp(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "0m"

  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${Math.max(1, minutes)}m`
}

function formatDateHeading(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date)
}

function toDateTimeLocal(value: string | null) {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  return new Date(value).toISOString()
}

function parseHashtags(value: string) {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
}

function slugifyCategoryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
}

function createManualEditorState(): EditorState {
  const endedAt = new Date()
  const startedAt = new Date(endedAt.getTime() - 30 * 60_000)

  return {
    isNewlyStopped: false,
    isManual: true,
    taskName: "",
    category: "",
    hashtags: "",
    notes: "",
    startedAt: toDateTimeLocal(startedAt.toISOString()),
    endedAt: toDateTimeLocal(endedAt.toISOString()),
  }
}

function createEditorState(block: DemoStoredBlock, isNewlyStopped = false): EditorState {
  return {
    block,
    isNewlyStopped,
    isManual: false,
    taskName: block.task_name ?? "",
    category: block.category ?? "",
    hashtags: block.hashtags.join(" "),
    notes: block.notes ?? "",
    startedAt: toDateTimeLocal(block.started_at),
    endedAt: toDateTimeLocal(block.ended_at),
  }
}

function categoryMeta(category: string | null, categories: TimeBlockCategoryRecord[]) {
  return getCategoryMeta(category, categories)
}

function makeMessage(role: DemoStoredMessage["role"], text: string): DemoStoredMessage {
  return makeDemoMessage(role, text)
}

function blockThreadIntro(block: DemoStoredBlock): DemoStoredMessage {
  return makeMessage(
    "assistant",
    `opened a thread for ${block.task_name || "this block"}. i can reflect on the note and details here without changing the block.`,
  )
}

function blockContextReply(block: DemoStoredBlock, text: string) {
  const lower = text.toLowerCase()
  const note = block.notes?.trim()
  const task = block.task_name || "this block"
  const category = block.category ? block.category.replace(/_/g, " ") : "uncategorized"
  const duration = formatDuration(block.started_at, block.ended_at)

  if (!note) {
    return `${task} is on the record as ${category} for ${duration}, but there is no note yet. the most useful next step is probably adding what actually happened inside it.`
  }

  if (lower.includes("summar") || lower.includes("what happened")) {
    return `the block says: ${note}. filed as ${category} for ${duration}. that note is the context i would keep attached to this thread.`
  }

  if (lower.includes("friction") || lower.includes("stuck") || lower.includes("avoid")) {
    return `looking only at this block, the friction seems to be in the note itself: ${note}. i would keep that wording instead of smoothing it out.`
  }

  if (lower.includes("name") || lower.includes("title") || lower.includes("call")) {
    return `i would name the real work from the note, not just the category. current label: ${task}. note context: ${note}`
  }

  return `for this block, i am using the note as context: ${note}. nothing changes in the stored block from this demo thread.`
}

function parseDurationMinutes(text: string) {
  const hourMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)
  const minuteMatch = text.match(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/i)
  const hours = hourMatch ? Number(hourMatch[1]) * 60 : 0
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0
  const total = hours + minutes

  return total > 0 ? Math.round(total) : null
}

function inferCategory(text: string) {
  const lower = text.toLowerCase()
  if (/\b(email|invoice|admin|form|paperwork|receipt|tax)\b/.test(lower)) return "admin"
  if (/\b(code|coding|write|writing|design|research|build|bug|deep)\b/.test(lower)) return "deep_work"
  if (/\b(meeting|call|friend|team|sync|chat|coffee)\b/.test(lower)) return "social"
  if (/\b(errand|shop|store|post office|pickup)\b/.test(lower)) return "errands"
  if (/\b(clean|cook|doctor|care|laundry|health)\b/.test(lower)) return "care"
  if (/\b(draw|music|film|edit|creative|photo)\b/.test(lower)) return "creative"
  if (/\b(rest|nap|walk|break|sleep|recover)\b/.test(lower)) return "rest"
  return "deep_work"
}

function cleanTaskName(text: string) {
  return text
    .replace(/\b(log|logged|save|saved|record|recorded|worked on|i worked on|spent)\b/gi, "")
    .replace(/\bfrom\s+\S+\s+(?:to|-)\s+\S+\b/gi, "")
    .replace(/\bfor\s+\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

function createBlockFromChat(text: string): DemoStoredBlock {
  const durationMinutes = parseDurationMinutes(text) ?? 30
  const endedAt = new Date()
  const startedAt = new Date(endedAt.getTime() - durationMinutes * 60_000)
  const taskName = cleanTaskName(text) || "reconstructed block"
  const now = new Date().toISOString()

  return {
    id: newId("demo-block"),
    user_id: "demo",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: durationMinutes * 60,
    category_id: inferCategory(text),
    task_name: taskName,
    category: inferCategory(text),
    hashtags: [],
    notes: text,
    mood: null,
    effort_level: null,
    satisfaction: null,
    avoidance_marker: false,
    hyperfocus_marker: false,
    guilt_marker: false,
    novelty_marker: false,
    agent_metadata: { source: "demo_local_fallback" },
    created_at: now,
    updated_at: now,
  }
}

function createBlockFromOperation({
  id,
  started_at,
  ended_at,
  task_name,
  category,
  hashtags,
  notes,
  base,
}: {
  id: string
  started_at: string
  ended_at: string
  task_name: string | null
  category: string | null
  hashtags: string[]
  notes: string | null
  base?: DemoStoredBlock
}): DemoStoredBlock {
  const now = new Date().toISOString()

  return {
    id,
    user_id: "demo",
    started_at,
    ended_at,
    duration_seconds: demoDurationSeconds(started_at, ended_at),
    category_id: category ?? base?.category_id ?? base?.category ?? null,
    task_name: task_name ?? base?.task_name ?? null,
    category: category ?? base?.category ?? null,
    hashtags: hashtags.length > 0 ? hashtags : (base?.hashtags ?? []),
    notes: notes ?? base?.notes ?? null,
    mood: base?.mood ?? null,
    effort_level: base?.effort_level ?? null,
    satisfaction: base?.satisfaction ?? null,
    avoidance_marker: base?.avoidance_marker ?? false,
    hyperfocus_marker: base?.hyperfocus_marker ?? false,
    guilt_marker: base?.guilt_marker ?? false,
    novelty_marker: base?.novelty_marker ?? false,
    agent_metadata: base?.agent_metadata ?? { source: "demo_companion" },
    created_at: base?.created_at ?? now,
    updated_at: now,
  }
}

export default function DemoPage() {
  const [loaded, setLoaded] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [name, setName] = useState("")
  const [activeTimer, setActiveTimer] = useState<DemoActiveTimer | null>(null)
  const [blocks, setBlocks] = useState<DemoStoredBlock[]>([])
  const [categories, setCategories] = useState<TimeBlockCategoryRecord[]>([...DEMO_DEFAULT_CATEGORIES])
  const [messages, setMessages] = useState<DemoStoredMessage[]>([])
  const [blockThreads, setBlockThreads] = useState<Record<string, DemoStoredMessage[]>>({})
  const [pendingDraft, setPendingDraft] = useState<CompanionDraft | null>(null)
  const [insights, setInsights] = useState<TimeBlockInsight[]>([])
  const [chatInsights, setChatInsights] = useState<CompanionMessageInsight[]>([])
  const [aiUsage, setAiUsage] = useState<DemoAiUsage>(() => createDemoAiUsage())
  const [aiSettings, setAiSettings] = useState<DemoAiSettings>(() => createDemoAiSettings())
  const [activeThread, setActiveThread] = useState<DemoActiveThread>({ kind: "general" })
  const [view, setView] = useState<DemoView>("tracker")
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [pending, setPending] = useState(false)
  const [chatPending, setChatPending] = useState(false)

  const today = useMemo(() => new Date(), [])
  const elapsed = activeTimer
    ? Math.max(0, Math.floor((now - new Date(activeTimer.started_at).getTime()) / 1000))
    : 0

  useEffect(() => {
    const existing = readDemoSession()
    if (existing) {
      setName(existing.name)
      setNameInput(existing.name)
      setActiveTimer(existing.active_timer)
      setBlocks(existing.blocks)
      setCategories(existing.categories)
      setMessages(existing.messages)
      setBlockThreads(existing.block_threads ?? {})
      setPendingDraft(existing.pending_draft as CompanionDraft | null)
      setInsights(existing.insights)
      setChatInsights(existing.chat_insights)
      setAiUsage(existing.ai_usage)
      setAiSettings(existing.ai_settings)
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded || !name) return

    writeDemoSession({
      version: DEMO_SESSION_VERSION,
      name,
      active_timer: activeTimer,
      blocks,
      categories,
      messages,
      block_threads: blockThreads,
      pending_draft: pendingDraft,
      insights,
      chat_insights: chatInsights,
      ai_usage: aiUsage,
      ai_settings: aiSettings,
      updated_at: new Date().toISOString(),
    })
  }, [activeTimer, aiSettings, aiUsage, blockThreads, blocks, categories, chatInsights, insights, loaded, messages, name, pendingDraft])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const categoryOptions = useMemo(() => {
    const custom = Array.from(new Set(blocks.map((block) => block.category).filter(Boolean)))
      .filter((slug): slug is string => !categories.some((item) => item.slug === slug))
      .map((slug) => ({
        id: slug,
        user_id: "demo",
        slug,
        name: slug.replace(/_/g, " "),
        color: defaultCategoryColor(slug),
        is_default: false,
        created_at: "",
        updated_at: "",
      }))

    return [...categories, ...custom]
  }, [blocks, categories])

  const dashboardBlocks = useMemo(
    () => blocks.filter((block) => block.ended_at).map(demoBlockToTimeBlock),
    [blocks],
  )
  const usingCustomAiEndpoint = Boolean(aiSettings.api_key.trim())

  const completedBlocks = useMemo(
    () =>
      [...blocks]
        .filter((block) => block.ended_at)
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()),
    [blocks],
  )
  const activeBlock =
    activeThread.kind === "time_block"
      ? blocks.find((block) => block.id === activeThread.blockId) ?? null
      : null
  const activeMessages =
    activeThread.kind === "time_block"
      ? (blockThreads[activeThread.blockId] ?? [])
      : messages

  const handleNameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setName(trimmed)
    setMessages((current) =>
      current.length > 0
        ? current
        : [
            makeMessage(
              "assistant",
              `hi ${trimmed}. start the timer, add a block, or tell me what happened in plain language.`,
            ),
          ],
    )
  }

  const appendThreadMessage = (message: DemoStoredMessage, thread = activeThread) => {
    if (thread.kind === "time_block") {
      setBlockThreads((current) => ({
        ...current,
        [thread.blockId]: [...(current[thread.blockId] ?? []), message],
      }))
      return
    }

    setMessages((current) => [...current, message])
  }

  const refreshInsight = useCallback(async (block: DemoStoredBlock) => {
    if (!block.notes?.trim()) {
      setInsights((current) => current.filter((insight) => insight.time_block_id !== block.id))
      return
    }

    if (!usingCustomAiEndpoint && !canSpendDemoTokens(aiUsage, DEMO_INSIGHT_MIN_TOKENS)) {
      setInsights((current) => upsertDemoInsight(current, block))
      return
    }

    const result = await generateDemoBlockInsight(demoBlockToTimeBlock(block), aiUsage, aiSettings)
    if (result.type === "generated") {
      setAiUsage((current) => addDemoTokenUsage(current, result.tokenCost))
      setInsights((current) => upsertDemoInsight(current, block, result.insight))
      return
    }

    setInsights((current) => upsertDemoInsight(current, block))
  }, [aiSettings, aiUsage, usingCustomAiEndpoint])

  const handleStart = () => {
    setError(null)
    if (activeTimer) return
    const startedAt = new Date().toISOString()
    setActiveTimer({ user_id: "demo", started_at: startedAt, created_at: startedAt })
    setNow(Date.now())
  }

  const handleStop = () => {
    setError(null)
    if (!activeTimer) {
      setError("no timer is running.")
      return
    }

    const nowIso = new Date().toISOString()
    const base = activeTimer.resumed_block
    const block: DemoStoredBlock = {
      id: base?.id ?? newId("demo-block"),
      user_id: "demo",
      started_at: base?.started_at ?? activeTimer.started_at,
      ended_at: nowIso,
      duration_seconds: demoDurationSeconds(base?.started_at ?? activeTimer.started_at, nowIso),
      category_id: base?.category_id ?? base?.category ?? null,
      task_name: base?.task_name ?? null,
      category: base?.category ?? null,
      hashtags: base?.hashtags ?? [],
      notes: base?.notes ?? null,
      mood: base?.mood ?? null,
      effort_level: base?.effort_level ?? null,
      satisfaction: base?.satisfaction ?? null,
      avoidance_marker: base?.avoidance_marker ?? false,
      hyperfocus_marker: base?.hyperfocus_marker ?? false,
      guilt_marker: base?.guilt_marker ?? false,
      novelty_marker: base?.novelty_marker ?? false,
      agent_metadata: base?.agent_metadata ?? {},
      created_at: base?.created_at ?? nowIso,
      updated_at: nowIso,
    }

    setActiveTimer(null)
    setBlocks((current) => [block, ...current.filter((item) => item.id !== block.id)])
    setEditor(createEditorState(block, !block.task_name))
  }

  const handleSave = () => {
    if (!editor) return

    setError(null)
    if (!editor.taskName.trim()) {
      setError("task name is required.")
      return
    }
    if (!editor.category.trim()) {
      setError("category is required.")
      return
    }

    const startedAt = new Date(editor.startedAt)
    const endedAt = new Date(editor.endedAt)

    if (
      Number.isNaN(startedAt.getTime()) ||
      Number.isNaN(endedAt.getTime()) ||
      endedAt.getTime() <= startedAt.getTime()
    ) {
      setError("end time must be after start time.")
      return
    }

    const category = slugifyCategoryName(editor.category)
    if (!category) {
      setError("category is invalid.")
      return
    }

    const nowIso = new Date().toISOString()
    const saved: DemoStoredBlock = {
      id: editor.block?.id ?? newId("demo-block"),
      user_id: "demo",
      started_at: fromDateTimeLocal(editor.startedAt),
      ended_at: fromDateTimeLocal(editor.endedAt),
      duration_seconds: demoDurationSeconds(fromDateTimeLocal(editor.startedAt), fromDateTimeLocal(editor.endedAt)),
      category_id: category,
      task_name: editor.taskName.trim(),
      category,
      hashtags: parseHashtags(editor.hashtags),
      notes: editor.notes.trim() || null,
      mood: editor.block?.mood ?? null,
      effort_level: editor.block?.effort_level ?? null,
      satisfaction: editor.block?.satisfaction ?? null,
      avoidance_marker: editor.block?.avoidance_marker ?? false,
      hyperfocus_marker: editor.block?.hyperfocus_marker ?? false,
      guilt_marker: editor.block?.guilt_marker ?? false,
      novelty_marker: editor.block?.novelty_marker ?? false,
      agent_metadata: editor.block?.agent_metadata ?? {},
      created_at: editor.block?.created_at ?? nowIso,
      updated_at: nowIso,
    }

    if (!categoryOptions.some((item) => item.slug === category)) {
      setCategories((current) => [
        ...current,
        {
          id: category,
          user_id: "demo",
          slug: category,
          name: category.replace(/_/g, " "),
          color: defaultCategoryColor(category),
          is_default: false,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ])
    }
    setBlocks((current) => [saved, ...current.filter((block) => block.id !== saved.id)])
    void refreshInsight(saved)
    setEditor(null)
  }

  const handleDelete = (block: DemoStoredBlock) => {
    setBlocks((current) => current.filter((item) => item.id !== block.id))
    setBlockThreads((current) => {
      const next = { ...current }
      delete next[block.id]
      return next
    })
    setInsights((current) => current.filter((insight) => insight.time_block_id !== block.id))
    if (activeThread.kind === "time_block" && activeThread.blockId === block.id) {
      setActiveThread({ kind: "general" })
    }
    if (editor?.block?.id === block.id) setEditor(null)
  }

  const handleOpenGeneralThread = async () => {
    setActiveThread({ kind: "general" })
  }

  const handleChatAboutBlock = (block: DemoStoredBlock) => {
    setActiveThread({ kind: "time_block", blockId: block.id })
    setBlockThreads((current) =>
      current[block.id]?.length
        ? current
        : {
            ...current,
            [block.id]: [blockThreadIntro(block)],
          },
    )
  }

  const handleResume = (block: DemoStoredBlock) => {
    if (activeTimer) return
    setEditor(null)
    if (activeThread.kind === "time_block" && activeThread.blockId === block.id) {
      setActiveThread({ kind: "general" })
    }
    setActiveTimer({ user_id: "demo", started_at: block.started_at, created_at: new Date().toISOString(), resumed_block: block })
    setBlocks((current) => current.filter((item) => item.id !== block.id))
    setNow(Date.now())
  }

  const handleClear = () => {
    clearDemoSession()
    setName("")
    setNameInput("")
    setActiveTimer(null)
    setBlocks([])
    setMessages([])
    setBlockThreads({})
    setPendingDraft(null)
    setInsights([])
    setChatInsights([])
    setAiUsage(createDemoAiUsage())
    setAiSettings(createDemoAiSettings())
    setCategories([...DEMO_DEFAULT_CATEGORIES])
    setActiveThread({ kind: "general" })
    setEditor(null)
    setError(null)
  }

  const handleChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || chatPending) return

      const lower = trimmed.toLowerCase()
      const threadAtSubmit = activeThread
      const userMessage = makeDemoMessage("user", trimmed, {
        related_time_block_id: threadAtSubmit.kind === "time_block" ? threadAtSubmit.blockId : null,
      })
      setChatPending(true)
      appendThreadMessage(userMessage, threadAtSubmit)
      setChatInsights((current) =>
        upsertDemoChatInsight(
          current,
          userMessage,
          threadAtSubmit.kind === "time_block" ? "time_block" : "general",
        ),
      )

      if (!usingCustomAiEndpoint && !canSpendDemoTokens(aiUsage, DEMO_COMPANION_MIN_TOKENS)) {
        appendThreadMessage(
          makeDemoMessage("assistant", "this demo session has used its companion budget. local tracking still works.", {
            message_type: "error",
            related_time_block_id: threadAtSubmit.kind === "time_block" ? threadAtSubmit.blockId : null,
          }),
          threadAtSubmit,
        )
        setChatPending(false)
        return
      }

      try {
        const result = await processDemoCompanionMessage({
          text: trimmed,
          session: {
            blocks: blocks.map(demoBlockToTimeBlock).slice(0, 60),
            active_timer: activeTimer ? { started_at: activeTimer.started_at } : null,
            messages: messages.slice(-12),
            block_threads: Object.fromEntries(
              Object.entries(blockThreads).map(([blockId, thread]) => [blockId, thread.slice(-12)]),
            ),
            pending_draft: pendingDraft,
          insights: insights.slice(0, 60),
          },
          thread:
            threadAtSubmit.kind === "time_block"
              ? { kind: "time_block", relatedBlockId: threadAtSubmit.blockId }
              : { kind: "general" },
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          aiUsage,
          aiSettings,
        })

        if (result.tokenCost > 0) {
          setAiUsage((current) => addDemoTokenUsage(current, result.tokenCost))
        }
        setPendingDraft(result.pendingDraft)

        if (result.operation?.type === "start_timer" && !activeTimer) {
          const startedAt = result.operation.started_at ?? new Date().toISOString()
          setActiveTimer({ user_id: "demo", started_at: startedAt, created_at: startedAt })
          setNow(Date.now())
        }

        if (result.operation?.type === "stop_timer" && activeTimer) {
          const nowIso = new Date().toISOString()
          const block = createBlockFromOperation({
            id: activeTimer.resumed_block?.id ?? newId("demo-block"),
            started_at: activeTimer.resumed_block?.started_at ?? activeTimer.started_at,
            ended_at: nowIso,
            task_name: result.operation.draft.task_name,
            category: result.operation.draft.category,
            hashtags: result.operation.draft.hashtags,
            notes: result.operation.draft.notes,
            base: activeTimer.resumed_block,
          })
          setActiveTimer(null)
          setBlocks((current) => [block, ...current.filter((item) => item.id !== block.id)])
          void refreshInsight(block)
          if (!block.task_name || !block.category) setEditor(createEditorState(block, true))
        }

        if (result.operation?.type === "save_block") {
          const nowIso = new Date().toISOString()
          const block: DemoStoredBlock = {
            ...result.operation.block,
            id: newId("demo-block"),
            user_id: "demo",
            duration_seconds: demoDurationSeconds(
              result.operation.block.started_at,
              result.operation.block.ended_at,
            ),
            hashtags: result.operation.block.hashtags ?? [],
            category_id: result.operation.block.category_id ?? result.operation.block.category,
            category: result.operation.block.category,
            task_name: result.operation.block.task_name,
            notes: result.operation.block.notes,
            mood: result.operation.block.mood,
            effort_level: result.operation.block.effort_level,
            satisfaction: result.operation.block.satisfaction,
            avoidance_marker: result.operation.block.avoidance_marker,
            hyperfocus_marker: result.operation.block.hyperfocus_marker,
            guilt_marker: result.operation.block.guilt_marker,
            novelty_marker: result.operation.block.novelty_marker,
            agent_metadata: result.operation.block.agent_metadata ?? {},
            created_at: nowIso,
            updated_at: nowIso,
          }
          setBlocks((current) => [block, ...current])
          void refreshInsight(block)
        }

        appendThreadMessage(
          makeDemoMessage("assistant", result.message, {
            message_type: result.messageType,
            related_time_block_id: threadAtSubmit.kind === "time_block" ? threadAtSubmit.blockId : null,
          }),
          threadAtSubmit,
        )
      } catch {
        let assistantText = "i'm having trouble reaching the companion. the local demo can still save this manually."
        if (
          threadAtSubmit.kind === "general" &&
          (lower.includes("worked") || lower.includes("log") || lower.includes("spent") || lower.includes("record")) &&
          (parseDurationMinutes(trimmed) || /\bfrom\b.+\b(to|-)\b/i.test(trimmed))
        ) {
          const block = createBlockFromChat(trimmed)
          setBlocks((current) => [block, ...current])
          void refreshInsight(block)
          assistantText = "saved locally. edit it if the nuance is off."
        } else if (threadAtSubmit.kind === "time_block") {
          const block = blocks.find((item) => item.id === threadAtSubmit.blockId)
          assistantText = block ? blockContextReply(block, trimmed) : "i can't find that demo block anymore."
        }
        appendThreadMessage(makeMessage("assistant", assistantText), threadAtSubmit)
      } finally {
        setChatPending(false)
      }
    },
    [activeThread, activeTimer, aiSettings, aiUsage, blockThreads, blocks, chatPending, insights, messages, pendingDraft, refreshInsight, usingCustomAiEndpoint],
  )

  if (!loaded) {
    return (
      <main className="alibi-page flex min-h-screen items-center justify-center px-6">
        <Loader2 className="h-5 w-5 animate-spin text-alibi-teal" />
      </main>
    )
  }

  if (!name) {
    return (
      <main className="alibi-page flex min-h-screen items-center justify-center px-6 py-12">
        <section className="alibi-card-pop w-full max-w-md p-7">
          <p className="alibi-label">demo session</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-alibi-blue">
            try alibi without logging in
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-alibi-teal">
            This demo stores data in your browser only. Type a name, then use timer, manual blocks,
            and chat like the authenticated app.
          </p>
          <form onSubmit={handleNameSubmit} className="mt-6 grid gap-3">
            <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
              your name
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                className="alibi-input h-11"
                placeholder="Mina"
                autoFocus
              />
            </label>
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="alibi-button-primary inline-flex h-11 items-center justify-center gap-2 text-sm disabled:opacity-55"
            >
              start demo
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </form>
          <div className="mt-5 flex justify-center">
            <Link href="/" className="text-sm font-semibold text-alibi-teal hover:text-alibi-pink">
              back to landing
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="alibi-page px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <nav className="alibi-pill flex flex-col items-center gap-3 px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-[15px] font-black tracking-tight text-alibi-blue">alibi demo</p>
            <p className="text-xs font-semibold text-alibi-teal">local session for {name}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setShowAiPanel((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-alibi-teal transition hover:bg-alibi-lavender/20 hover:text-alibi-blue"
            >
              <Settings className="h-3.5 w-3.5" />
              ai
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full px-3 py-2 text-xs font-bold text-alibi-teal transition hover:bg-alibi-pink/10 hover:text-alibi-pink"
            >
              clear demo
            </button>
            <Link
              href="/auth/sign-up?from=demo"
              className="alibi-button-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs"
            >
              create account and keep blocks
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
            </Link>
          </div>
        </nav>

        <section className="alibi-banner-info">
          Demo data is stored in localStorage on this device.{" "}
          {usingCustomAiEndpoint
            ? "Companion AI is using your custom endpoint."
            : "Companion AI is using the hosted demo configuration."}{" "}
          After sign-up, the real app can import completed demo blocks into your account.
        </section>

        {showAiPanel && (
          <DemoAiSettingsPanel
            settings={aiSettings}
            setSettings={setAiSettings}
            onClose={() => setShowAiPanel(false)}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView("tracker")}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-black transition",
              view === "tracker"
                ? "bg-alibi-blue text-white"
                : "bg-white text-alibi-teal hover:bg-alibi-lavender/20 hover:text-alibi-blue",
            )}
          >
            <Clock className="h-4 w-4" />
            tracker
          </button>
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-black transition",
              view === "dashboard"
                ? "bg-alibi-blue text-white"
                : "bg-white text-alibi-teal hover:bg-alibi-lavender/20 hover:text-alibi-blue",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            dashboard
          </button>
        </div>

        {view === "dashboard" ? (
          <DashboardOverview
            blocks={dashboardBlocks}
            insights={insights}
            categories={categories}
            emptyHref="/demo"
            emptyAction="back to tracker"
            chatInsights={chatInsights}
          />
        ) : (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="flex flex-col gap-5">
            <section className="alibi-card-pop relative overflow-hidden p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                    active timer
                  </p>
                  <h1 className="mt-2 text-4xl font-black tracking-normal text-alibi-blue sm:text-5xl">
                    {formatElapsed(elapsed)}
                  </h1>
                </div>
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl border",
                    activeTimer
                      ? "border-alibi-pink/25 bg-alibi-pink/15 text-alibi-pink"
                      : "border-alibi-teal/25 bg-alibi-teal/15 text-alibi-teal",
                  )}
                >
                  <Clock className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                {activeTimer ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={pending}
                    className="alibi-button-stop inline-flex h-11 min-w-32 items-center justify-center gap-2 px-4 text-sm font-black"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                    stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={pending}
                    className="alibi-button-primary inline-flex h-11 min-w-32 items-center justify-center gap-2 text-sm"
                  >
                    <Play className="h-4 w-4" />
                    start
                  </button>
                )}
              </div>

              <p className="relative mt-4 text-sm font-medium leading-6 text-alibi-teal">
                {activeTimer
                  ? `running since ${formatTime(activeTimer.started_at)}`
                  : "start when you begin, stop when the block is real."}
              </p>
            </section>

            {error && (
              <div
                role="alert"
                className="alibi-banner-error"
              >
                {error}
              </div>
            )}

            {editor && (
              <BlockEditor
                editor={editor}
                categories={categoryOptions}
                setEditor={setEditor}
                onSave={handleSave}
                onDelete={editor.block ? () => handleDelete(editor.block!) : undefined}
                pending={pending}
              />
            )}

            <CompanionChatPanel
              threadKind={activeThread.kind}
              threadTitle={activeBlock?.task_name ?? null}
              messages={activeMessages}
              pending={chatPending}
              onOpenGeneral={handleOpenGeneralThread}
              onSubmit={handleChat}
            />
          </div>

          <DailyBlocks
            date={today}
            blocks={completedBlocks}
            categories={categoryOptions}
            canResume={activeTimer === null}
            onAdd={() => setEditor(createManualEditorState())}
            onEdit={(block) => setEditor(createEditorState(block))}
            onDelete={handleDelete}
            onResume={handleResume}
            onChatAbout={handleChatAboutBlock}
            pending={pending}
          />
        </section>
        )}
      </div>
    </main>
  )
}

function CompanionChatPanel({
  threadKind,
  threadTitle,
  messages,
  pending,
  onOpenGeneral,
  onSubmit,
}: {
  threadKind: DemoActiveThread["kind"]
  threadTitle: string | null
  messages: DemoStoredMessage[]
  pending: boolean
  onOpenGeneral: () => Promise<void>
  onSubmit: (text: string) => Promise<void>
}) {
  const [value, setValue] = useState("")
  const latestMessageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    })
  }, [messages.length, pending])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || pending) return
    setValue("")
    void onSubmit(trimmed)
  }

  return (
    <section className="alibi-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            alibi
          </p>
          <h2 className="mt-1 text-xl font-black text-alibi-blue">
            {threadKind === "time_block"
              ? threadTitle
                ? `about ${threadTitle}`
                : "about this block"
              : "companion chat"}
          </h2>
        </div>
        <div className="flex items-center">
          {threadKind === "time_block" ? (
            <button
              type="button"
              onClick={() => void onOpenGeneral()}
              disabled={pending}
              className="alibi-button-primary inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black"
            >
              <MessageCircle className="h-4 w-4" />
              main chat
            </button>
          ) : (
            <div className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-alibi-pink/15 px-3 text-xs font-black text-alibi-pink">
              <MessageCircle className="h-4 w-4" />
              main chat
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex max-h-80 min-h-44 flex-col gap-3 overflow-y-auto alibi-inset p-3">
        {messages.length === 0 ? (
          <p className="mt-auto text-sm font-semibold leading-6 text-alibi-teal">
            nothing here yet.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "alibi-chat-bubble",
                message.role === "user"
                  ? "ml-auto bg-alibi-blue text-white"
                  : "mr-auto bg-white text-alibi-ink shadow-[0_1px_3px_rgba(50,83,199,0.06)]",
              )}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              <time
                dateTime={message.created_at}
                className={cn(
                  "mt-1 block font-mono text-[10px] font-black uppercase leading-4",
                  message.role === "user" ? "text-white/70" : "text-alibi-teal/70",
                )}
              >
                {formatChatTimestamp(message.created_at)}
              </time>
            </div>
          ))
        )}
        {pending && (
          <div className="mr-auto inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-alibi-teal shadow-[0_1px_3px_rgba(50,83,199,0.06)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            thinking.
          </div>
        )}
        <div ref={latestMessageRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-2">
        <label className="sr-only" htmlFor="demo-companion-message">
          message alibi
        </label>
        <textarea
          id="demo-companion-message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          rows={2}
          disabled={pending}
          placeholder="worked on the proposal for 45 minutes..."
          className="alibi-input min-h-11 flex-1 resize-none py-2 leading-6 placeholder:text-alibi-teal/60 disabled:opacity-55"
        />
        <button
          type="submit"
          disabled={!value.trim() || pending}
          aria-label="send message"
          title="send"
          className="alibi-button-teal inline-flex h-11 w-11 items-center justify-center"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </section>
  )
}

function DemoAiSettingsPanel({
  settings,
  setSettings,
  onClose,
}: {
  settings: DemoAiSettings
  setSettings: (settings: DemoAiSettings) => void
  onClose: () => void
}) {
  return (
    <section className="alibi-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            demo ai
          </p>
          <h2 className="mt-1 text-xl font-black text-alibi-blue">
            custom endpoint settings
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="close ai settings"
          title="close"
          className="flex h-9 w-9 items-center justify-center rounded-2xl text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-pink/15 hover:text-alibi-pink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.2fr)]">
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          provider
          <select
            value={settings.provider}
            onChange={(event) =>
              setSettings({
                ...settings,
                provider: event.target.value === "anthropic" ? "anthropic" : "openai_compatible",
              })
            }
            className="alibi-input h-11"
          >
            <option value="openai_compatible">openai-compatible</option>
            <option value="anthropic">anthropic messages api</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          base url
          <input
            value={settings.base_url}
            onChange={(event) => setSettings({ ...settings, base_url: event.target.value })}
            className="alibi-input h-11"
            placeholder={
              settings.provider === "anthropic"
                ? "https://api.anthropic.com/v1"
                : "https://api.openai.com/v1"
            }
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          api key
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-alibi-teal" />
            <input
              type="password"
              value={settings.api_key}
              onChange={(event) => setSettings({ ...settings, api_key: event.target.value })}
              className="alibi-input h-11 pl-9"
              placeholder={settings.provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              autoComplete="off"
            />
          </div>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          companion model
          <input
            value={settings.companion_model}
            onChange={(event) => setSettings({ ...settings, companion_model: event.target.value })}
            className="alibi-input h-11"
            placeholder={settings.provider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o-mini"}
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          routing model
          <input
            value={settings.fast_model}
            onChange={(event) => setSettings({ ...settings, fast_model: event.target.value })}
            className="alibi-input h-11"
            placeholder={settings.provider === "anthropic" ? "claude-3-5-haiku-latest" : "gpt-4o-mini"}
          />
        </label>
      </div>

      <p className="mt-3 text-xs font-semibold leading-5 text-alibi-teal">
        leave fields blank to use the hosted demo configuration. openai-compatible expects chat
        completions semantics through the AI SDK. anthropic uses POST /messages under the base url.
        custom settings are stored only in this browser's local demo session and sent to the server
        action for demo AI calls.
      </p>
    </section>
  )
}

function CategoryPicker({
  value,
  categories,
  onChange,
}: {
  value: string
  categories: TimeBlockCategoryRecord[]
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newValue, setNewValue] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const newInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setAddingNew(false)
        setNewValue("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    if (addingNew) newInputRef.current?.focus()
  }, [addingNew])

  const selected = categories.find(
    (c) => c.slug === value || c.name.toLowerCase() === value.toLowerCase(),
  )
  const displayName = selected?.name ?? (value || null)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setAddingNew(false)
          setNewValue("")
        }}
        className="alibi-input flex h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span
          className={cn(
            "flex items-center gap-2 text-sm font-semibold",
            displayName ? "text-alibi-ink" : "text-alibi-teal/50",
          )}
        >
          {selected && (
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          {displayName ?? "choose or add a category"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-alibi-teal transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="alibi-card absolute z-50 mt-1 w-full overflow-hidden p-1">
          {!addingNew ? (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold text-alibi-teal transition hover:bg-alibi-lavender/20"
            >
              <Plus className="h-3.5 w-3.5" />
              add new
            </button>
          ) : (
            <div className="px-1 pb-1 pt-0.5">
              <input
                ref={newInputRef}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newValue.trim()) {
                    onChange(newValue.trim())
                    setOpen(false)
                    setAddingNew(false)
                    setNewValue("")
                  } else if (e.key === "Escape") {
                    setAddingNew(false)
                    setNewValue("")
                  }
                }}
                className="alibi-input h-9 w-full text-sm"
                placeholder="new category name, press enter"
              />
            </div>
          )}

          <div className="my-1 border-t border-alibi-blue/10" />

          <div className="relative -mx-1 -mb-1">
            <div className="max-h-48 overflow-y-auto px-1 pb-6">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onChange(cat.slug)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold text-alibi-ink transition hover:bg-alibi-lavender/20",
                    value === cat.slug && "bg-alibi-blue/10 text-alibi-blue",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.name}
                </button>
              ))}
            </div>
            {categories.length > 4 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BlockEditor({
  editor,
  categories,
  setEditor,
  onSave,
  onDelete,
  pending,
}: {
  editor: EditorState
  categories: TimeBlockCategoryRecord[]
  setEditor: (editor: EditorState | null) => void
  onSave: () => void
  onDelete?: () => void
  pending: boolean
}) {
  return (
    <section className="alibi-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            block editor
          </p>
          <h2 className="mt-1 text-xl font-black text-alibi-blue">
            {editor.isNewlyStopped ? "name this block" : editor.isManual ? "add block" : "edit block"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setEditor(null)}
          aria-label="close editor"
          title="close"
          className="flex h-9 w-9 items-center justify-center rounded-2xl text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-pink/15 hover:text-alibi-pink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          task name
          <input
            value={editor.taskName}
            onChange={(event) => setEditor({ ...editor, taskName: event.target.value })}
            className="alibi-input h-11"
            placeholder="what happened?"
          />
        </label>

        <div className="grid gap-1.5">
          <span className="text-sm font-bold text-alibi-blue">category</span>
          <CategoryPicker
            value={editor.category}
            categories={categories}
            onChange={(val) => setEditor({ ...editor, category: val })}
          />
          <span className="text-xs font-semibold leading-5 text-alibi-teal">
            type a new name to create a demo category.
          </span>
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
            start
            <input
              type="datetime-local"
              value={editor.startedAt}
              onChange={(event) => setEditor({ ...editor, startedAt: event.target.value })}
              className="alibi-input h-11 min-w-0"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
            end
            <input
              type="datetime-local"
              value={editor.endedAt}
              onChange={(event) => setEditor({ ...editor, endedAt: event.target.value })}
              className="alibi-input h-11 min-w-0"
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          hashtags
          <input
            value={editor.hashtags}
            onChange={(event) => setEditor({ ...editor, hashtags: event.target.value })}
            className="alibi-input h-11"
            placeholder="client, writing, reset"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          notes - what really happened
          <textarea
            value={editor.notes}
            onChange={(event) => setEditor({ ...editor, notes: event.target.value })}
            className="alibi-input min-h-24 resize-y py-2"
            placeholder="what you intended, what actually happened, what shifted, how it felt"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold text-alibi-pink transition hover:-translate-y-0.5 hover:bg-alibi-pink/10 disabled:translate-y-0 disabled:opacity-55"
          >
            <Trash2 className="h-4 w-4" />
            delete
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditor(null)}
            disabled={pending}
            className="h-10 rounded-2xl px-4 text-sm font-bold text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-lavender/15 disabled:translate-y-0 disabled:opacity-55"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="alibi-button-teal inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
          >
            save
          </button>
        </div>
      </div>
    </section>
  )
}

function DailyBlocks({
  date,
  blocks,
  categories,
  canResume,
  onAdd,
  onEdit,
  onDelete,
  onResume,
  onChatAbout,
  pending,
}: {
  date: Date
  blocks: DemoStoredBlock[]
  categories: TimeBlockCategoryRecord[]
  canResume: boolean
  onAdd: () => void
  onEdit: (block: DemoStoredBlock) => void
  onDelete: (block: DemoStoredBlock) => void
  onResume: (block: DemoStoredBlock) => void
  onChatAbout: (block: DemoStoredBlock) => void
  pending: boolean
}) {
  return (
    <section className="alibi-card min-h-130 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            today
          </p>
          <h2 className="mt-1 text-2xl font-black text-alibi-blue">{formatDateHeading(date)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={pending}
            aria-label="add completed block"
            title="add block"
            className="alibi-button-teal inline-flex h-11 w-11 items-center justify-center"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-alibi-lavender/25 text-alibi-blue">
            <CalendarDays className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="mt-5">
        {blocks.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-alibi-lavender/40 bg-alibi-lavender/10 px-6 text-center text-sm font-semibold leading-6 text-alibi-teal">
            no completed blocks for today yet.
          </div>
        ) : (
          <ol className="grid gap-3">
            {blocks.map((block, index) => {
              const category = categoryMeta(block.category, categories)
              const isLatestBlock = index === blocks.length - 1

              return (
                <li
                  key={block.id}
                  className="alibi-block-item grid gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]"
                >
                  <div className="font-mono text-sm font-semibold leading-6 text-alibi-teal">
                    <div>{formatTime(block.started_at)}</div>
                    <div>{formatTime(block.ended_at)}</div>
                    <div className="mt-1 font-sans text-sm font-black text-alibi-blue">
                      {formatDuration(block.started_at, block.ended_at)}
                    </div>
                  </div>

                  <div className="min-w-0">
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
                    {block.hashtags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {block.hashtags.map((hashtag) => (
                          <span key={hashtag} className="alibi-chip">
                            #{hashtag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-1">
                    {isLatestBlock && canResume && (
                      <button
                        type="button"
                        onClick={() => onResume(block)}
                        disabled={pending}
                        aria-label="resume latest block"
                        title="resume"
                        className="alibi-button-teal inline-flex h-9 items-center justify-center gap-1.5 px-3 text-xs font-black"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        resume
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onChatAbout(block)}
                      aria-label="chat about this block"
                      title="chat about this"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-teal hover:text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(block)}
                      aria-label="edit block"
                      title="edit"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-blue hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(block)}
                      disabled={pending}
                      aria-label="delete block"
                      title="delete"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-pink transition hover:-translate-y-0.5 hover:bg-alibi-pink hover:text-white disabled:translate-y-0 disabled:opacity-55"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
