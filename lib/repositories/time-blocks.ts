import "server-only";

import { getDb } from "@/lib/db/client";
import type {
  ActiveTimer,
  TimeBlock,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
  TimeBlockNoteVersion,
} from "@/lib/types";

export async function getActiveTimerForUser(
  userId: string,
): Promise<ActiveTimer | null> {
  const row = await getDb()
    .selectFrom("active_timer")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return (row as ActiveTimer | undefined) ?? null;
}

export async function listCompletedTimeBlocks(userId: string): Promise<TimeBlock[]> {
  const rows = await getDb()
    .selectFrom("time_blocks")
    .selectAll()
    .where("user_id", "=", userId)
    .where("ended_at", "is not", null)
    .orderBy("started_at", "desc")
    .execute();

  return rows as TimeBlock[];
}

export async function listRecentCompletedTimeBlocks(
  userId: string,
  since: Date,
): Promise<TimeBlock[]> {
  const rows = await getDb()
    .selectFrom("time_blocks")
    .selectAll()
    .where("user_id", "=", userId)
    .where("ended_at", "is not", null)
    .where("started_at", ">=", since.toISOString())
    .orderBy("started_at", "desc")
    .execute();

  return rows as TimeBlock[];
}

export async function listCompletedTimeBlocksInRange(
  userId: string,
  start: string,
  end: string,
): Promise<TimeBlock[]> {
  const rows = await getDb()
    .selectFrom("time_blocks")
    .selectAll()
    .where("user_id", "=", userId)
    .where("started_at", "<", end)
    .where("ended_at", "is not", null)
    .where("ended_at", ">", start)
    .orderBy("started_at", "asc")
    .execute();

  return rows as TimeBlock[];
}

export async function listTimeBlockCategories(
  userId: string,
): Promise<TimeBlockCategoryRecord[]> {
  const rows = await getDb()
    .selectFrom("time_block_categories")
    .selectAll()
    .where((eb) =>
      eb.or([eb("user_id", "is", null), eb("user_id", "=", userId)]),
    )
    .orderBy("is_default", "desc")
    .orderBy("name", "asc")
    .execute();

  return rows as TimeBlockCategoryRecord[];
}

export async function listTimeBlockInsightsForBlocks(
  userId: string,
  blockIds: string[],
): Promise<TimeBlockInsight[]> {
  if (blockIds.length === 0) return [];

  const rows = await getDb()
    .selectFrom("time_block_insights")
    .selectAll()
    .where("user_id", "=", userId)
    .where("time_block_id", "in", blockIds)
    .execute();

  return rows as TimeBlockInsight[];
}

export async function listTimeBlockNoteVersionsByIds(
  userId: string,
  noteVersionIds: string[],
): Promise<TimeBlockNoteVersion[]> {
  if (noteVersionIds.length === 0) return [];

  const rows = await getDb()
    .selectFrom("time_block_note_versions")
    .selectAll()
    .where("user_id", "=", userId)
    .where("id", "in", noteVersionIds)
    .execute();

  return rows as TimeBlockNoteVersion[];
}
