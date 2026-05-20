# Alibi — A Digital Mirror For Your Day

Alibi is a digital mirror that tracks how you spend your day in depth, combining precise time blocking and flexible, timestamped CBT-style journaling. The aim is to build in-depth qualitative knowledge about your own productivity patterns over time.

The current product is timer-first and notes-first:

- Work is stored as dated `time_blocks`.
- Notes are the human-authored source of truth: what happened, what got in the way, how it felt, what changed, and what the user noticed.
- Chat is a secondary input surface that can start/stop timers, log completed blocks, ask clarifying questions, and answer from saved evidence.
- Calendar is a timeline workspace for scanning days, selecting completed blocks inline, opening block-specific chat/edit/delete actions, and syncing completed blocks to a separate Google `alibi` calendar when connected.
- Dashboard insights are grounded in saved blocks, note-derived signals, and visible evidence trails.

---

## The Problem It Solves

Most time trackers flatten the day into labels and durations. Alibi keeps the timestamped texture around the work: interruptions, drift, momentum, resistance, mood, satisfaction, and later reinterpretation. Over time, those records become a mirror for understanding how your productivity actually behaves.

---

## What Alibi Does

### 1. Timer-first tracking

Start the timer without naming the task first. Metadata comes after the work, so the app does not make planning the entry cost.

### 2. Block editor

Stopped and manual blocks can be edited with:

- task name
- category
- start/end time
- hashtags
- notes
- mood, effort, satisfaction, and attention/friction marker metadata when available

Notes are optional, but the UI now frames them as “what really happened.”

### 3. Chat agent

Chat can:

- respond conversationally without forcing a log
- start or stop the timer
- log completed work into `time_blocks`
- ask for missing timing/task/category before saving
- answer check-ins and pattern questions from saved evidence

Chat history is useful context, but block notes are treated as stronger evidence.

Chat can also use push-to-talk voice input and optional spoken companion replies when Cartesia is configured. Raw audio is sent through the server for transcription and is not stored by default.

### 4. Notes-first insight engine

When a block is saved or updated:

- meaningful note edits are preserved in `time_block_note_versions`
- note-derived signals are stored in `time_block_insights`
- raw notes remain untouched and remain the source of truth

Extracted signals include friction, avoidance, hyperfocus/flow, satisfaction, uncertainty/self-criticism, emotional tone, people, projects, themes, and evidence excerpts.

### 5. Dashboard mirror

The dashboard shows:

- totals and tracked time
- calendar/rhythm/category summaries
- pattern marker counts
- effort and satisfaction distributions
- a notes mirror with note-grounded observations and evidence excerpts

The pattern signals panel counts both explicit block markers and note-derived insight signals.

### 6. Calendar workspace

The authenticated calendar route combines a compact month view with a selected-day 24-hour timeline. First load shows the month and daily timeline only. Selecting a timeline block opens an inline detail panel with the shared time-block layout and chat/edit/delete actions; selecting another day clears the detail panel and restores the larger month/day view.

The calendar companion panel hydrates the same main companion chat as `/app`. Using `chat about this` switches to the selected block's reflective thread, and `main chat` returns to the general thread.

When Google Calendar is connected, Alibi creates a separate secondary `alibi` calendar and syncs completed `time_blocks` as events. Save/edit/delete operations attempt to keep the matching Google event in sync, and `/app/calendar` includes a manual retry control.

### 7. BYOK model settings

`/app/settings` lets authenticated users choose hosted defaults or save custom AI provider keys. Provider/key management is separate from model selection: each saved provider key keeps its own fast and companion model IDs, and selecting a saved provider restores that provider's model choices. Users can also reset the selected provider's models to the default IDs. Custom keys are encrypted server-side, masked in the UI, and can be tested, disabled, or deleted. The settings screen includes an active status panel for mode, provider, models, key preview, saved keys, and last test state, and explicitly discloses that Alibi will send chat, notes, time blocks, and memory context to the selected provider.

---

## Routes

| Route | Purpose |
|---|---|
| `/` | Public landing page |
| `/app` | Authenticated timer, block editor, daily block list, and chat panel |
| `/app/calendar` | Month calendar, selected-day timeline, inline block detail, and calendar companion chat |
| `/app/dashboard` | Dashboard summaries, pattern markers, and notes mirror |
| `/app/settings` | Hosted/default AI mode, BYOK provider key settings, model selection/reset, status, key test/disable/delete |
| `/app/docs` | Feature guide |
| `/auth/login` | Email/password login |
| `/auth/sign-up` | Sign up |
| `/auth/sign-up-success` | Post sign-up confirmation |
| `/auth/error` | Auth error page |
| `/auth/callback` | Supabase auth callback |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase Postgres with Row Level Security |
| Auth | Supabase Auth |
| AI | AI SDK v6 through hosted OpenRouter defaults or per-user BYOK providers |
| Voice | Cartesia STT/TTS via server routes |
| Calendar Sync | Google Calendar API with a separate user-owned `alibi` calendar |

### AI model and voice configuration

Hosted OpenRouter defaults are centralized in [`lib/ai.ts`](./lib/ai.ts):

- `fastModelId` is `openai/gpt-4.1-nano` for routing, structured extraction, and short acknowledgments.
- `companionModelId` is `openai/gpt-5-mini` for user-visible companion chat, saved-block analysis, and proactive insight copy.

Per-user BYOK resolution lives in [`lib/ai-settings.ts`](./lib/ai-settings.ts). Supported providers are OpenRouter, OpenAI, OpenAI-compatible HTTPS endpoints, and Anthropic. Custom API keys are encrypted with `ALIBI_SECRET_ENCRYPTION_KEY` and stored in `user_secret_keys`.

Alibi's reusable companion voice prompt lives in [`lib/companion-voice.ts`](./lib/companion-voice.ts). Change `alibiCompanionGuide` there to tune how the companion sounds. It is used by companion chat, saved-block analysis, and proactive insight generation.

Cartesia routes live under `/api/cartesia/*`:

- `/api/cartesia/token` mints short-lived client access tokens with `stt` and `tts` grants.
- `/api/cartesia/stt` transcribes push-to-talk browser recordings.
- `/api/cartesia/tts` returns generated speech for companion replies.

---

## Database Schema

The primary schema is in [db/supabase-v2.sql](./db/supabase-v2.sql).

For existing Supabase projects, run [db/supabase-chat-history.sql](./db/supabase-chat-history.sql) once to create the additive `companion_*` tables and backfill legacy chat rows without deleting them.

Portable migrations live in [`db/migrations`](./db/migrations). The integrations migration adds:

- `user_secret_keys` for encrypted AI provider keys and Google refresh tokens.
- `user_ai_settings` for hosted/custom mode and the active provider selector.
- `user_ai_provider_settings` for each saved provider key's base URL, model IDs, key preview, disclosure, and test status.
- `google_calendar_connections` for OAuth connection and secondary calendar state.
- `google_calendar_event_syncs` for `time_block_id -> google_event_id`, content hashes, sync status, errors, and synced timestamps.

### `time_blocks`

Primary source of saved work.

```sql
time_blocks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer generated always as (...) stored,
  task_name text,
  category text,
  hashtags text[] not null default '{}',
  notes text,
  mood text,
  effort_level text,
  satisfaction text,
  avoidance_marker boolean not null default false,
  hyperfocus_marker boolean not null default false,
  guilt_marker boolean not null default false,
  novelty_marker boolean not null default false,
  agent_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `active_timer`

One active timer row per user.

```sql
active_timer (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
)
```

### `companion_conversations`

One global thread plus one optional reflective thread per saved time block.

```sql
companion_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text,
  related_time_block_id uuid references time_blocks(id) on delete set null,
  context_snapshot jsonb not null default '{"kind":"general"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `companion_messages`

Thread-scoped companion history. Block-thread messages remain isolated from the general companion chat.

```sql
companion_messages (
  id uuid primary key,
  conversation_id uuid not null references companion_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  message_type text not null default 'chat',
  model text not null default 'openai/gpt-5-mini',
  related_time_block_id uuid references time_blocks(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
)
```

### `companion_drafts`

Temporary clarification state for the general companion thread when chat needs more details before saving a block.

### `time_block_note_versions`

Preserves meaningful note edits.

```sql
time_block_note_versions (
  id uuid primary key,
  time_block_id uuid not null references time_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_notes text,
  new_notes text,
  source text not null check (source in ('manual', 'chat', 'agent')),
  created_at timestamptz not null default now()
)
```

### `time_block_insights`

Derived interpretation from notes. This is not replacement truth.

```sql
time_block_insights (
  id uuid primary key,
  time_block_id uuid not null unique references time_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'notes',
  actions text[] not null default '{}',
  emotional_tone text,
  friction_points text[] not null default '{}',
  avoidance_signals text[] not null default '{}',
  hyperfocus_signals text[] not null default '{}',
  satisfaction_signals text[] not null default '{}',
  uncertainty_signals text[] not null default '{}',
  people text[] not null default '{}',
  projects text[] not null default '{}',
  themes text[] not null default '{}',
  evidence_excerpt text,
  model_version text not null,
  created_at timestamptz not null default now()
)
```

### Legacy Tables

`entries` and the older proactive-message path remain in the repo for legacy/reference purposes. New chat logging writes to `time_blocks`, not `entries`.

---

## Pattern Signal Detection

There are two layers:

1. Explicit block metadata on `time_blocks`
   - `avoidance_marker`
   - `hyperfocus_marker`
   - `guilt_marker`
   - `novelty_marker`
   - `mood`
   - `effort_level`
   - `satisfaction`

2. Note-derived insight rows in `time_block_insights`
   - avoidance signals
   - hyperfocus/flow signals
   - friction points
   - satisfaction/reward signals
   - uncertainty/self-criticism
   - emotional tone

The dashboard merges both sources by block id, so a note-derived hyperfocus signal appears in the pattern signals card even if an older block boolean was never backfilled.

---

## File Structure

```text
alibi-day-tracker/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   ├── app/
│   │   ├── page.tsx
│   │   ├── calendar/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── settings/page.tsx
│   │   └── docs/page.tsx
│   ├── api/
│   │   ├── cartesia/
│   │   └── google/calendar/callback/
│   ├── auth/
│   └── actions/
│       ├── ai-settings.ts
│       ├── calendar-sync.ts
│       ├── timer.ts
│       ├── process-message.ts
│       ├── generate-insight.ts
│       ├── get-entries.ts
│       └── proactive-messages.ts
├── components/
│   ├── timer-tracker-app.tsx
│   ├── calendar-workspace.tsx
│   ├── time-block-actions.tsx
│   ├── top-nav.tsx
│   ├── proactive-bubble.tsx
│   ├── companion-response.tsx
│   └── dashboard/
│       ├── adhd-markers.tsx
│       ├── notes-mirror.tsx
│       ├── calendar-view.tsx
│       ├── rhythm-chart.tsx
│       ├── project-distribution.tsx
│       └── stats-overview.tsx
├── lib/
│   ├── block-draft-utils.ts   ← pure helpers extracted for testing
│   ├── ai-settings.ts
│   ├── google-calendar.ts
│   ├── secret-crypto.ts
│   ├── note-insights.ts
│   ├── dashboard-data.ts
│   ├── ai.ts
│   ├── types.ts
│   └── supabase/
├── tests/
│   ├── unit/
│   │   ├── block-draft-utils.test.ts
│   │   ├── dashboard-data.test.ts
│   │   └── note-insights.test.ts
│   └── e2e/
│       └── demo.test.ts
├── vitest.config.ts
├── playwright.config.ts
├── db/supabase-v2.sql
├── SPECS.md
├── PROJECT.md
└── RESEARCH.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 10+
- If `pnpm` is not already available on a new machine, enable it with `corepack enable` after installing Node.js.
- Supabase project with auth enabled
- OpenRouter API key
- `DATABASE_URL` for the app-data Kysely repository path
- `ALIBI_SECRET_ENCRYPTION_KEY` for BYOK and Google refresh-token encryption

### Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
OPENROUTER_API_KEY=
DATABASE_URL=
ALIBI_SECRET_ENCRYPTION_KEY=

# optional Google Calendar sync
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_SITE_URL=
ALIBI_OAUTH_STATE_SECRET=

# optional Cartesia voice chat
CARTESIA_API_KEY=
CARTESIA_DEFAULT_VOICE_ID=
CARTESIA_VERSION=
CARTESIA_TTS_MODEL=
CARTESIA_STT_MODEL=

# optional demo-only OpenRouter configuration
OPENROUTER_DEMO_API_KEY=
OPENROUTER_DEMO_FAST_MODEL=
OPENROUTER_DEMO_COMPANION_MODEL=
# optional demo-only Anthropic direct configuration
ANTHROPIC_DEMO_API_KEY=
ANTHROPIC_API_KEY=
```

### Setup

```bash
git clone https://github.com/yewen-jin/alibi-day-tracker
cd alibi-day-tracker
corepack enable
pnpm install
pnpm dev
```

Apply [supabase-v2.sql](./db/supabase-v2.sql) in the Supabase SQL editor for the legacy Supabase schema, or run the portable migrations in [`db/migrations`](./db/migrations) against a Postgres database. If your hosted database already has the v2 tables, make sure the V3 and integration additions are present:

- `time_blocks.agent_metadata`
- `time_block_note_versions`
- `time_block_insights`
- `user_secret_keys`
- `user_ai_settings`
- `user_ai_provider_settings`
- `google_calendar_connections`
- `google_calendar_event_syncs`

### Verification

```bash
pnpm build      # type-check + static build
pnpm test       # unit tests (Vitest)
pnpm test:e2e   # Playwright E2E against localhost:3000 (requires dev server)
```

`pnpm build` and focused unit tests pass. `pnpm lint` is broken and pending a fix.

---

## Current Status

Implemented:

- timer persistence through `active_timer`
- start, stop, resume, save, edit, delete block flows
- manual/backdated block creation
- chat start/stop/log/clarification/check-in flows
- notes-first analysis retrieval for companion responses
- note version preservation
- note-derived insight extraction
- dashboard notes mirror
- calendar workspace with month view, selected-day timeline, inline block detail, and shared companion chat hydration
- tracker today calendar shortcut button linking to `/app/calendar`
- pattern marker dashboard that merges explicit markers and note-derived signals
- unit test layer: 65 tests across note insights, chat insights, memory context, dashboard data, and block draft utilities

Pending:

- hosted database migration verification wherever the V3 tables are not yet applied
- authenticated browser QA against live Supabase/OpenRouter
- richer week/month analysis
- time-block-aware proactive messages replacing the legacy `entries` cadence
- integration tests for `timer.ts` and `process-message.ts` server actions
- Playwright E2E selectors confirmed against live UI; authenticated app flows not yet covered
- fix `pnpm lint` (`next lint` incompatible with Next 16)
- timezone-safe `getDayRange` (server uses server local time instead of user IANA timezone)
- enforce clarification for duration-only input and keyword-inferred categories before saving

---

## What Alibi Is Not

| Not | Why |
|---|---|
| A planner | Planning is the friction. |
| A to-do list | Tasks create expectation. Alibi records evidence. |
| A goal-setter | Goals create comparison. |
| A companion who pushes | Push energy makes the app easier to avoid. |
| A productivity scorecard | Numbers should support self-knowledge, not judgment. |
| A vague freeform-only chatbot | Chat writes only through structured `time_blocks` and `active_timer` operations. |

---

## The Mirror Thesis

> Most apps make you do more. Alibi helps you understand what already happened.

The gap between how your day unfolded and what you can recall later makes patterns hard to see. Alibi closes that gap with timestamped evidence, reflective notes, and no pressure to perform.

---

## License

MIT
