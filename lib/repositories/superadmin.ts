import "server-only";

import { sql } from "kysely";
import { getDb } from "@/lib/db/client";
import type {
  AppUserRole,
  SuperadminOverview,
  SuperadminUserUsageRow,
} from "@/lib/types";

export const SUPERADMIN_WINDOW_OPTIONS = [7, 30, 90] as const;

type NumericValue = bigint | number | string | null | undefined;

interface OverviewQueryRow {
  total_signed_up_users: NumericValue;
  new_users_in_window: NumericValue;
  active_users_in_window: NumericValue;
  completed_time_blocks: NumericValue;
  logged_seconds: NumericValue;
  active_timers: NumericValue;
  companion_conversations: NumericValue;
  companion_messages: NumericValue;
  companion_user_messages: NumericValue;
  companion_assistant_messages: NumericValue;
}

interface UserUsageQueryRow {
  user_id: string;
  email: string | null;
  role: string;
  signed_up_at: string;
  last_activity_at: string | null;
  completed_time_blocks: NumericValue;
  logged_seconds: NumericValue;
  companion_messages: NumericValue;
  has_active_timer: boolean | null;
}

function toNumber(value: NumericValue): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function secondsToHours(seconds: NumericValue): number {
  return Math.round((toNumber(seconds) / 3600) * 100) / 100;
}

function normalizeRole(role: string): AppUserRole {
  return role === "superadmin" ? "superadmin" : "user";
}

export function normalizeSuperadminWindowDays(windowDays: number): number {
  return SUPERADMIN_WINDOW_OPTIONS.includes(
    windowDays as (typeof SUPERADMIN_WINDOW_OPTIONS)[number],
  )
    ? windowDays
    : 30;
}

function windowStartedAt(windowDays: number): string {
  return new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

export async function getSuperadminOverview(
  windowDays: number,
): Promise<SuperadminOverview> {
  const normalizedWindowDays = normalizeSuperadminWindowDays(windowDays);
  const startedAt = windowStartedAt(normalizedWindowDays);
  const result = await sql<OverviewQueryRow>`
    with active_users as (
      select user_id
      from time_blocks
      where greatest(started_at, coalesce(ended_at, started_at), created_at, updated_at) >= ${startedAt}::timestamptz

      union

      select user_id
      from companion_messages
      where created_at >= ${startedAt}::timestamptz

      union

      select user_id
      from active_timer
      where started_at >= ${startedAt}::timestamptz
    )
    select
      (select count(*) from app_users)::bigint as total_signed_up_users,
      (select count(*) from app_users where created_at >= ${startedAt}::timestamptz)::bigint as new_users_in_window,
      (select count(distinct user_id) from active_users)::bigint as active_users_in_window,
      (select count(*) from time_blocks where ended_at is not null)::bigint as completed_time_blocks,
      (
        select coalesce(sum(duration_seconds), 0)
        from time_blocks
        where ended_at is not null
          and duration_seconds is not null
      )::bigint as logged_seconds,
      (select count(*) from active_timer)::bigint as active_timers,
      (select count(*) from companion_conversations)::bigint as companion_conversations,
      (select count(*) from companion_messages)::bigint as companion_messages,
      (select count(*) from companion_messages where role = 'user')::bigint as companion_user_messages,
      (select count(*) from companion_messages where role = 'assistant')::bigint as companion_assistant_messages
  `.execute(getDb());

  const row = result.rows[0];

  return {
    windowDays: normalizedWindowDays,
    windowStartedAt: startedAt,
    totalSignedUpUsers: toNumber(row?.total_signed_up_users),
    newUsersInWindow: toNumber(row?.new_users_in_window),
    activeUsersInWindow: toNumber(row?.active_users_in_window),
    completedTimeBlocks: toNumber(row?.completed_time_blocks),
    loggedHours: secondsToHours(row?.logged_seconds),
    activeTimers: toNumber(row?.active_timers),
    companionConversations: toNumber(row?.companion_conversations),
    companionMessages: toNumber(row?.companion_messages),
    companionUserMessages: toNumber(row?.companion_user_messages),
    companionAssistantMessages: toNumber(row?.companion_assistant_messages),
  };
}

export async function listSuperadminUserUsage(
  limit = 100,
): Promise<SuperadminUserUsageRow[]> {
  const normalizedLimit = Math.min(
    Math.max(Number.isFinite(limit) ? Math.floor(limit) : 100, 1),
    500,
  );
  const result = await sql<UserUsageQueryRow>`
    with block_usage as (
      select
        user_id,
        count(*) filter (where ended_at is not null)::bigint as completed_time_blocks,
        coalesce(
          sum(duration_seconds) filter (
            where ended_at is not null
              and duration_seconds is not null
          ),
          0
        )::bigint as logged_seconds,
        max(greatest(started_at, coalesce(ended_at, started_at), created_at, updated_at)) as last_block_at
      from time_blocks
      group by user_id
    ),
    message_usage as (
      select
        user_id,
        count(*)::bigint as companion_messages,
        max(created_at) as last_message_at
      from companion_messages
      group by user_id
    ),
    timer_usage as (
      select
        user_id,
        true as has_active_timer,
        max(started_at) as active_timer_started_at
      from active_timer
      group by user_id
    )
    select
      app_users.id::text as user_id,
      app_users.email,
      app_users.role,
      app_users.created_at as signed_up_at,
      greatest(
        block_usage.last_block_at,
        message_usage.last_message_at,
        timer_usage.active_timer_started_at
      ) as last_activity_at,
      coalesce(block_usage.completed_time_blocks, 0)::bigint as completed_time_blocks,
      coalesce(block_usage.logged_seconds, 0)::bigint as logged_seconds,
      coalesce(message_usage.companion_messages, 0)::bigint as companion_messages,
      coalesce(timer_usage.has_active_timer, false) as has_active_timer
    from app_users
    left join block_usage on block_usage.user_id = app_users.id
    left join message_usage on message_usage.user_id = app_users.id
    left join timer_usage on timer_usage.user_id = app_users.id
    order by last_activity_at desc nulls last, app_users.created_at desc
    limit ${normalizedLimit}
  `.execute(getDb());

  return result.rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: normalizeRole(row.role),
    signedUpAt: row.signed_up_at,
    lastActivityAt: row.last_activity_at,
    completedTimeBlocks: toNumber(row.completed_time_blocks),
    loggedHours: secondsToHours(row.logged_seconds),
    companionMessages: toNumber(row.companion_messages),
    hasActiveTimer: row.has_active_timer ?? false,
  }));
}
