import "server-only";

import {
  ColumnType,
  Generated,
  Insertable,
  Kysely,
  PostgresDialect,
  Selectable,
  Updateable,
} from "kysely";
import { Pool, types as pgTypes } from "pg";

type Timestamp = ColumnType<string, string | Date, string | Date>;
type NullableTimestamp = ColumnType<string | null, string | Date | null, string | Date | null>;
type GeneratedTimestamp = ColumnType<string, string | Date | undefined, string | Date>;
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface AppUsersTable {
  id: string;
  email: string | null;
  auth_provider: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface EntriesTable {
  id: Generated<string>;
  user_id: string;
  raw_input: string | null;
  content: string;
  project: string | null;
  mood: string | null;
  duration_minutes: number | null;
  effort_level: string | null;
  satisfaction: string | null;
  avoidance_marker: Generated<boolean>;
  hyperfocus_marker: Generated<boolean>;
  guilt_marker: Generated<boolean>;
  novelty_marker: Generated<boolean>;
  created_at: GeneratedTimestamp;
}

interface ProactiveMessagesTable {
  id: Generated<string>;
  user_id: string;
  content: string;
  kind: string;
  entries_count_at_creation: Generated<number>;
  created_at: GeneratedTimestamp;
  read_at: NullableTimestamp;
}

interface ActiveTimerTable {
  user_id: string;
  started_at: GeneratedTimestamp;
  created_at: GeneratedTimestamp;
}

interface TimeBlocksTable {
  id: Generated<string>;
  user_id: string;
  started_at: Timestamp;
  ended_at: NullableTimestamp;
  duration_seconds: ColumnType<number | null, never, never>;
  category_id: string | null;
  task_name: string | null;
  category: string | null;
  hashtags: Generated<string[]>;
  notes: string | null;
  mood: string | null;
  effort_level: string | null;
  satisfaction: string | null;
  avoidance_marker: Generated<boolean>;
  hyperfocus_marker: Generated<boolean>;
  guilt_marker: Generated<boolean>;
  novelty_marker: Generated<boolean>;
  agent_metadata: Generated<JsonValue>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface TimeBlockCategoriesTable {
  id: Generated<string>;
  user_id: string | null;
  slug: string;
  name: string;
  color: Generated<string>;
  is_default: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface TimeBlockNoteVersionsTable {
  id: Generated<string>;
  time_block_id: string;
  user_id: string;
  previous_notes: string | null;
  new_notes: string | null;
  source: Generated<string>;
  created_at: GeneratedTimestamp;
}

interface TimeBlockInsightsTable {
  id: Generated<string>;
  time_block_id: string;
  note_version_id: string | null;
  user_id: string;
  source: Generated<string>;
  source_notes: string | null;
  actions: Generated<string[]>;
  emotional_tone: string | null;
  friction_points: Generated<string[]>;
  avoidance_signals: Generated<string[]>;
  hyperfocus_signals: Generated<string[]>;
  satisfaction_signals: Generated<string[]>;
  uncertainty_signals: Generated<string[]>;
  people: Generated<string[]>;
  projects: Generated<string[]>;
  themes: Generated<string[]>;
  evidence_excerpt: string | null;
  model_version: string;
  created_at: GeneratedTimestamp;
}

interface CompanionConversationsTable {
  id: Generated<string>;
  user_id: string;
  kind: Generated<string>;
  title: string | null;
  related_time_block_id: string | null;
  context_snapshot: Generated<JsonValue>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface CompanionMessagesTable {
  id: Generated<string>;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  message_type: Generated<string>;
  model: Generated<string>;
  related_time_block_id: string | null;
  metadata: Generated<JsonValue>;
  created_at: GeneratedTimestamp;
}

interface CompanionDraftsTable {
  user_id: string;
  conversation_id: string;
  draft: JsonValue;
  status: Generated<string>;
  updated_at: GeneratedTimestamp;
  expires_at: NullableTimestamp;
}

interface CompanionMessageInsightsTable {
  id: Generated<string>;
  user_id: string;
  message_id: string;
  conversation_id: string;
  related_time_block_id: string | null;
  scope: Generated<string>;
  did_actions: Generated<string[]>;
  intended_actions: Generated<string[]>;
  avoided_or_deferred: Generated<string[]>;
  friction_points: Generated<string[]>;
  emotional_signals: Generated<string[]>;
  useful_drift: Generated<string[]>;
  mismatch_signals: Generated<string[]>;
  themes: Generated<string[]>;
  evidence_excerpt: string | null;
  model_version: string;
  created_at: GeneratedTimestamp;
}

export interface Database {
  app_users: AppUsersTable;
  entries: EntriesTable;
  proactive_messages: ProactiveMessagesTable;
  active_timer: ActiveTimerTable;
  time_blocks: TimeBlocksTable;
  time_block_categories: TimeBlockCategoriesTable;
  time_block_note_versions: TimeBlockNoteVersionsTable;
  time_block_insights: TimeBlockInsightsTable;
  companion_conversations: CompanionConversationsTable;
  companion_messages: CompanionMessagesTable;
  companion_drafts: CompanionDraftsTable;
  companion_message_insights: CompanionMessageInsightsTable;
}

export type AppUserRow = Selectable<AppUsersTable>;
export type NewAppUserRow = Insertable<AppUsersTable>;
export type AppUserUpdate = Updateable<AppUsersTable>;

let db: Kysely<Database> | null = null;

pgTypes.setTypeParser(1114, (value) => value);
pgTypes.setTypeParser(1184, (value) => value);

export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required for application data access.");
    }

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString,
          ssl:
            process.env.DATABASE_SSL === "true"
              ? { rejectUnauthorized: false }
              : undefined,
        }),
      }),
    });
  }

  return db;
}
