import {
  DEMO_DEFAULT_CATEGORIES,
  DEMO_SESSION_VERSION,
  createDemoAiSettings,
  makeDemoMessage,
  upsertDemoChatInsight,
  upsertDemoInsight,
  type DemoStoredBlock,
  type DemoStoredMessage,
  type DemoStoredSession,
} from "@/lib/demo-storage"
import { createDemoAiUsage } from "@/lib/demo-token-budget"
import { defaultCategoryColor } from "@/lib/time-block-display"
import type {
  CompanionMessageInsight,
  EffortLevel,
  Mood,
  Satisfaction,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
} from "@/lib/types"

const SEEDED_SOURCE = {
  source: "demo_seed_icp",
  demo_seed: true,
}

const CUSTOM_CATEGORIES = [
  "part_time_job",
  "client_work",
  "art_practice",
  "content",
] as const

type SeedCategory = typeof CUSTOM_CATEGORIES[number] | "admin" | "care" | "creative" | "deep_work" | "errands" | "rest" | "social"

interface SeedBlockTemplate {
  dayOffset: number
  start: string
  minutes: number
  category: SeedCategory
  task: string
  hashtags: string[]
  notes: string
  mood: Mood
  effort: EffortLevel
  satisfaction: Satisfaction
  avoidance?: boolean
  hyperfocus?: boolean
  guilt?: boolean
  novelty?: boolean
}

function atDate(base: Date, dayOffset: number, time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  const date = new Date(base)
  date.setDate(base.getDate() + dayOffset)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function blockFromTemplate(base: Date, index: number, template: SeedBlockTemplate): DemoStoredBlock {
  const startedAt = atDate(base, template.dayOffset, template.start)
  const endedAt = new Date(startedAt.getTime() + template.minutes * 60_000)
  const now = new Date().toISOString()

  return {
    id: `demo-seed-block-${String(index + 1).padStart(3, "0")}`,
    user_id: "demo",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: template.minutes * 60,
    category_id: template.category,
    task_name: template.task,
    category: template.category,
    hashtags: template.hashtags,
    notes: template.notes,
    mood: template.mood,
    effort_level: template.effort,
    satisfaction: template.satisfaction,
    avoidance_marker: template.avoidance ?? false,
    hyperfocus_marker: template.hyperfocus ?? false,
    guilt_marker: template.guilt ?? false,
    novelty_marker: template.novelty ?? false,
    agent_metadata: SEEDED_SOURCE,
    created_at: startedAt.toISOString(),
    updated_at: now,
  }
}

function seededMessage(role: DemoStoredMessage["role"], text: string, createdAt: string): DemoStoredMessage {
  return {
    ...makeDemoMessage(role, text, { metadata: SEEDED_SOURCE }),
    id: `demo-seed-${role}-${createdAt.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: createdAt,
  }
}

function categoryRecord(slug: string): TimeBlockCategoryRecord {
  return {
    id: slug,
    user_id: "demo",
    slug,
    name: slug.replace(/_/g, " "),
    color: defaultCategoryColor(slug),
    is_default: false,
    created_at: "",
    updated_at: "",
  }
}

function templates(): SeedBlockTemplate[] {
  const items: SeedBlockTemplate[] = []
  for (let offset = -29; offset <= 0; offset += 1) {
    const weekday = atDate(new Date(), offset, "12:00").getDay()
    const isPartTimeDay = weekday === 1 || weekday === 3 || weekday === 5
    const isWeekend = weekday === 0 || weekday === 6

    if (isPartTimeDay) {
      items.push({
        dayOffset: offset,
        start: "09:30",
        minutes: 270,
        category: "part_time_job",
        task: "studio desk shift",
        hashtags: ["job", "income", "routine"],
        notes: "Part-time shift. Useful external structure, but I arrived with five browser tabs in my head. Got the necessary admin queue done after a noisy first hour.",
        mood: "neutral",
        effort: "medium",
        satisfaction: "mixed",
      })
      items.push({
        dayOffset: offset,
        start: "15:15",
        minutes: 45,
        category: "rest",
        task: "post-shift decompression",
        hashtags: ["reset", "transition"],
        notes: "Sat on the sofa instead of pretending I could jump straight into client work. The buffer made the evening less brittle.",
        mood: "flat",
        effort: "easy",
        satisfaction: "satisfied",
      })
    }

    if (weekday === 2 || weekday === 4) {
      items.push({
        dayOffset: offset,
        start: weekday === 2 ? "10:45" : "11:30",
        minutes: weekday === 2 ? 95 : 75,
        category: "client_work",
        task: weekday === 2 ? "retainer edits for Iris" : "brand deck revisions",
        hashtags: ["client", weekday === 2 ? "iris" : "deck"],
        notes: weekday === 2
          ? "Client edits took longer than expected because I kept polishing the first section. Hyperfocused once the brief felt visual instead of admin."
          : "Moved the deck from messy to presentable. Started late after avoiding the email thread, then felt better once I made a tiny checklist.",
        mood: weekday === 2 ? "proud" : "anxious",
        effort: weekday === 2 ? "hard" : "medium",
        satisfaction: "satisfied",
        avoidance: weekday === 4,
        hyperfocus: weekday === 2,
      })
      items.push({
        dayOffset: offset,
        start: "16:40",
        minutes: 55,
        category: "content",
        task: "TikTok edit and captions",
        hashtags: ["tiktok", "content", "visibility"],
        notes: "Cut the talking-head clip down to something punchier. Captions made it easier to understand the point, but I spiralled on whether it was too much.",
        mood: "anxious",
        effort: "medium",
        satisfaction: "mixed",
        novelty: offset % 4 === 0,
      })
    }

    if (!isPartTimeDay && !isWeekend) {
      items.push({
        dayOffset: offset,
        start: "20:15",
        minutes: 80,
        category: "art_practice",
        task: "painting study",
        hashtags: ["art", "practice", "series"],
        notes: "Personal work after paid work. Messy start, then the color test opened a new direction for the series. This felt like mine again.",
        mood: "joyful",
        effort: "medium",
        satisfaction: "satisfied",
        novelty: true,
      })
    }

    if (weekday === 0 || weekday === 6) {
      items.push({
        dayOffset: offset,
        start: "12:10",
        minutes: weekday === 6 ? 120 : 70,
        category: weekday === 6 ? "creative" : "care",
        task: weekday === 6 ? "content batch filming" : "weekly reset and laundry",
        hashtags: weekday === 6 ? ["tiktok", "batch", "studio"] : ["home", "reset"],
        notes: weekday === 6
          ? "Filmed three chaotic but usable clips. Energy was high and the room became a disaster zone, but batching kept me from overthinking each take."
          : "Reset day. Laundry, food, inbox scan. I felt guilty that it was not art, but the week works better when this is not invisible.",
        mood: weekday === 6 ? "joyful" : "guilty",
        effort: weekday === 6 ? "hard" : "medium",
        satisfaction: "mixed",
        guilt: weekday === 0,
        hyperfocus: weekday === 6,
      })
    }

    if (offset % 5 === 0) {
      items.push({
        dayOffset: offset,
        start: "18:05",
        minutes: 35,
        category: "admin",
        task: "invoices and client replies",
        hashtags: ["admin", "money", "email"],
        notes: "Avoided invoices until they became louder than the actual work. Once I opened the spreadsheet it was only thirty minutes. Classic.",
        mood: "guilty",
        effort: "grind",
        satisfaction: "mixed",
        avoidance: true,
        guilt: true,
      })
    }
  }

  return items
}

export function createSeededDemoSession(name: string): DemoStoredSession {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const blocks = templates()
    .map((template, index) => blockFromTemplate(today, index, template))
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
  const firstMessageDate = atDate(today, -26, "21:30").toISOString()
  const messages = [
    seededMessage(
      "assistant",
      `hi ${name}. i loaded a messy creative month so the demo has something to reflect back. add your own blocks if you want to import them later.`,
      atDate(today, -29, "08:45").toISOString(),
    ),
    seededMessage(
      "user",
      "i keep losing the handoff between job days and my own art. show me what actually happens there.",
      firstMessageDate,
    ),
    seededMessage(
      "assistant",
      "the seeded record suggests the shift itself gives structure, but the transition afterward needs a decompression block before client or art work becomes realistic.",
      atDate(today, -26, "21:31").toISOString(),
    ),
    seededMessage(
      "user",
      "notice when admin turns into guilt instead of just being a task.",
      atDate(today, -13, "18:45").toISOString(),
    ),
  ]
  const insights = blocks.reduce<TimeBlockInsight[]>(
    (current, block) => upsertDemoInsight(current, block),
    [],
  )
  const chatInsights = messages.reduce<CompanionMessageInsight[]>(
    (current, message) => upsertDemoChatInsight(current, message, "general"),
    [],
  )

  return {
    version: DEMO_SESSION_VERSION,
    name,
    active_timer: null,
    blocks,
    categories: [...DEMO_DEFAULT_CATEGORIES, ...CUSTOM_CATEGORIES.map(categoryRecord)],
    messages,
    block_threads: {},
    pending_draft: null,
    insights,
    chat_insights: chatInsights,
    custom_dashboard: null,
    ai_usage: createDemoAiUsage(),
    ai_settings: createDemoAiSettings(),
    updated_at: new Date().toISOString(),
  }
}

export function isSeededDemoBlock(block: Pick<DemoStoredBlock, "agent_metadata">) {
  return block.agent_metadata?.demo_seed === true
}

export function userAuthoredDemoMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata?.demo_seed) return metadata ?? {}
  const { demo_seed: _demoSeed, source: _source, ...rest } = metadata
  return rest
}
