"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stopActiveVoiceRecorder, voiceDebugLog } from "@/lib/voice-recorder-stop";

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
const STOP_WATCHDOG_MS = 2_000;

const vlog = voiceDebugLog;

export function useVoiceCapture(options: VoiceCaptureOptions = {}) {
  const fileName = options.fileName ?? "alibi-voice.webm";
  const [status, setStatus] = useState<VoiceCaptureStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    clearDurationTimer();
    clearStopWatchdog();
    stopAudioAnalysis();
    stopTracks();
    startedAtRef.current = null;
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

  const transcribeAudio = useCallback(
    async (blob: Blob) => {
      if (!mountedRef.current) return;

      setStatus("transcribing");
      setError(null);

      const formData = new FormData();
      formData.set(
        "file",
        new File([blob], fileName, { type: blob.type || "audio/webm" }),
      );
      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, TRANSCRIPTION_TIMEOUT_MS);

      try {
        vlog("fetch /api/cartesia/stt", { bytes: blob.size, type: blob.type });
        const response = await fetch("/api/cartesia/stt", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        vlog("fetch response", response.status);
        const data = (await response.json().catch(() => null)) as {
          text?: string;
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(data?.error ?? "transcription failed.");
        }

        const transcript = data?.text?.trim();
        if (!transcript) {
          throw new Error("no speech was detected.");
        }

        if (mountedRef.current) {
          setLastTranscript(transcript);
          setStatus("registered");
        }
      } catch (transcriptionError) {
        vlog("fetch error", transcriptionError);
        if (mountedRef.current) {
          setError(
            transcriptionError instanceof DOMException &&
              transcriptionError.name === "AbortError"
              ? "transcription timed out."
              : transcriptionError instanceof Error
              ? transcriptionError.message
              : "transcription failed.",
          );
          setStatus("error");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [fileName],
  );

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
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
      setAudioLevel(Math.min(1, rms / 32));
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const startRecording = useCallback(async () => {
    if (status === "requesting" || status === "recording" || status === "transcribing") {
      return;
    }

    resetVoiceState();

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("microphone recording is not available in this browser.");
      setStatus("error");
      return;
    }

    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        vlog("ondataavailable", { size: event.data.size, state: recorder.state });
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        vlog("onstop", { chunks: chunksRef.current.length });
        cleanupCapture();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        if (blob.size > 0) {
          void transcribeAudio(blob);
        } else if (mountedRef.current) {
          setError("no audio was captured.");
          setStatus("error");
        }
      };

      vlog("recorder.start (pre-state)", recorder.state);
      recorder.start();
      vlog("recorder.start (post-state)", recorder.state);
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
      setError(
        recordingError instanceof Error
          ? recordingError.message
          : "microphone unavailable.",
      );
      setStatus("error");
    }
  }, [cleanupCapture, resetVoiceState, startAudioAnalysis, status, transcribeAudio]);

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
      cleanupCapture();
    };
  }, [cleanupCapture]);

  return {
    status,
    durationMs,
    audioLevel,
    lastTranscript,
    error,
    startRecording,
    stopRecording,
    resetVoiceState,
  };
}
