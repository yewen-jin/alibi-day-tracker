"use client"

import { useEffect, useRef } from "react"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { Mic, Square } from "lucide-react"
import { VoiceCaptureStatusRow } from "@/components/voice-capture-status"
import { useVoiceCapture } from "@/lib/use-voice-capture"
import { voiceDebugLog } from "@/lib/voice-recorder-stop"
import { cn } from "@/lib/utils"

type VoiceTextareaProps = ComponentPropsWithoutRef<"textarea"> & {
  voiceLabel?: string
  trailingAction?: ReactNode
}

function transcriptWithSpacing(
  current: string,
  start: number,
  end: number,
  transcript: string,
) {
  const before = current.slice(0, start)
  const after = current.slice(end)
  const lead = before && !/\s$/.test(before) ? " " : ""
  const trail = after && !/^\s/.test(after) ? " " : ""

  return `${lead}${transcript}${trail}`
}

export function VoiceTextarea({
  className,
  disabled,
  voiceLabel = "dictate prompt",
  trailingAction,
  ...props
}: VoiceTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const {
    status,
    durationMs,
    audioLevel,
    lastTranscript,
    error,
    startRecording,
    stopRecording,
    resetVoiceState,
  } = useVoiceCapture({ fileName: "alibi-dashboard-dictation.webm" })

  const recording = status === "recording"
  const voiceBusy =
    status === "requesting" || status === "recording" || status === "transcribing"

  function insertTranscript(transcript: string) {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length
    const insertion = transcriptWithSpacing(textarea.value, start, end, transcript)

    textarea.focus()
    textarea.setRangeText(insertion, start, end, "end")
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  }

  useEffect(() => {
    if (status !== "registered" || !lastTranscript) return

    insertTranscript(lastTranscript)
    const resetTimer = window.setTimeout(() => {
      resetVoiceState()
    }, 1800)

    return () => {
      window.clearTimeout(resetTimer)
    }
  }, [lastTranscript, resetVoiceState, status])

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        disabled={disabled}
        className={cn("block w-full", className)}
        {...props}
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            voiceDebugLog("mic click (dashboard)", {
              status,
              recording,
              disabled,
            })
            if (recording) {
              stopRecording()
            } else {
              void startRecording()
            }
          }}
          disabled={disabled || (voiceBusy && !recording)}
          aria-label={recording ? "stop dictation" : voiceLabel}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center px-0",
            recording ? "alibi-button-stop" : "alibi-button-secondary",
          )}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        {trailingAction}
      </div>
      <VoiceCaptureStatusRow
        status={status}
        durationMs={durationMs}
        audioLevel={audioLevel}
        lastTranscript={lastTranscript}
        error={error}
        registeredLabel="inserted"
      />
    </div>
  )
}
