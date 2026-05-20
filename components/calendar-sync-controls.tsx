"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Loader2, RotateCcw } from "lucide-react";
import { retryGoogleCalendarSync } from "@/app/actions/calendar-sync";
import type { GoogleCalendarConnectionSnapshot } from "@/lib/google-calendar";

export function CalendarSyncControls({
  connection,
}: {
  connection: GoogleCalendarConnectionSnapshot;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(connection.lastError);
  const [isPending, startTransition] = useTransition();

  function handleConnect() {
    setError(null);
    setMessage(null);
    window.location.assign("/api/google/calendar/connect");
  }

  function handleRetry() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await retryGoogleCalendarSync();
      setMessage(`synced ${result.synced} block${result.synced === 1 ? "" : "s"}${result.failed ? `, ${result.failed} failed` : ""}.`);
      if (result.firstError) {
        setError(result.firstError);
      }
    });
  }

  return (
    <section className="alibi-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            google calendar
          </p>
          <h2 className="mt-1 text-lg font-black text-alibi-blue">
            {connection.connected ? "alibi calendar connected" : "sync to an alibi calendar"}
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-alibi-teal">
            {connection.connected
              ? `calendar id: ${connection.googleCalendarId}`
              : "creates a separate Google calendar and syncs completed time blocks."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleConnect}
            disabled={isPending}
            className="alibi-button-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {connection.connected ? "reconnect" : "connect"}
          </button>
          {connection.connected && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isPending}
              className="alibi-button-secondary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
            >
              <RotateCcw className="h-4 w-4" />
              retry sync
            </button>
          )}
        </div>
      </div>
      {message && <div className="alibi-banner-info mt-4">{message}</div>}
      {error && <div className="alibi-banner-error mt-4">{error}</div>}
    </section>
  );
}
