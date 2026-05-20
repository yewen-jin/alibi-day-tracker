import Link from "next/link"
import { BookOpen, CalendarDays, Clock3, LayoutGrid } from "lucide-react"
import { SignOutButton } from "@/components/sign-out-button"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/app", label: "tracker", icon: Clock3 },
  { href: "/app/dashboard", label: "dashboard", icon: LayoutGrid },
  { href: "/app/calendar", label: "calendar", icon: CalendarDays },
  { href: "/docs", label: "docs", icon: BookOpen },
]

interface TopNavProps {
  userEmail?: string | null
  activeHref: string
}

/**
 * TopNav — primary navigation strip.
 * Glass pill matching the warm-cream alibi aesthetic.
 * Used at the top of /, /dashboard, and /docs.
 */
export function TopNav({ userEmail, activeHref }: TopNavProps) {
  return (
    <nav
      aria-label="primary"
      className="alibi-pill flex items-center justify-between gap-3 px-3 py-2"
    >
      {/* Brand */}
      <Link
        href="/app"
        className="flex items-baseline gap-2 px-2 transition-opacity hover:opacity-80"
      >
        <span className="text-[15px] font-black tracking-tight text-alibi-blue">
          alibi
        </span>
        <span className="hidden rounded-full bg-alibi-pink/15 px-2 py-0.5 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink sm:inline">
          tracker
        </span>
      </Link>

      {/* Links */}
      <ul className="flex items-center gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = activeHref === href
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition",
                  active
                    ? "bg-alibi-blue text-white shadow-[0_8px_16px_rgba(50,83,199,0.25)]"
                    : "text-alibi-teal hover:-translate-y-0.5 hover:bg-alibi-teal hover:text-white"
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Email + sign out */}
      <div className="flex items-center gap-2">
        {userEmail && (
          <span
            className="hidden max-w-[180px] truncate font-mono text-xs font-semibold tracking-[0.04em] text-alibi-teal md:inline"
            title={userEmail}
          >
            {userEmail}
          </span>
        )}
        <SignOutButton />
      </div>
    </nav>
  )
}
