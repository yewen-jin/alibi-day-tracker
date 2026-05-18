import "server-only";

import { getDb } from "@/lib/db/client";
import type { Entry, ProactiveMessage } from "@/lib/types";

export async function listEntries(userId: string): Promise<Entry[]> {
  const rows = await getDb()
    .selectFrom("entries")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  return rows as Entry[];
}

export async function listUnreadProactiveMessages(
  userId: string,
): Promise<ProactiveMessage[]> {
  const rows = await getDb()
    .selectFrom("proactive_messages")
    .selectAll()
    .where("user_id", "=", userId)
    .where("read_at", "is", null)
    .orderBy("created_at", "asc")
    .execute();

  return rows as ProactiveMessage[];
}

export async function markProactiveMessageReadForUser(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .updateTable("proactive_messages")
    .set({ read_at: new Date().toISOString() })
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .execute();
}
