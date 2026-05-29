# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Alibi is a notes-first time-block tracker for ADHD brains. Users log what they actually did, preserve nuanced notes, and reflect on patterns without judgment. The companion AI cites evidence from their own records rather than offering generic encouragement.

## Commands

```bash
pnpm dev          # Start Next.js dev server (localhost:3000)
pnpm build        # Production build (also serves as type-check)
pnpm test:unit    # Unit tests (Vitest)
pnpm test:e2e     # Playwright E2E against a running dev server
pnpm lint         # Currently broken: next lint is incompatible with Next 16
pnpm start        # Serve production build
```

`pnpm build` is the primary verification step. Unit tests and the demo E2E smoke path exist; `pnpm lint` should not be treated as a passing gate until the Next 16 lint script is replaced.

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** with `@theme inline` tokens and `@layer components` classes
- **Supabase** for Postgres, auth (email + OAuth), and RLS
- **AI SDK v6** via **OpenRouter** (OpenAI-compatible provider)
  - `deepseek/deepseek-chat-v3` — routing, extraction, acknowledgments (fast/cheap)
  - `anthropic/claude-haiku-4.5` — user-visible conversation, analysis, insights
- **Zod** for structured AI output validation

## Architecture

### App Router Layout

- `app/page.tsx` — Landing page (public)
- `app/app/page.tsx` — Authenticated timer + block editor + companion chat
- `app/app/calendar/page.tsx` — Month calendar, selected-day timeline, inline block detail, calendar sync controls
- `app/app/dashboard/page.tsx` — Charts, ADHD markers, insights
- `app/app/settings/page.tsx` — Hosted/default AI mode, BYOK provider keys, model settings, Google/voice-related status
- `app/app/docs/page.tsx` — Feature guide
- `app/demo/page.tsx` — Public demo backed by localStorage
- `app/privacy/page.tsx` and `app/terms/page.tsx` — Public legal/privacy copy
- `app/auth/` — Login, sign-up, callback routes

### Server Actions (`app/actions/`)

All database operations go through server actions (`"use server"`). Two key files:

- **`timer.ts`** — Timer lifecycle (`startTimer`, `stopTimer`, `resumeBlock`), block CRUD (`saveBlock`, `deleteBlock`), category management (`getCategories`, `createCategory`), calendar queries
- **`process-message.ts`** — Companion chat routing: classifies user intent (start/stop timer, log block, analyze, clarify, chat), executes the action, manages multi-turn clarification via `companion_drafts`

### AI Integration

- **`lib/ai.ts`** — hosted OpenRouter defaults, model exports, Anthropic cache options, JSON extraction helper
- **`lib/companion-voice.ts`** — Central prompt guide for all AI outputs. The companion voice is evidence-led, specific, quiet, and nonjudgmental. It cites what the user's records say, never invents work or offers generic praise.
- **`lib/rag/`** — Initial source-backed memory chunking, OpenAI embedding, indexing, retrieval, and retrieval logs. This is server-owned infrastructure, separate from user BYOK chat providers.
- **`lib/note-insights.ts`** — Note insight extraction with heuristic fallback for friction, avoidance, hyperfocus, satisfaction, people, projects, and themes.

### Core Data Model (`lib/types.ts`)

- **TimeBlock** — Central entity: start/end times, task name, category, notes, mood, effort, ADHD markers (avoidance, hyperfocus, guilt, novelty)
- **TimeBlockInsight** — Derived from notes: actions, emotional tone, friction/avoidance/hyperfocus signals, people, projects, themes
- **ActiveTimer** — One row per user max; deleted when stopped
- **TimeBlockCategory** — Slugified names with colors; 7 defaults + user-created
- **CompanionConversation** — "general" (one per user) or "time_block" (one per saved block, with frozen context snapshot)
- **CompanionMessage** — Chat turns with message_type (chat, ack, clarification, analysis, error, context)

### Database

Legacy Supabase schema files live in `db/supabase-v2.sql` and `db/supabase-chat-history.sql`. Portable Postgres migrations live in `db/migrations/`; the app is mid-cutover to Kysely repositories through `DATABASE_URL`, while Supabase Auth remains the identity provider. Current RAG tables are `memory_chunks` and `rag_retrieval_logs`.

## Styling

Single source of truth: **`app/globals.css`** + Tailwind v4 theme. See **`specs/STYLES.md`** for the full design system reference.

- Do not use inline `style={{}}` for colors, surfaces, shadows, or borders
- Use alibi component classes: `.alibi-card`, `.alibi-card-pop`, `.alibi-pill`, `.alibi-inset`, `.alibi-input`, `.alibi-button-primary`, `.alibi-button-teal`, `.alibi-button-stop`, `.alibi-button-secondary`, `.alibi-block-item`, `.alibi-doc-card`
- Color tokens: `alibi-ink`, `alibi-blue`, `alibi-pink`, `alibi-teal`, `alibi-lavender`
- Fonts: Figtree (sans), JetBrains Mono (mono)

## Environment Variables

Copy `.env.example` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENROUTER_API_KEY=
DATABASE_URL=
ALIBI_SECRET_ENCRYPTION_KEY=
OPENAI_API_KEY=                    # server-owned RAG embeddings, separate from BYOK
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=   # optional, for auth redirects in dev
```

## Key Docs

- `README.md` — Setup, architecture overview, routes, schema summary, and status
- `specs/SPECS.md` — Product spec and data principles
- `specs/PROJECT.md` — Implementation history and current status
- `specs/STYLES.md` — Design system reference
- `specs/RESEARCH.md` — Research/theory background
- `plans/V3-PLAN.md` — V3 roadmap
- `plans/CHAT.md` — Chat/LLM guidelines
- `plans/FUTURE-ROADMAP-projects-breaks.md` — Project and break tracking plan
- `logs/REVIEW.md` — Current review findings
- `lib/companion-voice.ts` — Read this before changing any AI prompts

# Repository Guidelines

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the existing file style: double quotes are common in `app/`, semicolons are used there, while some older files omit them. Match the surrounding file instead of reformatting unrelated code. Use `PascalCase` for React components, `camelCase` for functions and variables, and kebab-free route folder names in `app/`. Keep server-only logic in server actions or `lib/`, not in client components.

When changing product terminology, prefer `companion` for current app/runtime naming. Legacy `coach_*` database references are intentionally retained in migration compatibility files.

## Testing Guidelines

Verify changes with:
- `pnpm build`
- `pnpm test:unit` for logic changes
- `pnpm test:e2e` for demo/browser workflow changes when a dev server is running
- targeted manual checks in `/app`, `/app/dashboard`, `/app/calendar`, `/app/settings`, and `/demo`

If you add tests later, place them near the feature or in a dedicated test folder and use clear names like `timer.spec.ts` or `process-message.test.ts`.

## Commit & Pull Request Guidelines

Recent commits use short, plain-language subjects such as `resume button fix` and `update demo to reflect recent changes`. Keep commit messages concise, lowercase, and focused on one change. PRs should include:
- a short summary of user-visible behavior,
- any schema or migration impact,
- manual verification steps,
- screenshots for UI changes.

## Security & Configuration Tips

Supabase and OpenRouter keys live in `.env`. Do not commit secrets. Treat `db/*.sql` as reviewed migration artifacts, especially anything touching `companion_*` or legacy `coach_*` tables.
