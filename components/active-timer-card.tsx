"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Clock, Loader2, Play, RefreshCw, Square } from "lucide-react";
import type { ActiveTimer } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  formatElapsed,
  formatTime,
  getElapsedSeconds,
} from "@/lib/time-block-display";

export function ActiveTimerCard({
  activeTimer,
  loading,
  pending,
  children,
  onStart,
  onStop,
  onRefresh,
}: {
  activeTimer: ActiveTimer | null;
  loading: boolean;
  pending: boolean;
  children?: ReactNode;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  const elapsed = now === null ? 0 : getElapsedSeconds(activeTimer, now);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="alibi-card-pop relative overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            active timer
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-normal text-alibi-blue sm:text-5xl">
            {formatElapsed(elapsed)}
          </h1>
        </div>
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl border",
            activeTimer
              ? "border-alibi-pink/25 bg-alibi-pink/15 text-alibi-pink"
              : "border-alibi-teal/20 bg-alibi-teal/10 text-alibi-teal",
          )}
        >
          <Clock className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {activeTimer ? (
          <button
            type="button"
            onClick={onStop}
            disabled={pending}
            className="alibi-button-stop inline-flex h-11 min-w-32 items-center justify-center gap-2 px-4 text-sm font-black"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={pending || loading}
            className="alibi-button-primary inline-flex h-11 min-w-32 items-center justify-center gap-2 text-sm"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            start
          </button>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={pending || loading}
          aria-label="refresh timer and blocks"
          title="refresh"
          className="alibi-button-secondary inline-flex h-11 w-11 items-center justify-center"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="relative mt-4 text-sm font-medium leading-6 text-alibi-teal">
        {activeTimer
          ? `running since ${formatTime(activeTimer.started_at)}`
          : "start when you begin, stop when the block is real."}
      </p>

      {children}
    </section>
  );
}
