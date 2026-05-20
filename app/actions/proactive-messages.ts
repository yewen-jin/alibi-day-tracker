"use server"

import { getCurrentUser, syncAppUser } from "@/lib/auth/session"
import {
  listUnreadProactiveMessages,
  markProactiveMessageReadForUser,
} from "@/lib/repositories/legacy"
import type { ProactiveMessage } from "@/lib/types"

/** Get unread proactive messages for the current user. */
export async function getUnreadProactiveMessages(): Promise<ProactiveMessage[]> {
  const user = await getCurrentUser()
  if (!user) return []

  return listUnreadProactiveMessages(user.id)
}

/** Mark a single proactive message as read. */
export async function markProactiveMessageRead(id: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  await syncAppUser(user)
  await markProactiveMessageReadForUser(user.id, id)
}
