import "server-only";

import { getDb } from "@/lib/db/client";
import type {
  TimeBlock,
  TimeBlockCategoryRecord,
  TimeBlockInsight,
} from "@/lib/types";

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
