"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { Loader2, Pencil, WandSparkles, X } from "lucide-react"
import { VoiceTextarea } from "@/components/dashboard/voice-textarea"

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="alibi-button-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
      {pending ? "saving" : label}
    </button>
  )
}

function RenameButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="alibi-button-secondary inline-flex h-10 w-full items-center justify-center gap-2 px-4 text-sm font-black md:w-auto"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
      {pending ? "saving" : "save title"}
    </button>
  )
}

function UpdateTextarea() {
  const { pending } = useFormStatus()

  return (
    <VoiceTextarea
      name="update"
      required
      disabled={pending}
      minLength={8}
      maxLength={1000}
      rows={2}
      className="alibi-input py-3 text-sm font-semibold leading-6 disabled:opacity-55"
      placeholder="make this a category chart with source-backed observations, or replace the source panel with pattern cards"
      voiceLabel="dictate dashboard update"
      trailingAction={<SaveButton label="update view" />}
    />
  )
}

export function CustomViewEditForm({
  title,
  description,
  renameAction,
  updateAction,
}: {
  title: string
  description: string | null
  renameAction: (formData: FormData) => void | Promise<void>
  updateAction: (formData: FormData) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="alibi-button-secondary inline-flex h-10 w-full items-center justify-center gap-2 px-4 text-sm font-black sm:w-auto"
      >
        <Pencil className="h-4 w-4" />
        edit
      </button>
    )
  }

  return (
    <div className="alibi-inset col-span-full w-full space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-alibi-blue">edit dashboard</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-teal hover:text-white"
          aria-label="close dashboard editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form action={renameAction} className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="space-y-1">
          <span className="alibi-label">title</span>
          <input
            name="title"
            required
            minLength={1}
            maxLength={80}
            defaultValue={title}
            className="alibi-input h-10 w-full text-sm font-semibold"
          />
        </label>
        <label className="space-y-1">
          <span className="alibi-label">description</span>
          <input
            name="description"
            maxLength={220}
            defaultValue={description ?? ""}
            placeholder="optional"
            className="alibi-input h-10 w-full text-sm font-semibold"
          />
        </label>
        <RenameButton />
      </form>

      <form action={updateAction} className="space-y-3">
        <UpdateTextarea />
      </form>
    </div>
  )
}
