import "server-only";

import { getDb } from "@/lib/db/client";
import type { CompanionMessage, CompanionMessageInsight } from "@/lib/types";

export async function listRecentCompanionMessageInsights(
  userId: string,
  limit = 80,
): Promise<CompanionMessageInsight[]> {
  const rows = await getDb()
    .selectFrom("companion_message_insights")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();

  return rows as CompanionMessageInsight[];
}

export async function listRecentUserCompanionMessages(
  userId: string,
  limit = 80,
): Promise<CompanionMessage[]> {
  const rows = await getDb()
    .selectFrom("companion_messages")
    .selectAll()
    .where("user_id", "=", userId)
    .where("role", "=", "user")
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();

  return rows as CompanionMessage[];
}
