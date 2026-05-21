"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSyncedUser } from "@/lib/auth/session";
import {
  createGoogleCalendarAuthUrl,
  getGoogleCalendarConnection,
  syncTimeBlockToGoogleCalendar,
} from "@/lib/google-calendar";
import { listCompletedTimeBlocks } from "@/lib/repositories/time-blocks";

export async function connectGoogleCalendar() {
  const user = await requireSyncedUser();
  const url = createGoogleCalendarAuthUrl(user.id);

  if (!url) {
    return { type: "error" as const, message: "google calendar is not configured." };
  }

  redirect(url);
}

export async function getCalendarConnection() {
  const user = await requireSyncedUser();
  return getGoogleCalendarConnection(user.id);
}

export async function retryGoogleCalendarSync() {
  const user = await requireSyncedUser();
  const blocks = await listCompletedTimeBlocks(user.id);
  let synced = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const block of blocks) {
    const result = await syncTimeBlockToGoogleCalendar(user.id, block, {
      force: true,
    });
    if (result.type === "synced") synced += 1;
    if (result.type === "error") {
      failed += 1;
      firstError ??= result.message;
    }
  }

  revalidatePath("/app/calendar");
  return { type: "synced" as const, synced, failed, firstError };
}
