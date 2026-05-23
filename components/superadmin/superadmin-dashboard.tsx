import Link from "next/link"
import {
  Activity,
  Blocks,
  Clock3,
  MessageSquare,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserPlus,
  Users,
} from "lucide-react"
import { TopNav } from "@/components/top-nav"
import type {
  SuperadminOverview,
  SuperadminUserUsageRow,
} from "@/lib/types"

interface SuperadminDashboardProps {
  overview: SuperadminOverview
  users: SuperadminUserUsageRow[]
  windowOptions: readonly number[]
}

interface SuperadminAccessDeniedProps {}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatCount(value: number) {
  return value.toLocaleString("en-US")
}

function formatHours(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  })
}

function formatDateTime(value: string | null) {
  if (!value) return "none"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"

  return dateFormatter.format(date)
}

export function SuperadminAccessDenied(_: SuperadminAccessDeniedProps) {
  return (
    <main className="alibi-page px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6">
        <TopNav activeHref="/app/superadmin" />

        <section className="alibi-card-pop flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <ShieldAlert className="mb-5 h-10 w-10 text-alibi-pink" strokeWidth={2.2} />
          <p className="alibi-label">restricted</p>
          <h1 className="mt-3 text-[1.8rem] font-black tracking-tight text-alibi-blue">
            superadmin only
          </h1>
          <p className="mt-3 max-w-md text-base font-semibold leading-relaxed text-alibi-teal">
            This account is signed in, but it is not promoted in the app user registry.
          </p>
          <Link
            href="/app"
            className="alibi-button-primary mt-7 inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
          >
            <Clock3 className="h-4 w-4" strokeWidth={2.3} />
            tracker
          </Link>
        </section>
      </div>
    </main>
  )
}

export function SuperadminDashboard({
  overview,
  users,
  windowOptions,
}: SuperadminDashboardProps) {
  const metrics = [
    {
      label: "signed-up users",
      value: formatCount(overview.totalSignedUpUsers),
      detail: `${formatCount(overview.newUsersInWindow)} new in ${overview.windowDays}d`,
      icon: Users,
    },
    {
      label: "active users",
      value: formatCount(overview.activeUsersInWindow),
      detail: `time block, timer, or companion activity`,
      icon: Activity,
    },
    {
      label: "completed blocks",
      value: formatCount(overview.completedTimeBlocks),
      detail: `${formatHours(overview.loggedHours)} logged hours`,
      icon: Blocks,
    },
    {
      label: "active timers",
      value: formatCount(overview.activeTimers),
      detail: `currently running timers`,
      icon: Timer,
    },
    {
      label: "companion messages",
      value: formatCount(overview.companionMessages),
      detail: `${formatCount(overview.companionUserMessages)} user, ${formatCount(overview.companionAssistantMessages)} assistant`,
      icon: MessageSquare,
    },
    {
      label: "conversations",
      value: formatCount(overview.companionConversations),
      detail: `companion threads created`,
      icon: MessagesSquare,
    },
  ]

  return (
    <main className="alibi-page px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6">
        <TopNav activeHref="/app/superadmin" />

        <header className="px-2 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="alibi-label">superadmin</p>
              <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-alibi-blue">
                aggregate reporting
              </h1>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-alibi-pink/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
              no raw notes or chat
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-base font-semibold leading-relaxed text-alibi-teal">
            Cross-user usage totals from the app-owned user registry.
          </p>
        </header>

        <section className="alibi-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="alibi-label">window</p>
              <p className="mt-1 text-sm font-semibold text-alibi-teal">
                Since {formatDateTime(overview.windowStartedAt)}
              </p>
            </div>
            <nav aria-label="reporting window" className="flex flex-wrap gap-2">
              {windowOptions.map((days) => {
                const active = overview.windowDays === days
                return (
                  <Link
                    key={days}
                    href={`/app/superadmin?window=${days}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "alibi-button-primary inline-flex h-9 items-center justify-center px-3 text-xs font-black"
                        : "alibi-button-secondary inline-flex h-9 items-center justify-center px-3 text-xs font-black"
                    }
                  >
                    {days}d
                  </Link>
                )
              })}
            </nav>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <article key={label} className="alibi-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="alibi-label">{label}</p>
                  <p className="mt-3 text-3xl font-black tracking-tight text-alibi-blue">
                    {value}
                  </p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-alibi-lavender/20 text-alibi-blue">
                  <Icon className="h-5 w-5" strokeWidth={2.2} />
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold leading-relaxed text-alibi-teal">
                {detail}
              </p>
            </article>
          ))}
        </section>

        <section className="alibi-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-alibi-blue/12 px-4 py-4 sm:px-5">
            <div>
              <p className="alibi-label">users</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-alibi-blue">
                usage summary
              </h2>
            </div>
            <span className="alibi-chip inline-flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2.4} />
              {formatCount(users.length)} shown
            </span>
          </div>

          {users.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm font-semibold text-alibi-teal">
              no app users yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-alibi-lavender/10 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                  <tr>
                    <th className="px-4 py-3 sm:px-5">user</th>
                    <th className="px-4 py-3 sm:px-5">signed up</th>
                    <th className="px-4 py-3 sm:px-5">last activity</th>
                    <th className="px-4 py-3 text-right sm:px-5">blocks</th>
                    <th className="px-4 py-3 text-right sm:px-5">hours</th>
                    <th className="px-4 py-3 text-right sm:px-5">messages</th>
                    <th className="px-4 py-3 sm:px-5">timer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-alibi-blue/12">
                  {users.map((user) => (
                    <tr key={user.userId} className="align-top">
                      <td className="px-4 py-4 sm:px-5">
                        <div className="flex min-w-52 flex-col gap-1">
                          <span className="font-bold text-alibi-blue">
                            {user.email ?? "no email"}
                          </span>
                          {user.role === "superadmin" && (
                            <span className="w-fit rounded-full bg-alibi-pink/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-alibi-pink">
                              superadmin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-alibi-teal sm:px-5">
                        {formatDateTime(user.signedUpAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-alibi-teal sm:px-5">
                        {formatDateTime(user.lastActivityAt)}
                      </td>
                      <td className="px-4 py-4 text-right font-black text-alibi-blue sm:px-5">
                        {formatCount(user.completedTimeBlocks)}
                      </td>
                      <td className="px-4 py-4 text-right font-black text-alibi-blue sm:px-5">
                        {formatHours(user.loggedHours)}
                      </td>
                      <td className="px-4 py-4 text-right font-black text-alibi-blue sm:px-5">
                        {formatCount(user.companionMessages)}
                      </td>
                      <td className="px-4 py-4 sm:px-5">
                        <span
                          className={
                            user.hasActiveTimer
                              ? "rounded-full bg-alibi-teal px-2.5 py-1 text-xs font-black text-white"
                              : "rounded-full bg-alibi-lavender/20 px-2.5 py-1 text-xs font-black text-alibi-teal"
                          }
                        >
                          {user.hasActiveTimer ? "active" : "none"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
