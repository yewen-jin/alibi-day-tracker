import { redirect } from "next/navigation"
import { getCompanionThread } from "@/app/actions/process-message"
import { createClient } from "@/lib/supabase/server"
import type { TimeBlock, TimeBlockCategoryRecord } from "@/lib/types"
import { TopNav } from "@/components/top-nav"
import { CalendarWorkspace } from "@/components/calendar-workspace"

export default async function CalendarPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: timeBlocks } = await supabase
    .from("time_blocks")
    .select("*")
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })

  const { data: categories } = await supabase
    .from("time_block_categories")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })

  const companionThread = await getCompanionThread()

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 p-8">
        <TopNav userEmail={user.email ?? null} />

        <header className="px-2 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[1.9rem] font-black tracking-tight text-alibi-blue">
              calendar
            </h1>
            <span className="rounded-full bg-alibi-pink/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
              timeline workspace
            </span>
          </div>
          <p className="mt-1 text-base font-semibold leading-relaxed text-alibi-teal">
            scan days, inspect blocks, and reflect without leaving the timeline.
          </p>
        </header>

        <CalendarWorkspace
          initialBlocks={(timeBlocks ?? []) as TimeBlock[]}
          initialCategories={(categories ?? []) as TimeBlockCategoryRecord[]}
          initialCompanionThread={companionThread ?? undefined}
        />

        <footer className="text-center text-sm font-semibold tracking-[0.04em] text-alibi-teal">
          alibi — for the days you can&apos;t see clearly
        </footer>
      </div>
    </main>
  )
}
