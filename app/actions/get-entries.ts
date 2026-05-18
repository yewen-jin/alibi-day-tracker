"use server"

import { getCurrentUser } from "@/lib/auth/session"
import { listEntries } from "@/lib/repositories/legacy"
import type { Entry } from "@/lib/types"

/**
 * Fetch the current user's entries, newest first.
 * Returns [] if the user is not authenticated, so the caller can render an empty state.
 */
export async function getEntries(): Promise<Entry[]> {
  const user = await getCurrentUser()
  if (!user) return []

  try {
    return await listEntries(user.id)
  } catch (error) {
    console.log(
      "[v0] getEntries error:",
      error instanceof Error ? error.message : String(error),
    )
    return []
  }
}
