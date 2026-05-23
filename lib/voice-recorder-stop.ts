import type { VoiceCaptureStatus } from "@/lib/use-voice-capture";

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
}: StopActiveVoiceRecorderOptions) {
  debug?.("stopRecording called", {
    recorderState: recorder?.state,
    stopRequested,
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

    try {
      debug?.("recorder.requestData (pre-state)", recorder.state);
      recorder.requestData();
    } catch (error) {
      debug?.("recorder.requestData threw", error);
    }

    try {
      debug?.("recorder.stop (pre-state)", recorder.state);
      recorder.stop();
      debug?.("recorder.stop (post-state)", recorder.state);
    } catch (error) {
      debug?.("recorder.stop threw", error);
      cleanupCapture();
      if (mounted) {
        setError(error instanceof Error ? error.message : "failed to stop recording.");
        setStatus("error");
      }
      return;
    }

    clearStopWatchdog();
    const timerId = setTimeoutFn(() => {
      debug?.("stop watchdog fired — onstop did not arrive in time");
      cleanupCapture();
      if (mounted) {
        setError("recording did not finalize — please try again.");
        setStatus("error");
      }
    }, watchdogMs);
    setStopWatchdog(timerId);
    return;
  }

  debug?.("stopRecording: no active recorder, cleaning up");
  cleanupCapture();
  if (mounted) {
    setError("recording stopped before audio was ready.");
    setStatus("error");
  }
}
