import "server-only";

import { createHash, createHmac, randomBytes } from "crypto";
import { getDb } from "@/lib/db/client";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";
import type { TimeBlock } from "@/lib/types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

export interface GoogleCalendarConnectionSnapshot {
  connected: boolean;
  googleAccountEmail: string | null;
  googleCalendarId: string | null;
  scope: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;

  if (!clientId || !clientSecret || !origin) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${origin.replace(/\/$/, "")}/api/google/calendar/callback`,
  };
}

function getStateSigningKey() {
  return process.env.ALIBI_OAUTH_STATE_SECRET || process.env.ALIBI_SECRET_ENCRYPTION_KEY || "alibi-development-oauth-state";
}

function signState(payload: string) {
  return createHmac("sha256", getStateSigningKey()).update(payload).digest("base64url");
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

function blockEventHash(block: TimeBlock) {
  return createHash("sha256")
    .update(JSON.stringify({
      task_name: block.task_name,
      category: block.category,
      started_at: block.started_at,
      ended_at: block.ended_at,
      notes: block.notes,
      hashtags: block.hashtags ?? [],
    }))
    .digest("hex");
}

function toGoogleDateTime(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventPayloadForBlock(block: TimeBlock) {
  const summary = block.task_name || "Alibi time block";
  const start = toGoogleDateTime(block.started_at) ?? new Date().toISOString();
  const parsedEnd = toGoogleDateTime(block.ended_at);
  const end =
    parsedEnd && new Date(parsedEnd).getTime() > new Date(start).getTime()
      ? parsedEnd
      : new Date(new Date(start).getTime() + 60_000).toISOString();
  const descriptionParts = [
    block.category ? `category: ${block.category}` : null,
    block.hashtags?.length ? `tags: ${block.hashtags.map((tag) => `#${tag}`).join(" ")}` : null,
    block.notes ? `notes:\n${block.notes}` : null,
  ].filter(Boolean);

  return {
    summary,
    description: descriptionParts.join("\n\n"),
    start: { dateTime: start },
    end: { dateTime: end },
    extendedProperties: {
      private: {
        alibi_time_block_id: block.id,
      },
    },
  };
}

async function saveRefreshToken(userId: string, token: string) {
  await getDb()
    .insertInto("user_secret_keys")
    .values({
      user_id: userId,
      purpose: "google_refresh_token",
      provider: "google_calendar",
      preset_id: "google_calendar",
      encrypted_value: encryptSecret(token),
      key_hint: null,
    })
    .onConflict((oc) =>
      oc.columns(["user_id", "purpose", "preset_id"]).doUpdateSet({
        encrypted_value: encryptSecret(token),
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();
}

async function getRefreshToken(userId: string) {
  const row = await getDb()
    .selectFrom("user_secret_keys")
    .select("encrypted_value")
    .where("user_id", "=", userId)
    .where("purpose", "=", "google_refresh_token")
    .where("provider", "=", "google_calendar")
    .executeTakeFirst();

  return row ? decryptSecret(row.encrypted_value) : null;
}

async function getAccessToken(userId: string) {
  const config = getGoogleConfig();
  const refreshToken = await getRefreshToken(userId);

  if (!config || !refreshToken) {
    return null;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  await getDb()
    .updateTable("google_calendar_connections")
    .set({
      token_expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .where("user_id", "=", userId)
    .execute();

  return data.access_token;
}

async function googleFetch<T>(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const token = await getAccessToken(userId);
  if (!token) return { ok: false, message: "google calendar is not connected." };

  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, message: text.slice(0, 400) || `google calendar returned ${response.status}.` };
  }

  if (response.status === 204) {
    return { ok: true, data: null as T };
  }

  return { ok: true, data: await response.json() as T };
}

export async function getGoogleCalendarConnection(userId: string): Promise<GoogleCalendarConnectionSnapshot> {
  let row:
    | {
        google_account_email: string | null;
        google_calendar_id: string | null;
        scope: string;
        connected_at: string;
        last_sync_at: string | null;
        last_error: string | null;
      }
    | undefined;

  try {
    row = await getDb()
      .selectFrom("google_calendar_connections")
      .selectAll()
      .where("user_id", "=", userId)
      .executeTakeFirst();
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {
        connected: false,
        googleAccountEmail: null,
        googleCalendarId: null,
        scope: null,
        connectedAt: null,
        lastSyncAt: null,
        lastError: "Google Calendar tables are not installed yet. Run db/migrations/004_integrations_ai_calendar_voice.sql.",
      };
    }

    throw error;
  }

  return {
    connected: Boolean(row?.google_calendar_id),
    googleAccountEmail: row?.google_account_email ?? null,
    googleCalendarId: row?.google_calendar_id ?? null,
    scope: row?.scope ?? null,
    connectedAt: row?.connected_at ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

export function createGoogleCalendarAuthUrl(userId: string) {
  const config = getGoogleConfig();
  if (!config) return null;

  const payload = Buffer.from(JSON.stringify({
    userId,
    nonce: randomBytes(12).toString("hex"),
  })).toString("base64url");
  const state = `${payload}.${signState(payload)}`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function completeGoogleCalendarConnection(code: string, state: string, expectedUserId: string) {
  const config = getGoogleConfig();
  if (!config) return { type: "error" as const, message: "google calendar is not configured." };

  let userId: string | null = null;
  try {
    const [payload, signature] = state.split(".");
    if (!payload || !signature || signState(payload) !== signature) {
      return { type: "error" as const, message: "google calendar state is invalid." };
    }
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string };
    userId = parsed.userId ?? null;
  } catch {
    return { type: "error" as const, message: "google calendar state is invalid." };
  }

  if (userId !== expectedUserId) {
    return { type: "error" as const, message: "google calendar state does not match this user." };
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      type: "error" as const,
      message: detail.slice(0, 400) || "could not connect google calendar.",
    };
  }

  const token = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!token.access_token) {
    return { type: "error" as const, message: "google did not return an access token." };
  }

  if (!token.refresh_token) {
    return { type: "error" as const, message: "google did not return an offline refresh token." };
  }

  await saveRefreshToken(expectedUserId, token.refresh_token);

  const calendar = await fetch(`${GOOGLE_CALENDAR_API}/calendars`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({
      summary: "alibi",
      description: "Time blocks created by Alibi.",
      timeZone: "UTC",
    }),
  });

  if (!calendar.ok) {
    const detail = await calendar.text().catch(() => "");
    return {
      type: "error" as const,
      message: detail.slice(0, 400) || "could not create the alibi google calendar.",
    };
  }

  const calendarData = await calendar.json() as { id?: string };

  await getDb()
    .insertInto("google_calendar_connections")
    .values({
      user_id: expectedUserId,
      google_calendar_id: calendarData.id ?? null,
      scope: token.scope ?? GOOGLE_CALENDAR_SCOPE,
      token_expires_at: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      last_error: null,
    })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        google_calendar_id: calendarData.id ?? null,
        scope: token.scope ?? GOOGLE_CALENDAR_SCOPE,
        token_expires_at: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();

  return { type: "connected" as const };
}

export async function syncTimeBlockToGoogleCalendar(userId: string, block: TimeBlock) {
  if (!block.ended_at) return { type: "skipped" as const };

  const connection = await getDb()
    .selectFrom("google_calendar_connections")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!connection?.google_calendar_id) return { type: "skipped" as const };

  const contentHash = blockEventHash(block);
  const existing = await getDb()
    .selectFrom("google_calendar_event_syncs")
    .selectAll()
    .where("user_id", "=", userId)
    .where("time_block_id", "=", block.id)
    .executeTakeFirst();

  if (existing?.sync_status === "synced" && existing.content_hash === contentHash) {
    return { type: "synced" as const };
  }

  const payload = eventPayloadForBlock(block);
  const result = existing?.google_event_id
    ? await googleFetch<{ id: string }>(
        userId,
        `/calendars/${encodeURIComponent(connection.google_calendar_id)}/events/${encodeURIComponent(existing.google_event_id)}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      )
    : await googleFetch<{ id: string }>(
        userId,
        `/calendars/${encodeURIComponent(connection.google_calendar_id)}/events`,
        { method: "POST", body: JSON.stringify(payload) },
      );

  if (!result.ok) {
    await getDb()
      .insertInto("google_calendar_event_syncs")
      .values({
        user_id: userId,
        time_block_id: block.id,
        google_event_id: existing?.google_event_id ?? null,
        content_hash: contentHash,
        sync_status: "failed",
        last_error: result.message,
      })
      .onConflict((oc) =>
        oc.columns(["user_id", "time_block_id"]).doUpdateSet({
          content_hash: contentHash,
          sync_status: "failed",
          last_error: result.message,
          updated_at: new Date().toISOString(),
        }),
      )
      .execute();
    return { type: "error" as const, message: result.message };
  }

  await getDb()
    .insertInto("google_calendar_event_syncs")
    .values({
      user_id: userId,
      time_block_id: block.id,
      google_event_id: result.data.id,
      content_hash: contentHash,
      sync_status: "synced",
      last_error: null,
      synced_at: new Date().toISOString(),
    })
    .onConflict((oc) =>
      oc.columns(["user_id", "time_block_id"]).doUpdateSet({
        google_event_id: result.data.id,
        content_hash: contentHash,
        sync_status: "synced",
        last_error: null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();

  await getDb()
    .updateTable("google_calendar_connections")
    .set({ last_sync_at: new Date().toISOString(), last_error: null })
    .where("user_id", "=", userId)
    .execute();

  return { type: "synced" as const };
}

export async function deleteTimeBlockFromGoogleCalendar(userId: string, timeBlockId: string) {
  const row = await getDb()
    .selectFrom("google_calendar_event_syncs")
    .selectAll()
    .where("user_id", "=", userId)
    .where("time_block_id", "=", timeBlockId)
    .executeTakeFirst();

  if (!row?.google_event_id) return { type: "skipped" as const };

  const connection = await getDb()
    .selectFrom("google_calendar_connections")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!connection?.google_calendar_id) return { type: "skipped" as const };

  const result = await googleFetch<null>(
    userId,
    `/calendars/${encodeURIComponent(connection.google_calendar_id)}/events/${encodeURIComponent(row.google_event_id)}`,
    { method: "DELETE" },
  );

  await getDb()
    .updateTable("google_calendar_event_syncs")
    .set({
      sync_status: result.ok ? "deleted" : "failed",
      last_error: result.ok ? null : result.message,
      updated_at: new Date().toISOString(),
    })
    .where("user_id", "=", userId)
    .where("time_block_id", "=", timeBlockId)
    .execute();

  return result.ok ? { type: "deleted" as const } : { type: "error" as const, message: result.message };
}
