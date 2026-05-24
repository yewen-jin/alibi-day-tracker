import type { VoiceCaptureStatus } from "@/lib/use-voice-capture";
import type { VoiceTelemetrySession } from "@/lib/voice-telemetry";

export function voiceDebugLog(...args: unknown[]) {
  if (
    typeof window !== "undefined" &&
    window.localStorage.getItem("alibi:voice-debug") === "1"
  ) {
    console.debug("[voice]", ...args);
  }
}

export type VoiceStopRecorder = {
  state: RecordingState;
  requestData: () => void;
  stop: () => void;
};

type StopActiveVoiceRecorderOptions = {
  recorder: VoiceStopRecorder | null;
  stopRequested: boolean;
  mounted: boolean;
  watchdogMs: number;
  markStopRequested: () => void;
  setStatus: (status: VoiceCaptureStatus) => void;
  setError: (message: string) => void;
  cleanupCapture: () => void;
  clearStopWatchdog: () => void;
  setStopWatchdog: (timerId: number) => void;
  setTimeoutFn?: typeof window.setTimeout;
  debug?: (...args: unknown[]) => void;
  telemetry?: VoiceTelemetrySession | null;
  onWatchdog?: (errorMessage: string) => void;
  skipRequestData?: boolean;
};

export function stopActiveVoiceRecorder({
  recorder,
  stopRequested,
  mounted,
  watchdogMs,
  markStopRequested,
  setStatus,
  setError,
  cleanupCapture,
  clearStopWatchdog,
  setStopWatchdog,
  setTimeoutFn = window.setTimeout,
  debug,
  telemetry,
  onWatchdog,
  skipRequestData = false,
}: StopActiveVoiceRecorderOptions) {
  debug?.("stopRecording called", {
    recorderState: recorder?.state,
    stopRequested,
  });
  telemetry?.event("stop_requested", {
    recorder_state: recorder?.state ?? null,
    already_stopping: stopRequested,
    mounted,
  });

  if (stopRequested) {
    debug?.("stopRecording: already stopping, ignored");
    return;
  }

  if (recorder && recorder.state !== "inactive") {
    markStopRequested();
    if (mounted) {
      setStatus("transcribing");
    }

    if (skipRequestData) {
      telemetry?.event("requestData_called", {
        state: recorder.state,
        skipped: true,
      });
    } else {
      try {
        debug?.("recorder.requestData (pre-state)", recorder.state);
        recorder.requestData();
        telemetry?.event("requestData_called", { state: recorder.state });
      } catch (error) {
        debug?.("recorder.requestData threw", error);
        telemetry?.event("requestData_called", {
          state: recorder.state,
          threw: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      debug?.("recorder.stop (pre-state)", recorder.state);
      recorder.stop();
      debug?.("recorder.stop (post-state)", recorder.state);
      telemetry?.event("recorder_stop_called", { post_state: recorder.state });
    } catch (error) {
      debug?.("recorder.stop threw", error);
      const message =
        error instanceof Error ? error.message : "failed to stop recording.";
      telemetry?.event("recorder_stop_called", {
        threw: message,
      });
      cleanupCapture();
      if (mounted) {
        setError(message);
        setStatus("error");
        telemetry?.event("user_facing_error", {
          source: "recorder.stop",
          message,
        });
      }
      telemetry?.finalize("error", message);
      return;
    }

    clearStopWatchdog();
    const timerId = setTimeoutFn(() => {
      debug?.("stop watchdog fired — onstop did not arrive in time");
      telemetry?.event("stop_watchdog_fired", {
        watchdog_ms: watchdogMs,
        recorder_state: recorder?.state ?? null,
      });
      cleanupCapture();
      const message = "recording did not finalize — please try again.";
      if (mounted) {
        setError(message);
        setStatus("error");
        telemetry?.event("user_facing_error", {
          source: "stop_watchdog",
          message,
        });
      }
      onWatchdog?.(message);
      telemetry?.finalize("error", message);
    }, watchdogMs);
    setStopWatchdog(timerId);
    return;
  }

  debug?.("stopRecording: no active recorder, cleaning up");
  telemetry?.event("recorder_stop_called", {
    no_active_recorder: true,
    state: recorder?.state ?? null,
  });
  cleanupCapture();
  const message = "recording stopped before audio was ready.";
  if (mounted) {
    setError(message);
    setStatus("error");
    telemetry?.event("user_facing_error", {
      source: "no_active_recorder",
      message,
    });
  }
  telemetry?.finalize("error", message);
}
