# Alibi - Project Tracker

> Living implementation, history, status, and roadmap tracker.
> Product contract lives in [SPECS.md](./SPECS.md).

## Objective

> **Alibi is a digital mirror that tracks how you spend your day in depth, combining precise time blocking and flexible, timestamped CBT-style journaling. The aim is to build in-depth qualitative knowledge about your own productivity patterns over time.**

The product is evolving from a timer-first tracker into a qualitative productivity pattern engine: time blocks anchor the timeline, notes preserve what actually happened, chat helps elicit missing context and feelings, and derived insights make patterns visible without replacing raw user input.

## Documentation Roles

- **[SPECS.md](./SPECS.md):** product/system contract, data principles, interface behavior, AI behavior, guardrails, and qualitative pattern direction.
- **PROJECT.md:** implementation history, current status, known gaps, verification, and future roadmap.
- **[V3-PLAN.md](./V3-PLAN.md):** detailed roadmap reference for the notes-first insight engine.
- **[RESEARCH.md](./RESEARCH.md):** introspection, self-monitoring, CBT-style reflection, and attention/productivity pattern research.

## Evolution History

### v1 - Freeform Chat / Receipt Prototype

The first direction treated chat as the primary input. It captured user text and generated warm reflections, but it lacked reliable structure. The model had too little grounded data to answer specific questions about time, patterns, or actual work.

What remains useful:

- warm, nonjudgmental voice;
- attention/friction/affect schema;
- "receipt" framing as proof that the day counted;
- Supabase + OpenRouter foundation.

### v2 - Timer And Time Blocks

The project moved to `time_blocks` as the primary data model. Timer, manual entry, and chat all write structured blocks with start/end time, task, category, hashtags, notes, and optional affect/marker fields.

Implemented v2 foundation:

- persistent `active_timer`;
- start/stop timer flow;
- latest-block resume;
- manual completed-block creation;
- edit/delete for user-owned time blocks;
- chat start/stop timer;
- chat completed-block logging with clarification;
- daily block list and dashboard summaries.

### V3 - Notes-First Pattern Engine

The current direction treats notes as the most valuable data in the product. A block is not just "task X for Y hours"; it may contain parallel activity, useful distraction, avoidance, drift, emotional context, and later reinterpretation.

Implemented V3 foundation:

- custom categories through `time_block_categories`;
- meaningful note edits preserved in `time_block_note_versions`;
- note-derived insight extraction into `time_block_insights`;
- note edits regenerate current insight rows;
- chat-derived insight extraction into `companion_message_insights`;
- SQL-backed companion memory context in `lib/memory-context.ts`, combining time blocks, note insights, linked block chat, chat-derived insights, and recent visible messages into one evidence packet;
- general companion chat and saved-block analysis now use the same memory context layer instead of separate today-only prompt retrieval;
- chat analysis prioritizes notes, then metadata, then derived insights, then linked/general chat;
- companion chat is split into a general thread plus one reflective thread per completed time block;
- block-specific companion threads use the selected block, including its note, as fixed context and do not mutate blocks in v1;
- dashboard notes mirror surfaces note-grounded observations, and chat mirror surfaces message-grounded narrative patterns separately;
- `/app/calendar` now pairs a compact month view with a selected-day 24-hour timeline, including category-colored blocks and reusable block chat/edit/delete actions;
- hosted Supabase V3 schema has been applied and REST-verified;
- database portability phase 1 is started: Kysely + `pg` are installed, `DATABASE_URL` / optional `DATABASE_SSL=true` are the new app-data connection path, and `lib/db/client.ts` defines a server-only typed Postgres client;
- `lib/auth/session.ts` is the app-owned auth boundary. Supabase Auth still provides login/session, but server routes can now call `getCurrentUser()`, `requireUser()`, or `requireSyncedUser()` instead of directly calling `supabase.auth.getUser()`;
- `db/migrations/001_initial_app_schema.sql` is the first portable Postgres migration. It introduces `app_users`, replaces app-data foreign keys to `auth.users` with `app_users(id)`, and omits Supabase RLS policies so ownership is enforced in repository queries;
- pure helpers extracted from `process-message.ts` into `lib/block-draft-utils.ts` (`deriveWindow`, `resolveCategory`, `inferCategoryFromText`, `getDayRange`, `CompanionDraft`) so they are independently testable without the `"use server"` boundary.

### V4 - Integrations, BYOK, And Voice

The current integration slice adds user-controlled model settings, Google Calendar sync, and Cartesia voice chat without changing the core evidence model.

Implemented V4 foundation:

- `db/migrations/004_integrations_ai_calendar_voice.sql` adds encrypted user secrets, AI settings, per-provider model settings, Google Calendar connection state, and per-block Google event sync state;
- `db/migrations/005_ai_provider_model_settings.sql` backfills the per-provider model settings table for databases that already applied migration 004 before provider-scoped models were added;
- `lib/secret-crypto.ts` provides app-level encryption/decryption for provider keys and OAuth refresh tokens, keyed by `ALIBI_SECRET_ENCRYPTION_KEY`;
- `/app/settings` lets authenticated users save, select, disable, and delete custom AI provider keys with explicit provider-data disclosure. Each saved provider key has its own fast/companion model IDs, which can be changed or reset without re-entering the key;
- supported BYOK providers are OpenRouter, OpenAI, OpenAI-compatible HTTPS endpoints, and Anthropic through `@ai-sdk/anthropic`;
- `processCompanionMessage` resolves the current user's AI settings once per message and stores the actual selected companion model on `companion_messages.model`;
- `/app/calendar` now includes Google Calendar connection and manual retry controls;
- Google OAuth creates a separate secondary `alibi` calendar and syncs completed `time_blocks` as events, tracking event id, content hash, status, last error, and sync timestamp;
- `saveBlock`, `stopTimer`, and `deleteBlock` attempt Google event sync/delete when the user has connected Google Calendar;
- Cartesia voice routes exist for short-lived token minting, batch STT, and TTS playback;
- companion chat has push-to-talk recording and optional spoken assistant replies, with no raw audio storage by default.

V4 update — agent layer refresh (2026-05):

- hosted default `companionModelId` switched from `openai/gpt-5-mini` to `anthropic/claude-haiku-4.5` to match the alibi voice guide more closely without changing per-message cost shape;
- chat-insight and note-insight extraction are demoted from the companion model to the fast model since they are non-user-visible JSON extractions;
- chat-insight and note-insight upserts stay inline (a brief `after()` experiment was reverted because the Supabase server client reads cookies on every request and Next 16 closes the cookies handle after the response ships — deferred upserts threw silently and dropped mirror entries). The fast-tier model swap keeps the latency cost small;
- `analyseBlocks` is split into a fast-tier evidence synthesis step and a companion-tier voice rewrite step, so the large memory packet never pays companion-tier price;
- the router prompt now performs draft-completion inline when a `Prior draft` is provided, and a skip-router heuristic bypasses the router entirely on short clarification answers — replacing the previous sequential router + clarifier call pair;
- `lib/memory-context.ts` now holds a 5-minute in-process cache keyed by user + range label + limits; cache is skipped for the `today` scope and is invalidated from `app/actions/timer.ts` on every block write or delete via `invalidateMemoryContextForUser`;
- `anthropicCacheOptions` in `lib/ai.ts` wires Anthropic ephemeral prompt caching into the four companion call sites; only direct Anthropic profiles use it, since OpenRouter pass-through caching is inconsistent;
- BYOK provider presets land at `lib/ai-provider-presets.ts` (DeepSeek, Qwen via DashScope, Zhipu GLM, Moonshot Kimi, plus OpenRouter Anthropic and DeepSeek convenience presets), surfaced as a quick-start picker in `components/ai-settings-form.tsx` that prefills the existing custom-key form;
- `/app/docs` gains an "ai models, providers, and cost" section that documents the agent topology, defaults, deferred-insight behavior, two-tier analysis, prompt caching, and BYOK presets.

## Current Status

Branch: `dev`

Database setup:

- `active_timer`, `time_blocks`, `entries`, and `proactive_messages` are live and REST-visible.
- V3 additions are applied and REST-visible: `time_block_categories`, `time_block_note_versions`, `time_block_insights`, `time_blocks.category_id`, and `time_blocks.agent_metadata`.
- Companion chat tables are the current app path: `companion_conversations`, `companion_messages`, `companion_message_insights`, and `companion_drafts`.
- Integration tables are added in the portable migration path: `user_secret_keys`, `user_ai_settings`, `user_ai_provider_settings`, `google_calendar_connections`, and `google_calendar_event_syncs`.
- Existing legacy `coach_messages` / `coach_drafts` are preserved by additive migration and copied into the general companion thread.
- Default category rows are visible through REST.
- `entries` remains legacy-only for the current app path.
- Portable Postgres migration path now exists in `db/migrations`. Legacy Supabase SQL files remain as reference/backfill artifacts until the portable schema is fully verified.
- `/app/dashboard`, `/app/calendar`, `getEntries`, and proactive message reads now use repository modules backed by Kysely and `DATABASE_URL` instead of Supabase `.from(...)`.
- Timer mutations, companion chat mutations, companion draft/insight writes, and proactive insight generation still use the Supabase data API. Supabase Auth remains intentionally in place.

Server action status:

| Function | Status |
| --- | --- |
| `getActiveTimer` | Implemented; hydrates the current user's `active_timer`. |
| `startTimer` | Implemented; creates/preserves one running timer. |
| `resumeBlock` | Implemented; reopens latest completed block from original start time. |
| `stopTimer` | Implemented; moves active timer into `time_blocks`. |
| `saveBlock` | Implemented; creates/updates manual and edited blocks, preserves note versions, refreshes note insights. |
| `deleteBlock` | Implemented; deletes user-owned blocks. |
| `getCalendarData` | Implemented; loads blocks for date ranges. |
| `getCategories` / `createCategory` | Implemented; default and user-owned categories. |
| `processCompanionMessage` | Implemented; routes companion chat, timer control, block logging, clarification, memory-grounded analysis, and reflective block threads. |
| `saveAiSettings` / `testAiSettings` / `disableAiSettings` / `deleteAiSettings` | Implemented; encrypted BYOK key lifecycle and hosted fallback. |
| `connectGoogleCalendar` / `retryGoogleCalendarSync` | Implemented; OAuth redirect and manual sync retry for completed blocks. |

API route status:

| Route | Status |
| --- | --- |
| `/api/google/calendar/callback` | Implemented; completes Google OAuth and creates/updates the secondary `alibi` calendar connection. |
| `/api/cartesia/token` | Implemented; mints short-lived Cartesia access tokens with `stt` and `tts` grants. |
| `/api/cartesia/stt` | Implemented; server-side batch transcription proxy for browser recordings. |
| `/api/cartesia/tts` | Implemented; server-side TTS proxy for companion reply playback. |

Repository status:

| Domain | Status |
| --- | --- |
| Auth boundary | Implemented in `lib/auth/session.ts`; Supabase Auth retained, app user upsert available through `syncAppUser` / `requireSyncedUser`. |
| DB client | Implemented in `lib/db/client.ts`; server-only Kysely Postgres client using `DATABASE_URL` and optional `DATABASE_SSL=true`. |
| Portable schema | Initial migration added at `db/migrations/001_initial_app_schema.sql`; not yet production cut over. |
| Time-block reads | Implemented in `lib/repositories/time-blocks.ts` for completed blocks, categories, and block insights. |
| Companion reads | Implemented in `lib/repositories/companion.ts` for recent message insights and recent user messages. |
| Legacy entries/proactive messages | Implemented in `lib/repositories/legacy.ts` for entries, unread proactive messages, and mark-read. |
| Secret encryption | Implemented in `lib/secret-crypto.ts`; production requires `ALIBI_SECRET_ENCRYPTION_KEY`. |
| AI settings | Implemented in `lib/ai-settings.ts`; provider validation, encrypted key storage, provider-scoped model choices, model resolver, and hosted fallback. |
| Google Calendar sync | Implemented in `lib/google-calendar.ts`; OAuth URL/callback, refresh-token use, event upsert/delete, content hash tracking. |
| Timer writes | Still Supabase data API. |
| Companion writes | Still Supabase data API. |
| Insight generation writes | Still Supabase data API. |

AI model routing:

- Hosted OpenRouter access is centralized in `lib/ai.ts`.
- Hosted `fastModel` uses `deepseek/deepseek-chat-v3` for routing, structured extraction, and short acknowledgments.
- Hosted `companionModel` uses `anthropic/claude-haiku-4.5` for user-visible companion chat, saved-block analysis, proactive insight copy, and internal custom-dashboard analysis.
- Per-user model resolution lives in `lib/ai-settings.ts` and currently supports hosted mode, OpenRouter, OpenAI, OpenAI-compatible HTTPS endpoints, and Anthropic.
- New `companion_messages` rows record the actual selected companion model in `model`; the Supabase backfill script preserves legacy rows as `openai/gpt-4o-mini`.
- Companion-facing prompts share the reusable `alibiCompanionGuide` in `lib/companion-voice.ts`.
- Note insight generation, chat insight extraction, and proactive insight generation still use the hosted shared models directly and have not yet been fully switched to per-user BYOK resolution.
- Custom dashboard views use an internal `dashboardModel` role that aliases the resolved companion model. The server builds the evidence packet, the model returns a validated spec and result snapshot, refreshes reuse the saved spec, and the fixed renderer palette displays only validated section data and copied evidence references.

UI status:

- `/app` has timer, post-stop/manual block editor, daily add-block button, a calendar shortcut button, latest-block resume, chat panel, and simple daily block list.
- Daily block rows include `chat about this`, which opens or reopens the block's reflective companion thread. Shared time-block detail rows place time/duration first, actions beside it when space allows, and content below so tracker rows and compact calendar detail panels use the same responsive flex layout.
- The resume button is removed from the DOM while a timer is active; when no timer is active, only the latest completed block can be resumed.
- `/app/dashboard` has totals, pattern markers, notes mirror, and chat mirror.
- `/app/calendar` is the timeline-first workspace: completed blocks are positioned by local start/end time, colored by category, selectable for inline detail, and support the same chat/edit/delete controls as tracker block rows. First load shows only the month view plus selected-day timeline; selecting a timeline block opens the inline detail panel and narrows the month/timeline area, while selecting a day clears detail/editor state and restores the larger month/day view. Resume stays tracker-only.
- `/app/calendar` hydrates the same general companion thread as `/app` on first render. Block-specific chat still switches to that block's reflective thread, and `main chat` returns to the general thread.
- `/app/calendar` includes Google Calendar connection and retry controls. Connected users get a separate Google `alibi` calendar, and completed blocks sync as app-created events.
- `/app/settings` controls hosted/default versus custom AI provider mode, encrypted provider keys, saved-provider selection, provider-scoped fast/companion model choices, default-model reset, provider testing, active status display, disable, and key deletion.
- Companion chat includes push-to-talk voice input and optional Cartesia TTS playback controls.
- `/app/docs` is now a wiki-style guide explaining what Alibi is, how the evidence model works, how to write useful notes, how to use general and block-specific companion chat, and where the V3/RAG direction is going.
- `/` now describes the notes-first product, existing feature set, and future RAG ambition instead of embedding a fake chat demo.
- `/demo` provides an unauthenticated localStorage-backed workspace with tracker/chat and dashboard views, timer, manual blocks, custom categories, block-specific threads, edit/delete, latest-block resume, note/chat insights, and a sign-up CTA.
- Demo companion and insight server actions use OpenRouter over trimmed local snapshots and return local operations only; demo records remain browser-local and are never written to Supabase.
- The demo can use visitor-provided OpenAI-compatible or Anthropic endpoint settings from a local AI panel, or the hosted `OPENROUTER_DEMO_API_KEY` / demo model env vars, before falling back to the main OpenRouter configuration.
- Demo AI has a browser-local session budget of 50,000 estimated tokens. When exhausted, companion calls stop and note insights fall back to heuristic extraction while tracking remains usable.
- `/auth/login` and `/auth/sign-up` use the `STYLES.md` Alibi auth surface, including OAuth provider buttons, while preserving demo redirects and callback behavior.
- `/app` detects completed local demo blocks after login/sign-up and offers to import them into the authenticated account.
- Authenticated and demo chat logs display per-message timestamps and auto-scroll to the newest message.

Verification:

- `npm run build` passes after the integrations slice. Next.js still warns about multiple lockfiles and inferred workspace root.
- `npm run test:unit` passes — unit tests cover note insights, chat insights, memory-context range/formatting, dashboard data including daily timeline placement helpers, block draft utilities, secret encryption, and AI provider validation (Vitest).
- Playwright E2E skeleton exists at `tests/e2e/demo.test.ts`; integration tests for server actions are not yet implemented.
- Hosted schema was checked through Supabase REST table/column probes.
- Authenticated browser QA is still needed for note-save, note-edit insight regeneration, custom category creation, chat logging, chat analysis, dashboard display, Google OAuth, calendar event sync, BYOK key testing, and Cartesia voice behavior.

Known working principle:

- Timer UI, manual block creation, and chat logging share `time_blocks`.
- Notes remain human-authored source text.
- Derived insight rows are replaceable and traceable.
- Saved real block notes and demo block notes share the same AI insight path with heuristic fallback when AI is unavailable.
- Chat insight rows are derived from user messages only and keep narrative patterns separate from time-block evidence.
- General companion chat and analysis now retrieve SQL-backed memory context from the shared user data model. Default scope is today; user language can expand retrieval to yesterday, the last few days, week, or month; a complete draft uses its explicit time window.
- Companion clarification now accepts duration values returned by the model as either numbers or numeric strings, and partial time answers produce specific follow-up questions instead of repeating the same generic time/duration prompt.
- Pending companion drafts no longer hijack every later message. If a new message is ordinary chat instead of a logging answer, the stale draft is resolved and the companion returns to conversation.
- Block-specific companion threads are reflective only and use compact block context instead of broad retrieval.
- Public demo data stays in browser `localStorage` until the user imports completed blocks into an authenticated account.
- Custom AI provider keys and Google refresh tokens are treated as secrets: encrypted at rest, never returned to the client unmasked, and deletable.
- Google Calendar sync only writes Alibi-created events into the separate `alibi` calendar. External agenda overlays remain future work.
- Cartesia voice in v1 uses push-to-talk batch transcription and TTS playback. Raw browser recordings are passed through for transcription and are not persisted by Alibi.

## Current Gaps

- Weekly and monthly timeline analysis views remain pending beyond the current calendar month view plus selected-day timeline.
- External calendar/todo/agenda overlays are not implemented yet. Current Google Calendar work is one-way Alibi block sync into a separate `alibi` calendar, not import or overlay of the user's existing calendar.
- Google Calendar disconnect/revoke UI is not implemented yet. Users can reconnect and retry sync, but a first-class disconnect/delete-token flow should be added.
- Google Calendar OAuth and event sync need live browser QA against a configured Google Cloud OAuth client.
- BYOK routing currently covers the main companion message flow. Note insight generation, chat insight extraction, and proactive messages still use hosted defaults and need the same resolver before BYOK is complete across all AI calls.
- BYOK stores secrets with app-level encryption. Supabase Vault or cloud KMS-backed envelope encryption would be stronger for production.
- Cartesia voice is batch push-to-talk, not realtime streaming. Token endpoint exists for future direct client streaming, but current UI uses server-side STT/TTS proxies.
- Cartesia voice needs live browser QA for microphone permissions, audio formats, latency, playback, and failure states.
- Period analysis exists but is still shallow; week/month summaries need deterministic aggregation and stronger evidence trails.
- Notes mirror and chat mirror are initial vertical slices, not a full longitudinal productivity pattern engine.
- Chat can analyze saved data, but its elicitation style should become more deliberate: it should ask better questions about feelings, drift, mixed outcomes, and context.
- `deriveWindow` still builds a now-anchored window from duration-only input, fabricating when work happened (see REVIEW.md Finding 1a). Removing that branch would enforce the product contract that time must be asked for, not guessed.
- `resolveCategory` with `source: "inferred"` saves silently without asking the user to confirm (see REVIEW.md Finding 1b).
- `getDayRange` is not timezone-safe: server-side "today" uses server local time instead of the user's IANA timezone (see REVIEW.md Finding 2).
- Project-level tracking and break overlays are still roadmap-only. The current plan is documented in [FUTURE-ROADMAP-projects-breaks.md](./FUTURE-ROADMAP-projects-breaks.md).
- Integration tests for `app/actions/timer.ts` and `app/actions/process-message.ts` are not yet written.
- Playwright E2E tests are a skeleton only; the timer flow and manual block entry tests need selectors confirmed against the live `/demo` UI.
- Long notes in block-specific companion context need a cached summary/excerpt strategy before notes become large enough to create token pressure.
- Memory context is v1 SQL range retrieval only. It is not yet embeddings, semantic search, long-term summarization, or provider-native assistant memory.
- RAG is not implemented yet. The project first needs cleaner source records, evidence pointers, and a retrieval/chunk layer.
- Agentic database evolution is not implemented. Future work should let the agent propose schema changes, not mutate production schema directly.
- Demo AI still needs browser QA for rate/latency behavior and operation accuracy under messy inputs.
- Database portability is only partially implemented. Any authenticated route/action already migrated to repositories now requires `DATABASE_URL`; timer, companion, and insight write paths still depend on Supabase app-data tables.
- Repository-level ownership tests are not written yet. Future tests should cover user-scoped SQL predicates and app-user upsert behavior.
- The portable migration has not yet been run against a clean external Postgres database or compared against production Supabase data.

## Roadmap

### Phase 1 - Live QA And Copy Alignment

- Run authenticated smoke tests for note save/edit, custom categories, chat logging, chat analysis, and dashboard notes mirror.
- Smoke test `/demo` localStorage persistence, timer stop/edit, manual block save, chat-created block, resume, clear demo, sign-up/sign-in, and authenticated import.
- Keep `/app/docs` as a wiki, not a feature list. It should explain what Alibi is, how it works, how to write useful notes, and how to prompt chat well.
- Fix any remaining UI copy that treats notes as a minor optional field instead of primary evidence.

### Phase 1b - Database Portability Cutover

- Configure local and staging `DATABASE_URL` against a plain Postgres database and run `db/migrations/001_initial_app_schema.sql`.
- Add repository tests for user-scoped reads/writes and app-user upsert behavior.
- Move timer actions from Supabase `.from(...)` to repositories while preserving existing server action return shapes.
- Move companion conversation/message/draft/insight writes from Supabase `.from(...)` to repositories.
- Move proactive insight generation off Supabase data API.
- Keep Supabase Auth as the temporary identity provider until app-data portability is fully stable.
- Remove remaining Supabase app-data usage only after authenticated timer, dashboard, calendar, and companion QA passes on `DATABASE_URL`.

### Phase 1c - Integration QA And Privacy Hardening

- Apply `db/migrations/004_integrations_ai_calendar_voice.sql` to staging and verify all new tables.
- Smoke test `/app/settings`: save multiple provider keys, switch between saved providers, confirm each provider restores its own model IDs, change model IDs without re-entering the key, reset model IDs to defaults, test provider/model combination, confirm active status display, confirm hosted fallback, disable, delete, and verify no key is exposed in UI/logs.
- Finish BYOK resolver coverage for note insights, chat insights, and proactive messages so all user-context model calls respect custom provider mode.
- Smoke test Google OAuth with `calendar.app.created`, secondary `alibi` calendar creation, save/edit/delete block sync, duplicate prevention via content hash, and manual retry behavior.
- Add Google disconnect/revoke behavior and token deletion.
- Smoke test Cartesia microphone capture, STT transcript submission into `processCompanionMessage`, TTS playback, mute/stop states, and error banners.
- Update privacy/help copy before launch to cover Google Calendar access, BYOK provider data transfer, encrypted key handling, and voice/audio processing.

### Phase 2 - Better Note Capture

- Improve the block editor so notes are easier to write without turning them into a long required form.
- Support richer note prompts around intended versus actual work, parallel activity, attention shifts, useful distractions, friction, body state, feeling, and outcome.
- Keep one human-written note as the primary source, then derive structure beside it.
- Preserve note-history behavior when notes are edited after the fact.

### Phase 3 - Better Chat Elicitation

- Update the chat prompt so the agent helps the user reconstruct messy time blocks: parallel activity, attention shifts, useful distractions, friction, mood, and body state.
- Separate logging mode from reflection mode so ordinary emotional check-ins do not become forced block writes.
- Let chat help expand or revise notes while preserving note history.
- Add prompt patterns for "ask me questions before saving," "turn this into a useful note," and "help me name what actually happened."
- Ensure chat asks for missing details before writing valid blocks.
- Keep block-specific companion threads scoped to one block and reflective-only unless a later explicit edit flow is added.
- Add cached note summaries or excerpts for very long notes so block threads stay token-efficient without losing note context.

### Phase 4 - Source-Linked Evidence Layer

- Evolve `time_block_insights` toward smaller atomic evidence items only after real usage shows what claims recur.
- Track claim type, source type, source id, time block id, confidence, and evidence excerpt for each extracted claim.
- Use evidence items for attention shifts, useful distractions, friction, satisfaction, uncertainty, people, projects, and recurring themes.
- Keep raw notes and chat as the highest-trust source material.

### Phase 5 - Timeline-Linked Productivity Pattern Analysis

- Build richer week/month analysis over notes, metadata, linked chat, and source-linked evidence items.
- Add evidence-backed observations such as recurring friction by hour, satisfying contexts, avoidance that became useful work, or flatness after certain block types.
- Keep every observation traceable to source blocks/notes/messages.

### Phase 6 - Messy Block Data Model

- Do not redesign the schema for multi-activity blocks until enough real notes prove the shape.
- Consider `block_activity_segments` if one time block often needs multiple activity slices.
- Consider explicit attention-shift records if "intended task versus actual task" becomes central.
- Keep the timeline simple until the extra structure removes more ambiguity than it creates.

### Phase 7 - Evidence Model For RAG

- Keep the current SQL-backed memory context as the baseline retrieval path for the companion.
- Introduce an explicit retrieval/chunk layer only after enough real usage reveals the right retrieval shape.
- Store source pointers from chunks to notes, note versions, chat messages, time blocks, evidence items, and derived observations.
- Add embeddings and retrieval only for source-backed evidence.
- Require RAG answers to cite dated blocks, note excerpts, chat turns, or stored evidence.

### Phase 8 - Agent-Assisted Schema Evolution

- Let the agent inspect current schema and propose migration drafts for new evidence/RAG tables.
- Keep production database changes explicit, reviewed, and migration-based.
- Track every schema change in this document and the migration SQL.

### Phase 9 - External Calendar And Agenda Context

- Build beyond the current Google `alibi` calendar sync into user-authorized external calendar/todo/agenda access.
- Display external scheduled events and tasks as contextual overlays on Alibi calendar views alongside saved `time_blocks`.
- Keep imported calendar/agenda items visually distinct from logged time blocks unless the user explicitly converts or links them.
- Use external agenda data as context for reflection and reconstruction, not as proof of what actually happened.
- Require clear OAuth/permission boundaries, sync status, and disconnect behavior before enabling this in production.

### Phase 10 - Project And Break Tracking

- Add project tracking as a first-class timeline dimension, with a project table and project-specific summaries.
- Model focused vs non-focused allocation as a child relation of `time_blocks` so one block can contain both kinds of work.
- Add break/event records that annotate the timeline without interrupting a running block.
- Keep split/combine editing as a later phase once project and break modeling has real usage to guide it.

## Demo Flow

1. Open `/app`.
2. Start the timer.
3. Stop it and add a nuanced note about what actually happened.
4. Edit the note later; the prior version is preserved and insight rows refresh.
5. Add a manual block with a new custom category.
6. Ask chat to log a completed block; it asks for missing time/task/category before saving.
7. Ask "what patterns do you see today?" and get a note-grounded response.
8. Open `/app/dashboard` and see evidence-backed notes mirror observations.
9. Open `/app/calendar`, pick a day, scan the 24-hour timeline, select a block for inline detail, and use chat/edit/delete on the saved block.

## Next Step

Configure a local or staging `DATABASE_URL`, run the portable migration, and smoke test `/app/dashboard`, `/app/calendar`, entries, and proactive messages against plain Postgres before moving timer and companion write actions into repositories.
