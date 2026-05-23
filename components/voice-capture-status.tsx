"use client";

import { Loader2 } from "lucide-react";
import type { VoiceCaptureStatus } from "@/lib/use-voice-capture";
import { cn } from "@/lib/utils";

type VoiceCaptureStatusRowProps = {
  status: VoiceCaptureStatus;
  durationMs: number;
  audioLevel: number;
  lastTranscript: string;
  error: string | null;
  registeredLabel?: string;
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

export function VoiceCaptureStatusRow({
  status,
  durationMs,
  audioLevel,
  lastTranscript,
  error,
  registeredLabel = "registered",
}: VoiceCaptureStatusRowProps) {
  if (status === "idle") return null;

  if (status === "error") {
    return (
      <div role="alert" aria-live="polite" className="alibi-banner-error mt-3">
        {error ?? "voice capture failed."}
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
