"use client";

export type VoiceTelemetryPhase =
  | "start_requested"
  | "mic_granted"
  | "recorder_started"
  | "ondataavailable"
  | "stop_requested"
  | "requestData_called"
  | "recorder_stop_called"
  | "onstop_fired"
  | "stop_watchdog_fired"
  | "blob_assembled"
  | "transcribe_request"
  | "transcribe_response"
  | "transcribe_error"
  | "transcribe_success"
  | "user_facing_error"
  | "cleanup"
  | "unmount";

export type VoiceTelemetryOutcome = "success" | "error" | "aborted";

export type VoiceTelemetryEvent = {
  ts: number;
  elapsed_ms: number;
  phase: VoiceTelemetryPhase;
  data?: Record<string, unknown>;
};

export type VoiceTelemetrySession = {
  sessionId: string;
  event: (phase: VoiceTelemetryPhase, data?: Record<string, unknown>) => void;
  finalize: (outcome: VoiceTelemetryOutcome, errorMessage?: string | null) => void;
  getEvents: () => VoiceTelemetryEvent[];
  getSessionMeta: () => Record<string, unknown>;
};

const TELEMETRY_ENDPOINT = "/api/voice/telemetry";
const MAX_EVENTS = 200;

function generateSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Fallback: time-prefixed pseudo-uuid. Good enough for diagnostics.
  const rnd = Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rnd}-${rnd}`;
}

function isMimeTypeSupported(mime: string): boolean {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return false;
  }
  try {
    return MediaRecorder.isTypeSupported(mime);
  } catch {
    return false;
  }
}

function collectSessionMeta(): Record<string, unknown> {
  if (typeof window === "undefined") return {};

  const nav = typeof navigator !== "undefined" ? navigator : null;

  return {
    user_agent: nav?.userAgent ?? null,
    language: nav?.language ?? null,
    languages: nav?.languages ? Array.from(nav.languages).slice(0, 4) : null,
    platform: nav?.platform ?? null,
    has_media_devices: Boolean(nav?.mediaDevices?.getUserMedia),
    has_media_recorder: typeof MediaRecorder !== "undefined",
    media_recorder_types: {
      webm: isMimeTypeSupported("audio/webm"),
      webm_opus: isMimeTypeSupported("audio/webm;codecs=opus"),
      mp4: isMimeTypeSupported("audio/mp4"),
      ogg: isMimeTypeSupported("audio/ogg"),
      ogg_opus: isMimeTypeSupported("audio/ogg;codecs=opus"),
    },
    viewport: {
      width: typeof window.innerWidth === "number" ? window.innerWidth : null,
      height: typeof window.innerHeight === "number" ? window.innerHeight : null,
    },
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null,
    page_url: window.location?.href ?? null,
  };
}

function shouldMirrorToConsole(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage?.getItem("alibi:voice-debug") === "1"
    );
  } catch {
    return false;
  }
}

type TelemetryPayload = {
  session_id: string;
  outcome: VoiceTelemetryOutcome;
  error_message: string | null;
  client_started_at: string;
  client_finalized_at: string;
  duration_ms: number;
  session_meta: Record<string, unknown>;
  events: VoiceTelemetryEvent[];
};

function transport(payload: TelemetryPayload): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify(payload);

  // sendBeacon survives page navigation/unload but cannot send custom headers
  // beyond the blob's content-type, which is fine for our JSON endpoint.
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
      if (ok) return;
    } catch {
      // fall through to fetch
    }
  }

  try {
    void fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      // swallow; telemetry is best-effort
    });
  } catch {
    // last resort: drop
  }
}

export function createVoiceTelemetry(): VoiceTelemetrySession {
  const sessionId = generateSessionId();
  const startedAt = Date.now();
  const events: VoiceTelemetryEvent[] = [];
  const sessionMeta = collectSessionMeta();
  let finalized = false;

  const mirror = shouldMirrorToConsole();

  const event: VoiceTelemetrySession["event"] = (phase, data) => {
    if (finalized) return;
    if (events.length >= MAX_EVENTS) return;
    const entry: VoiceTelemetryEvent = {
      ts: Date.now(),
      elapsed_ms: Date.now() - startedAt,
      phase,
      data,
    };
    events.push(entry);
    if (mirror) {
      // eslint-disable-next-line no-console
      console.debug("[voice]", phase, data ?? {});
    }
  };

  const finalize: VoiceTelemetrySession["finalize"] = (outcome, errorMessage) => {
    if (finalized) return;
    finalized = true;
    const finishedAt = Date.now();
    const payload: TelemetryPayload = {
      session_id: sessionId,
      outcome,
      error_message: errorMessage ?? null,
      client_started_at: new Date(startedAt).toISOString(),
      client_finalized_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      session_meta: sessionMeta,
      events,
    };
    if (mirror) {
      // eslint-disable-next-line no-console
      console.debug("[voice] finalize", payload);
    }
    transport(payload);
  };

  return {
    sessionId,
    event,
    finalize,
    getEvents: () => events.slice(),
    getSessionMeta: () => ({ ...sessionMeta }),
  };
}
