import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";

const MAX_EVENTS = 200;
const MAX_ERROR_MESSAGE_LEN = 500;

const eventSchema = z.object({
  ts: z.number().int().nonnegative(),
  elapsed_ms: z.number().int().nonnegative(),
  phase: z.string().min(1).max(64),
  data: z.record(z.string(), z.unknown()).optional(),
});

const payloadSchema = z.object({
  session_id: z.string().uuid(),
  outcome: z.enum(["success", "error", "aborted"]),
  error_message: z.string().max(MAX_ERROR_MESSAGE_LEN).nullable().optional(),
  client_started_at: z.string().datetime(),
  client_finalized_at: z.string().datetime(),
  duration_ms: z.number().int().nonnegative(),
  session_meta: z.record(z.string(), z.unknown()).default({}),
  events: z.array(eventSchema).max(MAX_EVENTS),
});

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in." }, { status: 401 });
  }

  const rawText = await request.text().catch(() => "");
  const rawPayload = readJson(rawText);
  if (!rawPayload || typeof rawPayload !== "object") {
    return NextResponse.json({ error: "invalid payload." }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  const summary = {
    user_id: user.id,
    session_id: payload.session_id,
    outcome: payload.outcome,
    error_message: payload.error_message ?? null,
    duration_ms: payload.duration_ms,
    event_count: payload.events.length,
    phases: payload.events.map((e) => e.phase),
  };

  if (payload.outcome === "success") {
    console.info("[voice-telemetry]", summary);
  } else {
    console.error("[voice-telemetry]", summary);
  }

  try {
    await getDb()
      .insertInto("voice_capture_logs")
      .values({
        user_id: user.id,
        session_id: payload.session_id,
        outcome: payload.outcome,
        error_message: payload.error_message ?? null,
        client_started_at: payload.client_started_at,
        client_finalized_at: payload.client_finalized_at,
        duration_ms: payload.duration_ms,
        session_meta: payload.session_meta as never,
        events: payload.events as never,
        server_meta: {
          ip_country: request.headers.get("x-vercel-ip-country") ?? null,
          received_at: new Date().toISOString(),
        } as never,
      })
      .onConflict((oc) =>
        oc.columns(["user_id", "session_id"]).doUpdateSet({
          outcome: payload.outcome,
          error_message: payload.error_message ?? null,
          client_finalized_at: payload.client_finalized_at,
          duration_ms: payload.duration_ms,
          events: payload.events as never,
        }),
      )
      .execute();
  } catch (error) {
    console.error("[voice-telemetry] insert failed", {
      user_id: user.id,
      session_id: payload.session_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
