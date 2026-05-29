import {
  DEMO_DEFAULT_CATEGORIES,
  DEMO_SESSION_VERSION,
  createDemoAiSettings,
  demoChatInsightForMessage,
  demoDurationSeconds,
  makeDemoMessage,
  upsertDemoInsight,
  type DemoStoredBlock,
  type DemoStoredMessage,
  type DemoStoredSession,
} from "@/lib/demo-storage"
import { createDemoAiUsage } from "@/lib/demo-token-budget"
import { defaultCategoryColor } from "@/lib/time-block-display"
import type {
  EffortLevel,
  Mood,
  Satisfaction,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
} from "@/lib/types"

export const DEMO_SEED_SOURCE = "icp_rolling_30_day_v1"

type SeedBlockTemplate = {
  startHour: number
  startMinute?: number
  durationMinutes: number
  category: string
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

const CUSTOM_SEED_CATEGORIES = [
  "part_time_job",
  "client_work",
  "art_practice",
  "content",
].map((slug) => ({
  id: slug,
  user_id: "demo",
  slug,
  name: slug.replace(/_/g, " "),
  color: defaultCategoryColor(slug),
  is_default: false,
  created_at: "",
  updated_at: "",
})) satisfies TimeBlockCategoryRecord[]

export function isDemoSeedBlock(block: { agent_metadata?: Record<string, unknown> }) {
  return block.agent_metadata?.demo_seed === true
}

export function stripDemoSeedMetadata(metadata?: Record<string, unknown>) {
  if (!metadata?.demo_seed) return metadata ?? {}

  const { demo_seed: _demoSeed, seed_source: _seedSource, source, ...rest } = metadata
  if (source && source !== "demo_seed") {
    return { ...rest, source }
  }
  return rest
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

function localTime(day: Date, hour: number, minute = 0) {
  const value = new Date(day)
  value.setHours(hour, minute, 0, 0)
  return value
}

function seedBlock(day: Date, index: number, template: SeedBlockTemplate): DemoStoredBlock {
  const startedAt = localTime(day, template.startHour, template.startMinute ?? 0)
  const endedAt = addMinutes(startedAt, template.durationMinutes)
  const now = addMinutes(endedAt, 6).toISOString()

  return {
    id: `demo-seed-${localDateKey(day)}-${index}`,
    user_id: "demo",
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: demoDurationSeconds(startedAt.toISOString(), endedAt.toISOString()),
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
    agent_metadata: {
      demo_seed: true,
      seed_source: DEMO_SEED_SOURCE,
      source: "demo_seed",
    },
    created_at: now,
    updated_at: now,
  }
}

function templatesForDay(day: Date, offsetFromToday: number, anchorNow: Date): SeedBlockTemplate[] {
  if (offsetFromToday === 0) {
    const end = new Date(anchorNow.getTime() - 20 * 60_000)
    if (localDateKey(end) !== localDateKey(day)) {
      return []
    }
    const start = new Date(end.getTime() - 75 * 60_000)
    if (localDateKey(start) !== localDateKey(day)) {
      return []
    }
    const startHour = start.getHours()
    const startMinute = start.getMinutes()

    return [
      {
        startHour,
        startMinute,
        durationMinutes: 75,
        category: "content",
        task: "rough cut captions for TikTok draft",
        hashtags: ["tiktok", "content", "morning"],
        notes:
          "Started with low confidence, then the caption wording finally clicked. Stopped before polishing because I could feel the hyperfocus tunnel starting.",
        mood: "neutral",
        effort: "medium",
        satisfaction: "mixed",
        hyperfocus: true,
      },
    ]
  }

  const weekday = day.getDay()
  const templates: SeedBlockTemplate[] = []

  if ([2, 3, 5].includes(weekday)) {
    templates.push({
      startHour: 9,
      durationMinutes: 270,
      category: "part_time_job",
      task: "studio assistant shift",
      hashtags: ["studio", "part_time", "routine"],
      notes:
        "External structure helped. The commute transition was bumpy, but once I was there the checklist carried me and reduced decision fatigue.",
      mood: "neutral",
      effort: "medium",
      satisfaction: "satisfied",
    })
  }

  if ([1, 4].includes(weekday)) {
    templates.push({
      startHour: 10,
      startMinute: weekday === 1 ? 30 : 0,
      durationMinutes: weekday === 1 ? 150 : 120,
      category: "client_work",
      task: weekday === 1 ? "client mural proposal revision" : "brand kit feedback pass",
      hashtags: weekday === 1 ? ["client", "mural", "proposal"] : ["client", "brand", "feedback"],
      notes:
        weekday === 1
          ? "Avoided opening the feedback for an hour, then did one energetic pass. The second half was clearer after I stopped trying to make it perfect."
          : "Lots of context switching between email, files, and references. Felt guilty about the delay, but the actual work was smaller than the dread.",
      mood: weekday === 1 ? "anxious" : "guilty",
      effort: "hard",
      satisfaction: "mixed",
      avoidance: true,
      guilt: true,
    })
  }

  if ([0, 1, 4, 6].includes(weekday)) {
    templates.push({
      startHour: weekday === 6 ? 13 : 15,
      startMinute: weekday === 0 ? 30 : 0,
      durationMinutes: weekday === 6 ? 190 : 95,
      category: "art_practice",
      task: weekday === 6 ? "large canvas color study" : "sketchbook shape studies",
      hashtags: ["art", "practice", weekday === 6 ? "canvas" : "sketchbook"],
      notes:
        weekday === 6
          ? "Lost track of time in a good way. Messy table, strong color decisions, and a real satisfaction hit when the final layer stopped feeling precious."
          : "Told myself it only had to be fifteen minutes. Novelty from the new brush pen made starting easier and the practice stretched naturally.",
      mood: weekday === 6 ? "joyful" : "proud",
      effort: weekday === 6 ? "hard" : "easy",
      satisfaction: "satisfied",
      hyperfocus: weekday === 6,
      novelty: true,
    })
  }

  if ([1, 3, 6].includes(weekday)) {
    templates.push({
      startHour: weekday === 3 ? 18 : 17,
      startMinute: 30,
      durationMinutes: weekday === 6 ? 80 : 60,
      category: "content",
      task: weekday === 3 ? "film process clips" : "edit and schedule TikTok",
      hashtags: ["tiktok", "content", "art"],
      notes:
        "The filming setup created friction, but once the phone was mounted I moved quickly. Posting still brought a little vulnerability hangover.",
      mood: "anxious",
      effort: "medium",
      satisfaction: "mixed",
      avoidance: weekday === 3,
    })
  }

  if ([0, 4].includes(weekday)) {
    templates.push({
      startHour: 11,
      durationMinutes: 45,
      category: "admin",
      task: weekday === 0 ? "weekly money check" : "invoice and email sweep",
      hashtags: ["admin", weekday === 0 ? "money" : "invoice"],
      notes:
        "Put it off until the discomfort was louder than the task. Used a timer and stopped after the useful pass instead of opening five new loops.",
      mood: "guilty",
      effort: "grind",
      satisfaction: "mixed",
      avoidance: true,
      guilt: true,
    })
  }

  if ([2, 5].includes(weekday)) {
    templates.push({
      startHour: 16,
      durationMinutes: 50,
      category: "errands",
      task: weekday === 2 ? "post office and supply pickup" : "groceries plus pharmacy",
      hashtags: ["errands", "outside"],
      notes:
        "Bundled the outside tasks after work so I did not have to restart from home. Tired but relieved that future-me has the supplies.",
      mood: "flat",
      effort: "medium",
      satisfaction: "satisfied",
    })
  }

  if ([0, 3, 6].includes(weekday)) {
    templates.push({
      startHour: weekday === 0 ? 19 : 20,
      durationMinutes: weekday === 6 ? 120 : 75,
      category: weekday === 3 ? "care" : "rest",
      task: weekday === 3 ? "laundry reset and dinner" : "recovery walk and low-stim evening",
      hashtags: weekday === 3 ? ["care", "home"] : ["rest", "recovery"],
      notes:
        "This looked unproductive on paper, but it lowered the noise. The transition into rest was awkward and then my brain finally unclenched.",
      mood: "neutral",
      effort: "easy",
      satisfaction: "satisfied",
    })
  }

  return templates
}

function messageAt(
  text: string,
  createdAt: Date,
  role: DemoStoredMessage["role"] = "assistant",
  relatedTimeBlockId: string | null = null,
) {
  return {
    ...makeDemoMessage(role, text, {
      related_time_block_id: relatedTimeBlockId,
      metadata: { seed_source: DEMO_SEED_SOURCE },
    }),
    id: `demo-seed-${role}-${createdAt.getTime()}`,
    created_at: createdAt.toISOString(),
  }
}

export function createSeededDemoSession(name: string, now = new Date()): DemoStoredSession {
  const blocks: DemoStoredBlock[] = []

  for (let offset = -29; offset <= 0; offset += 1) {
    const day = new Date(now)
    day.setDate(now.getDate() + offset)
    day.setHours(0, 0, 0, 0)

    templatesForDay(day, offset, now).forEach((template, index) => {
      blocks.push(seedBlock(day, index + 1, template))
    })
  }

  const sortedBlocks = blocks.sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  )
  const recentClientBlock = sortedBlocks.find((block) => block.category === "client_work")
  const recentArtBlock = sortedBlocks.find((block) => block.category === "art_practice")
  const recentAdminBlock = sortedBlocks.find((block) => block.category === "admin")
  const messages = [
    messageAt(
      `hi ${name}. i loaded a seeded month so the dashboard and calendar already have texture. add or edit anything real; seeded blocks stay out of account import.`,
      addMinutes(now, -28 * 60),
    ),
    messageAt(
      "I keep meaning to do invoices before client work, but I avoid the admin tab and then feel behind even on days I did a lot.",
      addMinutes(now, -26 * 60),
      "user",
    ),
    messageAt(
      "The clearest pattern so far: outside structure helps on studio days, while admin needs a smaller doorway and a timer.",
      addMinutes(now, -22 * 60),
    ),
    messageAt(
      "The TikTok edits are useful drift: I start by procrastinating on captions, then accidentally make a solid process clip.",
      addMinutes(now, -9 * 60),
      "user",
    ),
    messageAt(
      "Yesterday had the best creative payoff after a low-pressure start. The note says novelty helped more than discipline.",
      addMinutes(now, -4 * 60),
    ),
  ]

  const blockThreads: Record<string, DemoStoredMessage[]> = {}

  if (recentClientBlock) {
    blockThreads[recentClientBlock.id] = [
      messageAt(
        "Can you help me see why this client block felt so heavy when it was only a couple of hours?",
        addMinutes(new Date(recentClientBlock.updated_at), 2),
        "user",
        recentClientBlock.id,
      ),
      messageAt(
        "This client block has both avoidance and relief signals. The useful detail is that the dread was bigger than the work.",
        addMinutes(new Date(recentClientBlock.updated_at), 4),
        "assistant",
        recentClientBlock.id,
      ),
    ]
  }

  if (recentArtBlock) {
    blockThreads[recentArtBlock.id] = [
      messageAt(
        "This one actually felt like proof that starting tiny works. I did not plan to stay with it that long.",
        addMinutes(new Date(recentArtBlock.updated_at), 2),
        "user",
        recentArtBlock.id,
      ),
      messageAt(
        "This looks like a good model for starting art practice: make the first step tiny, then let momentum decide whether it expands.",
        addMinutes(new Date(recentArtBlock.updated_at), 4),
        "assistant",
        recentArtBlock.id,
      ),
    ]
  }

  if (recentAdminBlock) {
    blockThreads[recentAdminBlock.id] = [
      messageAt(
        "I avoided this until it was embarrassing, then the timer made it smaller.",
        addMinutes(new Date(recentAdminBlock.updated_at), 2),
        "user",
        recentAdminBlock.id,
      ),
      messageAt(
        "The admin note is worth keeping unsmoothed. It shows the task became possible only after the scope was capped.",
        addMinutes(new Date(recentAdminBlock.updated_at), 4),
        "assistant",
        recentAdminBlock.id,
      ),
    ]
  }

  const chatInsightMessages = [
    ...messages.map((message) => ({ message, scope: "general" as const })),
    ...Object.values(blockThreads).flatMap((thread) =>
      thread.map((message) => ({ message, scope: "time_block" as const })),
    ),
  ].filter(({ message }) => message.role === "user")

  return {
    version: DEMO_SESSION_VERSION,
    name,
    active_timer: null,
    blocks: sortedBlocks,
    categories: [...DEMO_DEFAULT_CATEGORIES, ...CUSTOM_SEED_CATEGORIES],
    messages,
    block_threads: blockThreads,
    pending_draft: null,
    insights: sortedBlocks.reduce<TimeBlockInsight[]>(
      (current, block) => upsertDemoInsight(current, block),
      [],
    ),
    chat_insights: chatInsightMessages.flatMap(({ message, scope }) => {
      const insight = demoChatInsightForMessage(message, scope)
      return insight ? [insight] : []
    }),
    ai_usage: createDemoAiUsage(),
    ai_settings: createDemoAiSettings(),
    updated_at: now.toISOString(),
  }
}
