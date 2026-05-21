import "server-only";

import { getDb } from "@/lib/db/client";
import type { CompanionMessage, CompanionMessageInsight } from "@/lib/types";

export async function listRecentCompanionMessageInsights(
  userId: string,
  options: {
    since?: Date;
    limit?: number;
  } = {},
): Promise<CompanionMessageInsight[]> {
  let query = getDb()
    .selectFrom("companion_message_insights")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .limit(options.limit ?? 500);

  if (options.since) {
    query = query.where("created_at", ">=", options.since.toISOString());
  }

  const rows = await query.execute();

  return rows as CompanionMessageInsight[];
}

export async function listRecentUserCompanionMessages(
  userId: string,
  options: {
    since?: Date;
    limit?: number;
  } = {},
): Promise<CompanionMessage[]> {
  let query = getDb()
    .selectFrom("companion_messages")
    .selectAll()
    .where("user_id", "=", userId)
    .where("role", "=", "user")
    .orderBy("created_at", "desc")
    .limit(options.limit ?? 500);

  if (options.since) {
    query = query.where("created_at", ">=", options.since.toISOString());
  }

  const rows = await query.execute();

  return rows as CompanionMessage[];
}
