import { redirect } from "next/navigation";
import { getAiSettingsForUser } from "@/lib/ai-settings";
import { getCurrentUser, syncAppUser } from "@/lib/auth/session";
import { TopNav } from "@/components/top-nav";
import { AiSettingsForm } from "@/components/ai-settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/auth/login");

  await syncAppUser(user);
  const settings = await getAiSettingsForUser(user.id);

  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1120px] flex-col gap-6 p-8">
        <TopNav userEmail={user.email ?? null} activeHref="/app/settings" />

        <header className="px-2 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[1.9rem] font-black tracking-tight text-alibi-blue">
              settings
            </h1>
            <span className="rounded-full bg-alibi-pink/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-alibi-pink">
              privacy controls
            </span>
          </div>
          <p className="mt-1 text-base font-semibold leading-relaxed text-alibi-teal">
            choose hosted models or bring your own provider key.
          </p>
        </header>

        <AiSettingsForm initialSettings={settings} />
      </div>
    </main>
  );
}
