import Link from "next/link";
import { redirect } from "next/navigation";
import { getAiSettingsForUser } from "@/lib/ai-settings";
import { getCurrentUser, syncAppUser } from "@/lib/auth/session";
import { TopNav } from "@/components/top-nav";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  { id: "profile", title: "profile" },
  { id: "agent-models", title: "agent models" },
] as const;

type SettingsSectionId = (typeof SETTINGS_NAV)[number]["id"];

const DEFAULT_SECTION: SettingsSectionId = "profile";

function resolveSection(value: string | string[] | undefined): SettingsSectionId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return SETTINGS_NAV.some((entry) => entry.id === candidate)
    ? (candidate as SettingsSectionId)
    : DEFAULT_SECTION;
}

interface SettingsPageProps {
  searchParams?: Promise<{ section?: string | string[] }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getCurrentUser();

  if (!user) redirect("/auth/login");

  await syncAppUser(user);
  const settings = await getAiSettingsForUser(user.id);
  const resolved = await searchParams;
  const activeSection = resolveSection(resolved?.section);

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1120px] flex-col gap-6 p-8">
        <TopNav activeHref="/app/settings" />

        <header className="px-1 sm:px-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[1.9rem] font-black tracking-tight text-alibi-blue">
              settings
            </h1>
            <span className="rounded-full bg-alibi-pink/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
              privacy controls
            </span>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="alibi-card h-fit px-5 py-5 lg:sticky lg:top-6">
            <p className="alibi-label mb-3">sections</p>
            <nav className="flex flex-col gap-2" aria-label="settings sections">
              {SETTINGS_NAV.map(({ id, title }) => {
                const isActive = activeSection === id;
                return (
                  <Link
                    key={id}
                    href={id === DEFAULT_SECTION ? "/app/settings" : `/app/settings?section=${id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "rounded-xl px-2 py-1.5 text-[12.5px] font-semibold transition",
                      isActive
                        ? "bg-alibi-blue text-white shadow-[inset_0_2px_5px_rgba(50,83,199,0.18)]"
                        : "text-alibi-teal hover:bg-alibi-lavender/10 hover:text-alibi-pink hover:shadow-[inset_0_2px_5px_rgba(50,83,199,0.08)]",
                    )}
                  >
                    {title}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="flex flex-col gap-5">
            {activeSection === "profile" && (
              <section className="alibi-card p-6">
                <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
                  profile
                </h2>
                <p className="mt-2 text-[14px] leading-[1.7] text-alibi-teal">
                  signed in as:
                </p>
                <p
                  className="mt-2 truncate font-mono text-sm font-semibold tracking-[0.04em] text-alibi-ink"
                  title={user.email ?? undefined}
                >
                  {user.email ?? "unknown"}
                </p>
                <div className="mt-5">
                  <SignOutButton />
                </div>
              </section>
            )}

            {activeSection === "agent-models" && (
              <section className="flex flex-col gap-4">
                <div className="px-1">
                  <h2 className="text-[17px] font-black tracking-tight text-alibi-blue">
                    agent models
                  </h2>
                  <p className="mt-1 text-[14px] leading-[1.7] text-alibi-teal">
                    choose hosted models or bring your own provider key. settings apply to
                    routing, extraction, and companion chat.
                  </p>
                </div>
                <AiSettingsForm initialSettings={settings} />
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
