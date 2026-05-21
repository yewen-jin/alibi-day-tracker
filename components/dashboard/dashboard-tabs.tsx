import Link from "next/link"
import { cn } from "@/lib/utils"
import type { DashboardSkill } from "@/lib/skills/types"

interface DashboardTabsProps {
  skills: DashboardSkill[]
  activeSlug: string
}

export function DashboardTabs({ skills, activeSlug }: DashboardTabsProps) {
  return (
    <nav
      aria-label="dashboard views"
      className="alibi-pill flex flex-wrap items-center gap-1 px-2 py-1.5"
    >
      <span className="px-2 text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
        view
      </span>
      <ul className="flex flex-wrap items-center gap-1">
        {skills.map((skill) => {
          const isActive = skill.slug === activeSlug
          return (
            <li key={skill.slug}>
              <Link
                href={`/app/dashboard?view=${skill.slug}`}
                aria-current={isActive ? "page" : undefined}
                title={skill.description}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold transition",
                  isActive
                    ? "bg-alibi-blue text-white shadow-[0_8px_16px_rgba(50,83,199,0.25)]"
                    : "text-alibi-teal hover:-translate-y-0.5 hover:bg-alibi-teal hover:text-white",
                )}
              >
                {skill.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
