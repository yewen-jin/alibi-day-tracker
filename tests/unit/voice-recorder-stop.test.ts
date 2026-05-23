import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  stopActiveVoiceRecorder,
  type VoiceStopRecorder,
} from "@/lib/voice-recorder-stop";
import type { VoiceCaptureStatus } from "@/lib/use-voice-capture";

function createRecorder(
  overrides: Partial<VoiceStopRecorder> = {},
): VoiceStopRecorder {
  return {
    state: "recording",
    requestData: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function createStopHarness({
  recorder = createRecorder(),
  stopRequested = false,
}: {
  recorder?: VoiceStopRecorder | null;
  stopRequested?: boolean;
} = {}) {
  const statuses: VoiceCaptureStatus[] = [];
  const errors: string[] = [];
  const setStopWatchdog = vi.fn();
  const cleanupCapture = vi.fn();
  const clearStopWatchdog = vi.fn();
  const markStopRequested = vi.fn();

  const stop = () =>
    stopActiveVoiceRecorder({
      recorder,
      stopRequested,
      mounted: true,
      watchdogMs: 2_000,
      markStopRequested,
      setStatus: (status) => statuses.push(status),
      setError: (message) => errors.push(message),
      cleanupCapture,
      clearStopWatchdog,
      setStopWatchdog,
      setTimeoutFn: ((callback, delay) =>
        setTimeout(callback, delay)) as typeof window.setTimeout,
    });

  return {
    recorder,
    statuses,
    errors,
    setStopWatchdog,
    cleanupCapture,
    clearStopWatchdog,
    markStopRequested,
    stop,
  };
}

describe("stopActiveVoiceRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves out of recording immediately and stops the active recorder", () => {
    const harness = createStopHarness();

    harness.stop();

    expect(harness.statuses).toEqual(["transcribing"]);
    expect(harness.markStopRequested).toHaveBeenCalledOnce();
    expect(harness.recorder?.requestData).toHaveBeenCalledOnce();
    expect(harness.recorder?.stop).toHaveBeenCalledOnce();
    expect(harness.clearStopWatchdog).toHaveBeenCalledOnce();
    expect(harness.setStopWatchdog).toHaveBeenCalledOnce();
  });

  it("recovers if the browser never fires MediaRecorder.onstop", () => {
    const harness = createStopHarness();

    harness.stop();
    vi.advanceTimersByTime(2_000);

    expect(harness.cleanupCapture).toHaveBeenCalledOnce();
    expect(harness.errors).toEqual([
      "recording did not finalize — please try again.",
    ]);
    expect(harness.statuses).toEqual(["transcribing", "error"]);
  });

  it("ignores duplicate stop clicks while a stop is already pending", () => {
    const harness = createStopHarness({ stopRequested: true });

    harness.stop();

    expect(harness.statuses).toEqual([]);
    expect(harness.markStopRequested).not.toHaveBeenCalled();
    expect(harness.recorder?.requestData).not.toHaveBeenCalled();
    expect(harness.recorder?.stop).not.toHaveBeenCalled();
    expect(harness.setStopWatchdog).not.toHaveBeenCalled();
  });

  it("does not get stuck when there is no active recorder", () => {
    const harness = createStopHarness({ recorder: null });

    harness.stop();

    expect(harness.cleanupCapture).toHaveBeenCalledOnce();
    expect(harness.errors).toEqual(["recording stopped before audio was ready."]);
    expect(harness.statuses).toEqual(["error"]);
  });

  it("surfaces recorder stop failures as errors", () => {
    const recorder = createRecorder({
      stop: vi.fn(() => {
        throw new Error("stop failed");
      }),
    });
    const harness = createStopHarness({ recorder });

    harness.stop();

    expect(harness.cleanupCapture).toHaveBeenCalledOnce();
    expect(harness.errors).toEqual(["stop failed"]);
    expect(harness.statuses).toEqual(["transcribing", "error"]);
    expect(harness.setStopWatchdog).not.toHaveBeenCalled();
  });
});
