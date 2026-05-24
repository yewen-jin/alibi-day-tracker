export type Mood = "joyful" | "neutral" | "flat" | "anxious" | "guilty" | "proud"
export type EffortLevel = "easy" | "medium" | "hard" | "grind"
export type Satisfaction = "satisfied" | "mixed" | "frustrated" | "unclear"
export type TimeBlockCategory = string
export type AppUserRole = "user" | "superadmin"

export interface Entry {
  id: string
  user_id: string
  raw_input: string | null
  content: string
  project: string | null
  mood: Mood | null
  duration_minutes: number | null
  effort_level: EffortLevel | null
  satisfaction: Satisfaction | null
  avoidance_marker: boolean
  hyperfocus_marker: boolean
  guilt_marker: boolean
  novelty_marker: boolean
  created_at: string
}

export type ProactiveKind = "insight" | "nudge" | "celebration" | "pattern"

export interface ProactiveMessage {
  id: string
  user_id: string
  content: string
  kind: ProactiveKind
  entries_count_at_creation: number
  created_at: string
  read_at: string | null
}

export interface ActiveTimer {
  user_id: string
  started_at: string
  created_at: string
}

export interface TimeBlock {
  id: string
  user_id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  category_id: string | null
  task_name: string | null
  category: TimeBlockCategory | null
  hashtags: string[] | null
  notes: string | null
  mood: Mood | null
  effort_level: EffortLevel | null
  satisfaction: Satisfaction | null
  avoidance_marker: boolean
  hyperfocus_marker: boolean
  guilt_marker: boolean
  novelty_marker: boolean
  agent_metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NoteVersionSource = "manual" | "chat" | "agent"

export interface TimeBlockNoteVersion {
  id: string
  time_block_id: string
  user_id: string
  previous_notes: string | null
  new_notes: string | null
  source: NoteVersionSource
  created_at: string
}

export interface EvidenceClaim {
  id: string
  source_type: "time_block_note" | "companion_message"
  source_id: string
  source_field: string
  kind: string
  text: string
  context_excerpt: string
  start_index?: number
  end_index?: number
}

export interface TimeBlockInsight {
  id: string
  time_block_id: string
  note_version_id: string | null
  user_id: string
  source: "notes"
  source_notes: string | null
  actions: string[]
  emotional_tone: string | null
  friction_points: string[]
  avoidance_signals: string[]
  hyperfocus_signals: string[]
  satisfaction_signals: string[]
  uncertainty_signals: string[]
  people: string[]
  projects: string[]
  themes: string[]
  evidence_excerpt: string | null
  evidence_claims: EvidenceClaim[]
  model_version: string
  created_at: string
}

export type CompanionMessageInsightScope = "general" | "time_block"

export interface CompanionMessageInsight {
  id: string
  user_id: string
  message_id: string
  conversation_id: string
  related_time_block_id: string | null
  scope: CompanionMessageInsightScope
  did_actions: string[]
  intended_actions: string[]
  avoided_or_deferred: string[]
  friction_points: string[]
  emotional_signals: string[]
  useful_drift: string[]
  mismatch_signals: string[]
  themes: string[]
  evidence_excerpt: string | null
  evidence_claims: EvidenceClaim[]
  model_version: string
  created_at: string
}

export interface TimeBlockCategoryRecord {
  id: string
  user_id: string | null
  slug: string
  name: string
  color: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export type DashboardViewStatus = "draft" | "published" | "archived"

export interface DashboardViewRecord {
  id: string
  user_id: string
  slug: string
  title: string
  description: string | null
  status: DashboardViewStatus
  source_prompt: string
  spec: Record<string, unknown>
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface DashboardViewRunRecord {
  id: string
  dashboard_view_id: string
  user_id: string
  status: "success" | "error"
  input_window_start: string | null
  input_window_end: string | null
  result: Record<string, unknown> | null
  model_version: string | null
  error: string | null
  created_at: string
}

export interface DashboardViewGenerationLogRecord {
  id: string
  user_id: string
  dashboard_view_id: string | null
  action: "create" | "refresh" | "update"
  status: "success" | "error"
  source_prompt: string
  model_version: string | null
  input_window_start: string | null
  input_window_end: string | null
  evidence_summary: Record<string, unknown>
  attempts: Array<Record<string, unknown>>
  error: string | null
  created_at: string
}

export type MemoryChunkSourceType =
  | "time_block"
  | "time_block_insight"
  | "companion_message"
  | "companion_message_insight"
  | "time_block_note_version"

export type MemoryChunkStatus = "pending" | "embedded" | "failed" | "stale"

export interface MemoryChunk {
  id: string
  user_id: string
  source_type: MemoryChunkSourceType
  source_id: string
  source_created_at: string
  chunk_index: number
  chunk_text: string
  metadata: Record<string, unknown>
  content_hash: string
  status: MemoryChunkStatus
  error: string | null
  embedded_at: string | null
  created_at: string
  updated_at: string
}

export interface RagRetrievalLog {
  id: string
  user_id: string
  use_case:
    | "companion_chat"
    | "companion_analysis"
    | "dashboard_create"
    | "dashboard_refresh"
    | "dashboard_update"
  query: string
  source_types: string[] | null
  date_range_start: string | null
  date_range_end: string | null
  match_count: number
  top_source_ids: string[]
  max_similarity: number | null
  min_similarity: number | null
  status: "success" | "fallback" | "error"
  error: string | null
  created_at: string
}

export type CompanionMessageRole = "user" | "assistant"
export type CompanionMessageType =
  | "chat"
  | "ack"
  | "clarification"
  | "analysis"
  | "error"
  | "context"
export type CompanionConversationKind = "general" | "time_block"

export interface CompanionTimeBlockContext {
  id: string
  task_name: string | null
  category: TimeBlockCategory | null
  hashtags: string[]
  notes: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  mood: Mood | null
  effort_level: EffortLevel | null
  satisfaction: Satisfaction | null
  avoidance_marker: boolean
  hyperfocus_marker: boolean
  guilt_marker: boolean
  novelty_marker: boolean
}

export interface CompanionConversationContextSnapshot {
  kind: CompanionConversationKind
  time_block?: CompanionTimeBlockContext
}

export interface CompanionConversation {
  id: string
  user_id: string
  kind: CompanionConversationKind
  title: string | null
  related_time_block_id: string | null
  context_snapshot: CompanionConversationContextSnapshot
  created_at: string
  updated_at: string
}

export interface CompanionMessage {
  id: string
  conversation_id: string
  user_id: string
  role: CompanionMessageRole
  content: string
  message_type: CompanionMessageType
  model: string
  related_time_block_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface CompanionThreadState {
  conversation: CompanionConversation
  messages: CompanionMessage[]
  hasPendingDraft: boolean
}

export interface SaveBlockInput {
  id?: string
  task_name: string
  category: TimeBlockCategory
  category_id?: string | null
  started_at: string
  ended_at: string
  hashtags?: string[]
  notes?: string | null
  mood?: Mood | null
  effort_level?: EffortLevel | null
  satisfaction?: Satisfaction | null
  avoidance_marker?: boolean
  hyperfocus_marker?: boolean
  guilt_marker?: boolean
  novelty_marker?: boolean
  note_source?: NoteVersionSource
}

export interface StopTimerInput {
  task_name?: string | null
  category?: TimeBlockCategory | null
  category_id?: string | null
  hashtags?: string[]
  notes?: string | null
  mood?: Mood | null
  effort_level?: EffortLevel | null
  satisfaction?: Satisfaction | null
  avoidance_marker?: boolean
  hyperfocus_marker?: boolean
  guilt_marker?: boolean
  novelty_marker?: boolean
  note_source?: NoteVersionSource
}

export interface StartTimerInput {
  started_at?: string | null
  task_name?: string | null
  category?: TimeBlockCategory | null
  category_id?: string | null
  hashtags?: string[]
  notes?: string | null
  mood?: Mood | null
  effort_level?: EffortLevel | null
  satisfaction?: Satisfaction | null
  avoidance_marker?: boolean
  hyperfocus_marker?: boolean
  guilt_marker?: boolean
  novelty_marker?: boolean
}

export interface DeleteBlockInput {
  id: string
}

export interface ResumeBlockInput {
  id: string
}

export interface GetCalendarDataInput {
  start: string
  end: string
}

export interface SuperadminOverview {
  windowDays: number
  windowStartedAt: string
  totalSignedUpUsers: number
  newUsersInWindow: number
  activeUsersInWindow: number
  completedTimeBlocks: number
  loggedHours: number
  activeTimers: number
  companionConversations: number
  companionMessages: number
  companionUserMessages: number
  companionAssistantMessages: number
}

export interface SuperadminUserUsageRow {
  userId: string
  email: string | null
  role: AppUserRole
  signedUpAt: string
  lastActivityAt: string | null
  completedTimeBlocks: number
  loggedHours: number
  companionMessages: number
  hasActiveTimer: boolean
}

export interface CreateCategoryInput {
  name: string
  color?: string | null
}

export type GetActiveTimerResult =
  | {
      type: "loaded"
      activeTimer: ActiveTimer | null
    }
  | {
      type: "error"
      message: string
    }

export type GetCategoriesResult =
  | {
      type: "loaded"
      categories: TimeBlockCategoryRecord[]
    }
  | {
      type: "error"
      message: string
    }

export type CreateCategoryResult =
  | {
      type: "created"
      category: TimeBlockCategoryRecord
    }
  | {
      type: "exists"
      category: TimeBlockCategoryRecord
    }
  | {
      type: "error"
      message: string
    }

export type StartTimerResult =
  | {
      type: "started"
      activeTimer: ActiveTimer
    }
  | {
      type: "already_running"
      activeTimer: ActiveTimer
    }
  | {
      type: "error"
      message: string
    }

export type StopTimerResult =
  | {
      type: "stopped"
      timeBlock: TimeBlock
    }
  | {
      type: "not_running"
    }
  | {
      type: "error"
      message: string
      timeBlock?: TimeBlock
    }

export type SaveBlockResult =
  | {
      type: "saved"
      timeBlock: TimeBlock
    }
  | {
      type: "not_found"
    }
  | {
      type: "error"
      message: string
    }

export type DeleteBlockResult =
  | {
      type: "deleted"
      id: string
    }
  | {
      type: "not_found"
    }
  | {
      type: "error"
      message: string
    }

export type ResumeBlockResult =
  | {
      type: "resumed"
      activeTimer: ActiveTimer
    }
  | {
      type: "already_running"
      activeTimer: ActiveTimer
    }
  | {
      type: "not_found"
    }
  | {
      type: "error"
      message: string
    }

export type GetCalendarDataResult =
  | {
      type: "loaded"
      timeBlocks: TimeBlock[]
    }
  | {
      type: "error"
      message: string
    }
