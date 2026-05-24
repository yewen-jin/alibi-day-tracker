"use client";

import { Loader2 } from "lucide-react";
import type { VoiceCaptureStatus } from "@/lib/use-voice-capture";
import type { VoiceTelemetryEvent } from "@/lib/voice-telemetry";
import { cn } from "@/lib/utils";

type VoiceCaptureStatusRowProps = {
  status: VoiceCaptureStatus;
  durationMs: number;
  audioLevel: number;
  lastTranscript: string;
  error: string | null;
  registeredLabel?: string;
  sessionId?: string | null;
  getRecentEvents?: () => VoiceTelemetryEvent[];
};

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function AudioLevelBars({ audioLevel }: { audioLevel: number }) {
  const activeBars = Math.ceil(audioLevel * 5);
  const bars = ["h-2", "h-3", "h-4", "h-3", "h-2"];

  return (
    <span aria-hidden className="inline-flex h-5 items-center gap-0.5">
      {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={cn(
            "w-1 rounded-full bg-alibi-lavender transition-all",
            height,
            index < activeBars ? "opacity-100" : "opacity-35",
          )}
        />
      ))}
    </span>
  );
}

function VoiceDiagnostics({
  sessionId,
  getRecentEvents,
}: {
  sessionId?: string | null;
  getRecentEvents?: () => VoiceTelemetryEvent[];
}) {
  if (!sessionId && !getRecentEvents) return null;

  const events = getRecentEvents?.() ?? [];
  const recent = events.slice(-12);

  async function copyDiagnostics() {
    try {
      const payload = {
        session_id: sessionId ?? null,
        captured_at: new Date().toISOString(),
        events,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      // ignore — clipboard may be unavailable
    }
  }

  return (
    <details className="mt-2 text-xs opacity-80">
      <summary className="cursor-pointer select-none">
        diagnostics{sessionId ? ` · session ${sessionId.slice(0, 8)}` : ""}
      </summary>
      <div className="mt-2 space-y-2">
        {sessionId && (
          <div className="font-mono text-[0.7rem] break-all">
            session: {sessionId}
          </div>
        )}
        {recent.length > 0 ? (
          <ol className="space-y-0.5 font-mono text-[0.7rem]">
            {recent.map((event, index) => (
              <li key={`${event.ts}-${index}`}>
                {String(event.elapsed_ms).padStart(5, " ")}ms · {event.phase}
                {event.data ? ` · ${JSON.stringify(event.data)}` : ""}
              </li>
            ))}
          </ol>
        ) : (
          <div className="font-mono text-[0.7rem]">no events captured</div>
        )}
        <button
          type="button"
          onClick={() => {
            void copyDiagnostics();
          }}
          className="alibi-button-secondary px-2 py-1 text-[0.7rem]"
        >
          copy diagnostics
        </button>
      </div>
    </details>
  );
}

export function VoiceCaptureStatusRow({
  status,
  durationMs,
  audioLevel,
  lastTranscript,
  error,
  registeredLabel = "registered",
  sessionId,
  getRecentEvents,
}: VoiceCaptureStatusRowProps) {
  if (status === "idle") return null;

  if (status === "error") {
    return (
      <div role="alert" aria-live="polite" className="alibi-banner-error mt-3">
        <div>{error ?? "voice capture failed."}</div>
        <VoiceDiagnostics
          sessionId={sessionId}
          getRecentEvents={getRecentEvents}
        />
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="alibi-banner-info mt-3 flex min-h-11 items-center gap-2"
    >
      {status === "requesting" && (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>requesting microphone...</span>
        </>
      )}
      {status === "recording" && (
        <>
          <span aria-hidden className="alibi-listen-dot h-2 w-2 rounded-full bg-alibi-teal" />
          <span>recording {formatDuration(durationMs)}</span>
          <AudioLevelBars audioLevel={audioLevel} />
        </>
      )}
      {status === "transcribing" && (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>transcribing voice...</span>
        </>
      )}
      {status === "registered" && (
        <span className="min-w-0 truncate">
          {registeredLabel}: &ldquo;{lastTranscript}&rdquo;
        </span>
      )}
    </div>
  );
}
