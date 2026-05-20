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
import type { AppUserRole } from "@/lib/types";

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
  role: Generated<AppUserRole>;
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

interface UserSecretKeysTable {
  id: Generated<string>;
  user_id: string;
  purpose: string;
  provider: string;
  encrypted_value: string;
  key_hint: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface UserAiSettingsTable {
  user_id: string;
  mode: Generated<string>;
  provider: Generated<string>;
  base_url: string | null;
  fast_model: Generated<string>;
  companion_model: Generated<string>;
  key_preview: string | null;
  disclosure_accepted_at: NullableTimestamp;
  disabled_at: NullableTimestamp;
  tested_at: NullableTimestamp;
  last_error: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface UserAiProviderSettingsTable {
  user_id: string;
  provider: string;
  base_url: string | null;
  fast_model: Generated<string>;
  companion_model: Generated<string>;
  key_preview: string | null;
  disclosure_accepted_at: NullableTimestamp;
  disabled_at: NullableTimestamp;
  tested_at: NullableTimestamp;
  last_error: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface GoogleCalendarConnectionsTable {
  user_id: string;
  google_account_email: string | null;
  google_calendar_id: string | null;
  scope: string;
  connected_at: GeneratedTimestamp;
  token_expires_at: NullableTimestamp;
  last_sync_at: NullableTimestamp;
  last_error: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

interface GoogleCalendarEventSyncsTable {
  user_id: string;
  time_block_id: string;
  google_event_id: string | null;
  content_hash: string;
  sync_status: Generated<string>;
  last_error: string | null;
  synced_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
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
  user_secret_keys: UserSecretKeysTable;
  user_ai_settings: UserAiSettingsTable;
  user_ai_provider_settings: UserAiProviderSettingsTable;
  google_calendar_connections: GoogleCalendarConnectionsTable;
  google_calendar_event_syncs: GoogleCalendarEventSyncsTable;
}

export type AppUserRow = Selectable<AppUsersTable>;
export type NewAppUserRow = Insertable<AppUsersTable>;
export type AppUserUpdate = Updateable<AppUsersTable>;

let db: Kysely<Database> | null = null;

pgTypes.setTypeParser(1114, (value) => value);
pgTypes.setTypeParser(1184, (value) => value);

function getConnectionString() {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL_NON_POOLING
  );
}

function getSslConfig(connectionString: string) {
  if (process.env.DATABASE_SSL === "false") {
    return undefined;
  }

  const requiresSsl =
    process.env.DATABASE_SSL === "true" ||
    /[?&]sslmode=(require|prefer|verify-ca|verify-full)(?:&|$)/.test(
      connectionString,
    );

  return requiresSsl ? { rejectUnauthorized: false } : undefined;
}

function getPoolConnectionString(connectionString: string, hasSslConfig: boolean) {
  if (!hasSslConfig) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function getDb() {
  if (!db) {
    const connectionString = getConnectionString();

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL or POSTGRES_URL is required for application data access.",
      );
    }

    const ssl = getSslConfig(connectionString);

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: getPoolConnectionString(connectionString, Boolean(ssl)),
          ssl,
        }),
      }),
    });
  }

  return db;
}
