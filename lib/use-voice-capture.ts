"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stopActiveVoiceRecorder, voiceDebugLog } from "@/lib/voice-recorder-stop";
import {
  createVoiceTelemetry,
  type VoiceTelemetryEvent,
  type VoiceTelemetrySession,
} from "@/lib/voice-telemetry";

export type VoiceCaptureStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing"
  | "registered"
  | "error";

type VoiceCaptureOptions = {
  fileName?: string;
};

const TRANSCRIPTION_TIMEOUT_MS = 30_000;
const STOP_WATCHDOG_MS = 4_000;
const RECORDER_TIMESLICE_MS = 1_000;
const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function detectIsIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports MacIntel + touch points.
  return platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function detectIsSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
}

const vlog = voiceDebugLog;

function selectRecorderMimeType() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }

  return RECORDER_MIME_TYPES.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function audioFileName(baseName: string, mimeType: string) {
  const stem = baseName.replace(/\.[^.]+$/, "");
  if (mimeType.includes("mp4")) return `${stem}.mp4`;
  if (mimeType.includes("ogg")) return `${stem}.ogg`;
  if (mimeType.includes("wav")) return `${stem}.wav`;
  return `${stem}.webm`;
}

export function useVoiceCapture(options: VoiceCaptureOptions = {}) {
  const fileName = options.fileName ?? "alibi-voice.webm";
  const [status, setStatus] = useState<VoiceCaptureStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const stopWatchdogRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);
  const maxAudioLevelRef = useRef(0);
  const telemetryRef = useRef<VoiceTelemetrySession | null>(null);
  const lastEventsRef = useRef<VoiceTelemetryEvent[]>([]);

  useEffect(() => {
    vlog("status →", status);
  }, [status]);

  const clearStopWatchdog = useCallback(() => {
    if (stopWatchdogRef.current !== null) {
      window.clearTimeout(stopWatchdogRef.current);
      stopWatchdogRef.current = null;
    }
  }, []);

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;
    if (mountedRef.current) {
      setAudioLevel(0);
    }

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const cleanupCapture = useCallback(() => {
    vlog("cleanupCapture");
    telemetryRef.current?.event("cleanup");
    clearDurationTimer();
    clearStopWatchdog();
    stopAudioAnalysis();
    stopTracks();
    startedAtRef.current = null;
    maxAudioLevelRef.current = 0;
    mediaRecorderRef.current = null;
    stopRequestedRef.current = false;
  }, [clearDurationTimer, clearStopWatchdog, stopAudioAnalysis, stopTracks]);

  const resetVoiceState = useCallback(() => {
    setStatus("idle");
    setDurationMs(0);
    setAudioLevel(0);
    setLastTranscript("");
    setError(null);
  }, []);

  const finalizeTelemetry = useCallback(
    (outcome: "success" | "error" | "aborted", errorMessage?: string | null) => {
      const session = telemetryRef.current;
      if (!session) return;
      lastEventsRef.current = session.getEvents();
      session.finalize(outcome, errorMessage);
      telemetryRef.current = null;
    },
    [],
  );

  const reportUserFacingError = useCallback(
    (source: string, message: string) => {
      const session = telemetryRef.current;
      if (!session) return;
      session.event("user_facing_error", { source, message });
    },
    [],
  );

  const transcribeAudio = useCallback(
    async (blob: Blob) => {
      if (!mountedRef.current) {
        finalizeTelemetry("aborted", "unmounted before transcription");
        return;
      }

      setStatus("transcribing");
      setError(null);

      const formData = new FormData();
      const uploadType = blob.type || "audio/webm";
      const uploadName = audioFileName(fileName, uploadType);
      formData.set(
        "file",
        new File([blob], uploadName, { type: uploadType }),
      );
      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, TRANSCRIPTION_TIMEOUT_MS);

      const requestStart = Date.now();
      telemetryRef.current?.event("transcribe_request", {
        bytes: blob.size,
        type: uploadType,
        file_name: uploadName,
      });

      try {
        vlog("fetch /api/cartesia/stt", {
          bytes: blob.size,
          type: uploadType,
          fileName: uploadName,
        });
        const response = await fetch("/api/cartesia/stt", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        vlog("fetch response", response.status);

        const rawText = await response.text().catch(() => "");
        let parsed: { text?: string; error?: string } | null = null;
        try {
          parsed = rawText ? (JSON.parse(rawText) as { text?: string; error?: string }) : null;
        } catch {
          parsed = null;
        }

        telemetryRef.current?.event("transcribe_response", {
          status: response.status,
          ok: response.ok,
          elapsed_ms: Date.now() - requestStart,
          parse_failed: !parsed && Boolean(rawText),
          has_text: Boolean(parsed?.text?.trim()),
          text_length: parsed?.text?.length ?? 0,
          error_excerpt: parsed?.error ?? (response.ok ? null : rawText.slice(0, 400) || null),
        });

        if (!response.ok) {
          throw new Error(parsed?.error ?? "transcription failed.");
        }

        const transcript = parsed?.text?.trim();
        if (!transcript) {
          throw new Error("no speech was detected.");
        }

        if (mountedRef.current) {
          setLastTranscript(transcript);
          setStatus("registered");
        }
        telemetryRef.current?.event("transcribe_success", {
          length: transcript.length,
        });
        finalizeTelemetry("success");
      } catch (transcriptionError) {
        vlog("fetch error", transcriptionError);
        const aborted =
          transcriptionError instanceof DOMException &&
          transcriptionError.name === "AbortError";
        const message = aborted
          ? "transcription timed out."
          : transcriptionError instanceof Error
          ? transcriptionError.message
          : "transcription failed.";
        telemetryRef.current?.event("transcribe_error", {
          aborted,
          name:
            transcriptionError instanceof Error ? transcriptionError.name : "unknown",
          message,
          elapsed_ms: Date.now() - requestStart,
        });
        if (mountedRef.current) {
          setError(message);
          setStatus("error");
          reportUserFacingError("transcribe", message);
        }
        finalizeTelemetry("error", message);
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [fileName, finalizeTelemetry, reportUserFacingError],
  );

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    // On iOS Safari, attaching a MediaStreamAudioSource to the same MediaStream
    // that a MediaRecorder is consuming silently steals the audio data — the
    // recorder produces zero-byte chunks. On other Safari builds we clone the
    // stream defensively. Other browsers can share the original stream.
    if (detectIsIos()) return;

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) return;

    let analysisStream: MediaStream | null = null;
    try {
      analysisStream = detectIsSafari()
        ? new MediaStream(stream.getAudioTracks().map((track) => track.clone()))
        : stream;
    } catch {
      analysisStream = stream;
    }

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContextConstructor();
    } catch {
      // Some browsers throw if a user gesture hasn't unlocked audio yet.
      return;
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {
        // Recording can still proceed if level feedback is unavailable.
      });
    }
    let source: MediaStreamAudioSourceNode;
    try {
      source = audioContext.createMediaStreamSource(analysisStream);
    } catch {
      void audioContext.close().catch(() => {});
      return;
    }
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);

      let total = 0;
      for (const sample of samples) {
        const centered = sample - 128;
        total += centered * centered;
      }

      const rms = Math.sqrt(total / samples.length);
      const level = Math.min(1, rms / 32);
      maxAudioLevelRef.current = Math.max(maxAudioLevelRef.current, level);
      setAudioLevel(level);
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const startRecording = useCallback(async () => {
    if (status === "requesting" || status === "recording" || status === "transcribing") {
      return;
    }

    resetVoiceState();

    // Each recording attempt is its own telemetry session. If a previous one
    // somehow wasn't finalized (defensive), drop it as aborted.
    if (telemetryRef.current) {
      finalizeTelemetry("aborted", "superseded by new recording");
    }

    const telemetry = createVoiceTelemetry();
    telemetryRef.current = telemetry;
    lastEventsRef.current = [];
    setSessionId(telemetry.sessionId);

    const isIos = detectIsIos();
    const isSafari = detectIsSafari();

    telemetry.event("start_requested", {
      has_media_devices: Boolean(navigator.mediaDevices?.getUserMedia),
      has_media_recorder: typeof MediaRecorder !== "undefined",
      selected_mime_type: selectRecorderMimeType() ?? null,
      is_ios: isIos,
      is_safari: isSafari,
    });

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      const message = "microphone recording is not available in this browser.";
      setError(message);
      setStatus("error");
      reportUserFacingError("preflight", message);
      finalizeTelemetry("error", message);
      return;
    }

    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      telemetry.event("mic_granted", {
        track_count: stream.getAudioTracks().length,
        track_labels: stream.getAudioTracks().map((t) => t.label).slice(0, 3),
      });
      const selectedMimeType = selectRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        selectedMimeType ? { mimeType: selectedMimeType } : undefined,
      );

      chunksRef.current = [];
      maxAudioLevelRef.current = 0;
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        vlog("ondataavailable", { size: event.data.size, state: recorder.state });
        telemetryRef.current?.event("ondataavailable", {
          size: event.data.size,
          type: event.data.type || null,
          state: recorder.state,
        });
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        vlog("onstop", { chunks: chunksRef.current.length });
        const chunkCount = chunksRef.current.length;
        const totalBytes = chunksRef.current.reduce((sum, c) => sum + c.size, 0);
        const mimeType = recorder.mimeType || "audio/webm";
        const recordedMs =
          startedAtRef.current !== null ? Date.now() - startedAtRef.current : null;
        const maxAudioLevel = maxAudioLevelRef.current;
        telemetryRef.current?.event("onstop_fired", {
          chunk_count: chunkCount,
          total_bytes: totalBytes,
          mime_type: mimeType,
          recorded_ms: recordedMs,
          max_audio_level: maxAudioLevel,
        });

        cleanupCapture();
        const blob = new Blob(chunksRef.current, {
          type: mimeType,
        });
        telemetryRef.current?.event("blob_assembled", {
          bytes: blob.size,
          type: blob.type || null,
          max_audio_level: maxAudioLevel,
        });

        if (blob.size > 0) {
          void transcribeAudio(blob);
        } else {
          const message = "no audio was captured.";
          if (mountedRef.current) {
            setError(message);
            setStatus("error");
            reportUserFacingError("empty_blob", message);
          }
          finalizeTelemetry("error", message);
        }
      };

      vlog("recorder.start (pre-state)", recorder.state);
      // Pass a timeslice so the recorder emits ondataavailable periodically.
      // Without it, Safari/iOS sometimes never emits chunks for short
      // recordings (or emits them after stop has already returned), which
      // surfaces as "no audio was captured."
      recorder.start(RECORDER_TIMESLICE_MS);
      vlog("recorder.start (post-state)", recorder.state);
      telemetry.event("recorder_started", {
        state: recorder.state,
        selected_mime_type: selectedMimeType ?? null,
        mime_type: recorder.mimeType || null,
        timeslice_ms: RECORDER_TIMESLICE_MS,
        is_ios: isIos,
        is_safari: isSafari,
      });
      startedAtRef.current = Date.now();
      setStatus("recording");
      setDurationMs(0);
      startAudioAnalysis(stream);
      durationTimerRef.current = window.setInterval(() => {
        if (startedAtRef.current !== null) {
          setDurationMs(Date.now() - startedAtRef.current);
        }
      }, 250);
    } catch (recordingError) {
      cleanupCapture();
      const message =
        recordingError instanceof Error
          ? recordingError.message
          : "microphone unavailable.";
      setError(message);
      setStatus("error");
      telemetry.event("transcribe_error", {
        source: "getUserMedia_or_recorder_start",
        name:
          recordingError instanceof Error ? recordingError.name : "unknown",
        message,
      });
      reportUserFacingError("getUserMedia", message);
      finalizeTelemetry("error", message);
    }
  }, [
    cleanupCapture,
    finalizeTelemetry,
    reportUserFacingError,
    resetVoiceState,
    startAudioAnalysis,
    status,
    transcribeAudio,
  ]);

  const stopRecording = useCallback(() => {
    stopActiveVoiceRecorder({
      recorder: mediaRecorderRef.current,
      stopRequested: stopRequestedRef.current,
      mounted: mountedRef.current,
      watchdogMs: STOP_WATCHDOG_MS,
      markStopRequested: () => {
        stopRequestedRef.current = true;
      },
      setStatus,
      setError,
      cleanupCapture,
      clearStopWatchdog,
      setStopWatchdog: (timerId) => {
        stopWatchdogRef.current = timerId;
      },
      debug: vlog,
      telemetry: telemetryRef.current,
      // On iOS Safari, requestData() immediately before stop() can drop the
      // final audio buffer. stop() flushes the in-progress chunk on its own.
      skipRequestData: detectIsIos(),
      onWatchdog: () => {
        // Watchdog already finalized telemetry inside the helper; clear ref so
        // the next start gets a fresh session.
        lastEventsRef.current = telemetryRef.current?.getEvents() ?? lastEventsRef.current;
        telemetryRef.current = null;
      },
    });
  }, [cleanupCapture, clearStopWatchdog]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      if (telemetryRef.current) {
        telemetryRef.current.event("unmount", {
          recorder_state: recorder?.state ?? null,
        });
        finalizeTelemetry("aborted", "component unmounted");
      }
      cleanupCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRecentEvents = useCallback(() => {
    const live = telemetryRef.current?.getEvents();
    if (live && live.length > 0) return live;
    return lastEventsRef.current.slice();
  }, []);

  return {
    status,
    durationMs,
    audioLevel,
    lastTranscript,
    error,
    sessionId,
    startRecording,
    stopRecording,
    resetVoiceState,
    getRecentEvents,
  };
}
