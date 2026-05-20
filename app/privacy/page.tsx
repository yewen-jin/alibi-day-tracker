import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"

const SECTIONS = [
  {
    title: "Information We Collect",
    body: [
      "Account information such as your email address and authentication identifiers.",
      "Time-tracking records you create, including time blocks, categories, notes, hashtags, mood/effort/satisfaction fields, active timer state, note versions, chat messages, and derived insights.",
      "Integration settings you choose to save, including encrypted AI provider keys, provider/model preferences, Google Calendar connection state, and Google Calendar event sync metadata.",
      "Voice input only when you use voice chat. Audio is sent for transcription and is not stored by Alibi by default.",
      "Basic technical information needed to operate the app, such as logs, errors, device/browser information, and analytics events.",
    ],
  },
  {
    title: "How We Use Information",
    body: [
      "To provide timer tracking, manual time blocks, notes, dashboard summaries, calendar views, and companion chat.",
      "To generate evidence-based reflections from your saved time blocks, notes, and chat history.",
      "To sync completed Alibi time blocks to a separate Google Calendar named alibi when you connect Google Calendar.",
      "To route AI requests through hosted defaults or through the custom provider key you choose in settings.",
      "To transcribe voice input and optionally play companion replies as speech when voice features are configured.",
      "To secure, debug, maintain, and improve the app.",
    ],
  },
  {
    title: "Google Calendar Data",
    body: [
      "If you connect Google Calendar, Alibi requests calendar access so it can create and manage a separate alibi calendar and events created by Alibi.",
      "Alibi stores your Google refresh token encrypted so it can keep your Alibi-created calendar events in sync.",
      "Alibi stores the Google calendar id, Alibi-created event ids, sync status, content hashes, timestamps, and sync errors.",
      "Alibi does not request Gmail access and does not use Google Calendar data for advertising.",
      "You can revoke Alibi's Google access from your Google Account permissions page at any time.",
    ],
  },
  {
    title: "AI Providers And BYOK",
    body: [
      "If you use hosted AI defaults, relevant chat, notes, time blocks, and memory context are sent to the hosted model provider configured by Alibi.",
      "If you save your own provider key, Alibi sends relevant chat, notes, time blocks, and memory context to the provider and model you select.",
      "Custom API keys are encrypted server-side and are not shown back to you after saving, except as a masked preview.",
      "Provider terms, privacy rules, and retention policies may apply to data sent to your selected provider.",
    ],
  },
  {
    title: "Sharing",
    body: [
      "We do not sell your personal information.",
      "We share information with service providers only as needed to operate the app, such as hosting, authentication, database storage, analytics, AI processing, Google Calendar sync, and voice transcription or speech generation.",
      "We may disclose information if required by law, to protect rights and safety, or to enforce our terms.",
    ],
  },
  {
    title: "Retention And Deletion",
    body: [
      "Your account records are kept while your account is active or as needed to provide the service.",
      "You can delete time blocks and saved provider keys in the app.",
      "You can revoke Google Calendar access from your Google Account. Future versions should include an in-app disconnect control.",
      "To request account or data deletion, contact the app operator using the support email listed for Alibi.",
    ],
  },
  {
    title: "Security",
    body: [
      "Alibi uses authenticated access controls for account data.",
      "Custom AI provider keys and Google refresh tokens are encrypted before storage.",
      "No internet service can be guaranteed completely secure, but we use reasonable safeguards appropriate for the app's current stage.",
    ],
  },
  {
    title: "Contact",
    body: [
      "For privacy questions, access requests, or deletion requests, contact the support email listed for Alibi in the app store, OAuth consent screen, or product site.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="alibi-page min-h-screen px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-alibi-teal transition hover:bg-alibi-lavender/10 hover:text-alibi-pink hover:shadow-[inset_0_2px_5px_rgba(50,83,199,0.08)]"
        >
          <ArrowLeft className="h-4 w-4" />
          alibi
        </Link>

        <section className="alibi-card-pop mt-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                privacy
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-alibi-blue sm:text-4xl">
                Privacy Policy
              </h1>
              <p className="mt-2 text-sm font-semibold text-alibi-teal">
                Last updated: May 20, 2026
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-alibi-pink/15 text-alibi-pink">
              <Lock className="h-5 w-5" />
            </div>
          </div>

          <p className="mt-6 text-base font-semibold leading-7 text-alibi-ink">
            Alibi is a notes-first time-tracking app. This policy explains what information Alibi
            collects, how it is used, and how integrations such as Google Calendar, custom AI
            provider keys, and voice chat work.
          </p>
        </section>

        <div className="mt-5 space-y-4">
          {SECTIONS.map((section) => (
            <section key={section.title} className="alibi-card p-5">
              <h2 className="text-xl font-black text-alibi-blue">{section.title}</h2>
              <ul className="mt-3 space-y-2">
                {section.body.map((item) => (
                  <li key={item} className="text-sm font-semibold leading-6 text-alibi-teal">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
