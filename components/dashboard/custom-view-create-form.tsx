"use client"

import { useOptimistic } from "react"
import { useFormStatus } from "react-dom"
import { Loader2, Sparkles } from "lucide-react"

function SubmitButton({ schemaReady }: { schemaReady: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={!schemaReady || pending}
      className="alibi-button-primary inline-flex h-11 items-center justify-center gap-2 self-end px-4 text-sm font-black"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {pending ? "drafting" : "draft view"}
    </button>
  )
}

function PromptTextarea({ schemaReady }: { schemaReady: boolean }) {
  const { pending } = useFormStatus()

  return (
    <textarea
      name="prompt"
      required={schemaReady}
      disabled={!schemaReady || pending}
      minLength={8}
      maxLength={800}
      rows={3}
      className="alibi-input min-h-24 py-3 text-sm font-semibold leading-6 disabled:opacity-55"
      placeholder="show me which kinds of work leave me satisfied, and include evidence from notes"
    />
  )
}

export function CustomViewCreateForm({
  action,
  schemaReady,
}: {
  action: (formData: FormData) => void | Promise<void>
  schemaReady: boolean
}) {
  const [optimisticPrompt, showOptimisticPrompt] = useOptimistic(
    null as string | null,
    (_current, next: string) => next,
  )

  async function createView(formData: FormData) {
    showOptimisticPrompt(String(formData.get("prompt") ?? "").trim())
    await action(formData)
  }

  return (
    <form action={createView} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <PromptTextarea schemaReady={schemaReady} />
        <SubmitButton schemaReady={schemaReady} />
      </div>
      {optimisticPrompt ? (
        <div
          aria-live="polite"
          className="alibi-banner-info flex items-start gap-3"
        >
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-alibi-teal" />
          <div>
            <p className="font-black text-alibi-blue">drafting dashboard view</p>
            <p className="mt-1 line-clamp-2">{optimisticPrompt}</p>
          </div>
        </div>
      ) : null}
    </form>
  )
}
