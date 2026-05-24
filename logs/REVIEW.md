# Review

Date: 2026-05-05  
Updated: 2026-05-24

This review tracks architecture decisions, database schema, project efficiency, bugs, software design, and the `coach` to `companion` naming transition. Product intent is grounded in [SPECS.md](../specs/SPECS.md), [PROJECT.md](../specs/PROJECT.md), [STYLES.md](../specs/STYLES.md), and [README.md](../README.md).

## Current Findings

### 1. High: chat logging needs semantic duration handling

Status: implemented 2026-05-24; server-action integration coverage added.

The chat flow must distinguish ongoing-work intent from completed-work logging intent, but completed-duration logging should not be blocked merely because the user omitted an explicit start time.

- Ongoing-work intent with a duration should start an open active timer backdated by that duration.
- Completed-work logging intent with a duration and no explicit start or end anchor should save a completed block ending now and covering the immediately preceding duration.
- This must be semantic and language-independent. It should rely on model-deciphered intent plus extracted duration, not hard-coded English trigger phrases such as "just spent".

Current implementation: `deriveWindow` turns a completed-block draft with only `duration_minutes` into a window ending now, `processCompanionMessage` relies on model-routed semantic intent instead of English completed-duration triggers, and `startTimer` can accept a duration-only start draft by backdating `started_at` while leaving the block open. Category inference is accepted friction reduction when the content clearly supports a category, and ambiguous category evidence still clarifies before saving.

References:
- [lib/block-draft-utils.ts](../lib/block-draft-utils.ts) — `deriveWindow` derives duration-only completed-block drafts as ending now.
- [app/actions/process-message.ts](../app/actions/process-message.ts) — start vs completed duration behavior is based on routed intent, not English completed-duration keywords.
- [app/actions/timer.ts](../app/actions/timer.ts) — `startTimer` accepts optional past start and metadata.
- [specs/SPECS.md](../specs/SPECS.md) — companion behavior now defines ongoing-duration vs completed-duration semantics in the Companion section.
- [tests/unit/process-message.integration.test.ts](../tests/unit/process-message.integration.test.ts) — covers model-routed completed duration logging, ongoing duration timer start, and ambiguous category clarification through `processCompanionMessage`.

Remaining work: none for this finding.

### 2. High: "today" and memory ranges are still not timezone-safe

Status: open.

Server-side helpers still derive day boundaries from the server process timezone. `processCompanionMessage` accepts a user timezone and passes it to the router prompt, but the memory range helpers do not consume it.

References:
- [lib/block-draft-utils.ts](../lib/block-draft-utils.ts) — `getDayRange` uses `new Date()` and `setHours(0, 0, 0, 0)` at lines 145-155.
- [lib/memory-context.ts](../lib/memory-context.ts) — `startOfLocalDay` uses server-local `setHours` at lines 60-63.
- [lib/memory-context.ts](../lib/memory-context.ts) — `inferMemoryRange` computes today/yesterday/week/month from that server-local start at lines 103-157.
- [README.md](../README.md) still lists timezone-safe `getDayRange` as pending.

Remaining work:
- Thread the user's IANA timezone into `inferMemoryRange`, `buildCompanionMemoryContext`, and RAG retrieval scope derivation.
- Compute local-day boundaries for the user's timezone, including DST-safe ranges.
- Update unit tests so they assert user-zone behavior rather than server-local behavior.

### 3. Medium: companion history loading is still unbounded

Status: open.

The prompt path slices recent messages after load, but the underlying conversation query still fetches every message for the thread and returns that full array to the UI.

References:
- [app/actions/process-message.ts](../app/actions/process-message.ts) — `fetchCompanionMessagesForConversation` selects all rows and orders ascending with no `.limit()` at lines 540-550.
- [app/actions/process-message.ts](../app/actions/process-message.ts) — prompt usage slices to the last six after the full load.

Remaining work:
- Add a bounded latest-message query for thread hydration.
- Add pagination or an older-message loader for long histories.
- Keep prompt construction bounded at the query layer, not only after fetch.

### 4. Medium: category is still stored twice without a database invariant

Status: open.

`time_blocks.category` and `time_blocks.category_id` can still drift. Application code writes both, but the database does not enforce that the stored slug matches the referenced category row.

References:
- [db/migrations/001_initial_app_schema.sql](../db/migrations/001_initial_app_schema.sql) — `time_blocks.category` and `time_blocks.category_id` are separate columns at lines 75-76.
- [db/supabase-v2.sql](../db/supabase-v2.sql) — legacy Supabase schema also stores both.
- [app/actions/timer.ts](../app/actions/timer.ts) — timer/manual save paths write both fields.

Remaining work:
- Choose a single source of truth, preferably `category_id` plus a join for current metadata.
- If denormalized slug must remain for compatibility, add a trigger/check strategy or migration plan that prevents drift.

### 5. Medium: the rhythm view still under-represents when time was actually spent

Status: open.

The dashboard aggregates only the start hour of each block. A multi-hour block increments one bucket, but the UI labels the chart as "by hour" / "when you track", which implies a distribution of time spent.

References:
- [lib/dashboard-data.ts](../lib/dashboard-data.ts) — `aggregateByHour` increments only `new Date(block.started_at).getHours()` at lines 217-225.
- [components/dashboard/rhythm-chart.tsx](../components/dashboard/rhythm-chart.tsx) — the UI labels this as "by hour" at lines 65-89.
- [tests/unit/dashboard-data.test.ts](../tests/unit/dashboard-data.test.ts) — tests assert start-hour counting rather than duration-spread behavior.

Remaining work:
- Decide whether the chart means "blocks started by hour" or "minutes spent by hour".
- If it means time spent, split block duration across occupied hour buckets.
- If it means starts, rename the UI and types to avoid overstating the signal.

### 6. Medium: RAG migration conflicts with the portable schema direction

Status: open.

The portable migration path references `app_users` and avoids Supabase-only ownership assumptions. The RAG migration reintroduces `auth.users` foreign keys and Supabase RLS, which makes the migration Supabase-specific.

References:
- [db/migrations/001_initial_app_schema.sql](../db/migrations/001_initial_app_schema.sql) — portable schema uses `app_users`.
- [db/migrations/012_memory_chunks_rag.sql](../db/migrations/012_memory_chunks_rag.sql) — `memory_chunks.user_id` and `rag_retrieval_logs.user_id` reference `auth.users`; RLS policies use `auth.uid()`.

Remaining work:
- Mark migration 012 as Supabase-only and add a portable equivalent, or convert it to `app_users(id)` and repository-enforced ownership.

### 7. Medium: RAG fallback can ignore the requested scope

Status: open.

Vector retrieval applies source/date filters, but the fallback query returns the user's most recent completed blocks without applying the requested date range or source type constraints.

References:
- [lib/rag/retriever.ts](../lib/rag/retriever.ts) — `fallbackRecentBlocks` queries recent `time_blocks` only.
- [lib/rag/retriever.ts](../lib/rag/retriever.ts) — fallback is used when no chunks are returned.
- [db/migrations/012_memory_chunks_rag.sql](../db/migrations/012_memory_chunks_rag.sql) — `match_memory_chunks` itself supports date/source filters.

Remaining work:
- Pass the resolved date window and source types into fallback retrieval.
- Prefer no RAG fallback over out-of-scope evidence when a user asks about a specific period/source.

### 8. Medium: existing block edits do not invalidate the memory-context cache

Status: open.

The memory-context cache is invalidated on new block inserts and deletes, but the existing-block update branch returns without invalidating. Non-today analysis can stay stale for up to the cache TTL.

References:
- [lib/memory-context.ts](../lib/memory-context.ts) — non-today contexts are cached for five minutes.
- [app/actions/timer.ts](../app/actions/timer.ts) — insert/delete paths invalidate, but the update path revalidates UI paths and returns without `invalidateMemoryContextForUser`.

Remaining work:
- Call `invalidateMemoryContextForUser(user.id)` in the existing-block update branch of `saveBlock`.

### 9. Medium: some model paths still bypass BYOK resolution

Status: open.

Primary companion chat resolves per-user AI settings, but note insight extraction and the legacy proactive insight writer still use hosted model imports directly.

References:
- [app/actions/process-message.ts](../app/actions/process-message.ts) — main companion flow resolves user AI settings.
- [lib/ai-note-insights.ts](../lib/ai-note-insights.ts) — note insight extraction imports hosted `fastModel`.
- [app/actions/generate-insight.ts](../app/actions/generate-insight.ts) — legacy proactive writer imports hosted `companionModel`.

Remaining work:
- Route these paths through `resolveAiModelsForUser`, or explicitly document them as server-owned hosted processing until migrated.
- If `generate-insight.ts` is legacy-only, mark it clearly and avoid invoking it from new flows.

### 10. Medium: embeddings require server-owned OpenAI credentials but setup docs do not clearly say so

Status: open.

RAG embeddings currently require `OPENAI_API_KEY`, independent of BYOK provider settings.

References:
- [lib/rag/embedding.ts](../lib/rag/embedding.ts) — only `openai` is supported and `OPENAI_API_KEY` is required.
- [README.md](../README.md) — BYOK/model settings are documented, but server-owned embedding credentials are not called out clearly enough.

Remaining work:
- Document `OPENAI_API_KEY`, `ALIBI_EMBEDDING_MODEL`, `ALIBI_EMBEDDING_DIMENSIONS`, and `ALIBI_EMBEDDING_BATCH_SIZE`.
- Separate server-owned embeddings from user BYOK in setup docs and privacy/configuration language.

### 11. Low: static verification is still weaker than it looks

Status: partially improved, lint still open.

The unit test layer is now meaningful, but `pnpm lint` still calls `next lint`, which is incompatible with the installed Next.js version and should not be treated as a passing gate.

References:
- [package.json](../package.json) — `"lint": "next lint"`.
- [README.md](../README.md) — documents that lint is broken.

Remaining work:
- Replace `next lint` with a supported ESLint setup or remove the lint script until it is real.

## Resolved Or Superseded Findings

### Fresh schema now includes legacy `entries` and `proactive_messages`

Status: resolved for the portable migration path.

The 2026-05-05 review said the documented primary schema did not reproduce code paths that query `entries` and `proactive_messages`. The portable migration now creates both tables.

References:
- [db/migrations/001_initial_app_schema.sql](../db/migrations/001_initial_app_schema.sql) — `entries` table at lines 16-40.
- [db/migrations/001_initial_app_schema.sql](../db/migrations/001_initial_app_schema.sql) — `proactive_messages` table at lines 42-50.

Remaining caveat:
- `entries` and proactive messages remain legacy/reference paths for the current app. New chat logging writes to `time_blocks`.

### Unit test absence is resolved

Status: resolved, with integration/E2E gaps remaining.

The old review found no repo-local tests. The current repo has a Vitest unit suite covering notes, chat insights, memory context, dashboard data, block draft utilities, process-message semantic duration integration, secret crypto, AI settings, RAG chunking, model defaults, dashboard views, and voice recorder stop handling.

Current verification:
- `pnpm test:unit` passed on 2026-05-24: 15 files, 119 tests.

Remaining gaps:
- Broader integration tests for [app/actions/timer.ts](../app/actions/timer.ts) and non-duration [app/actions/process-message.ts](../app/actions/process-message.ts) flows are still not implemented.
- [tests/e2e/demo.test.ts](../tests/e2e/demo.test.ts) exists, but E2E coverage is still a small `/demo` skeleton.

### `coach` to `companion` rename remains acceptable

Status: acceptable.

Active product/runtime naming is mostly `companion`. Remaining `coach_*` references are migration compatibility artifacts and should be retained unless a deliberate migration cleanup is planned.

## Architecture Summary

The core direction is still coherent:
- `time_blocks` are the primary timeline container.
- Notes and note versions preserve human-authored evidence.
- Derived insight rows are replaceable interpretations, not authoritative records.
- Companion chat now has general and block-specific threads.
- BYOK, calendar sync, dashboard views, RAG chunking, and voice capture have expanded the system surface.

The main unresolved risks are timezone correctness, unbounded companion history loading, denormalized category integrity, incomplete broad integration/E2E coverage, and several portability/BYOK/RAG gaps introduced by newer retrieval and model-routing work. Chat duration semantics are now implemented and covered by focused server-action integration tests.

## Verification

Most recent verification recorded in this review cycle:
- `pnpm test:unit` passed on 2026-05-24: 15 files, 119 tests.
- `pnpm build` passed on 2026-05-24.
- Build emitted the existing Next.js multiple-lockfile workspace-root warning.
- `pnpm lint` remains broken and should not be treated as a gate.

## Testing Method

### Layer 1: Unit tests for pure logic — active

Current unit tests cover:
- note insight derivation;
- chat insight derivation;
- memory range/context formatting;
- dashboard data helpers;
- dashboard view spec/agent behavior;
- block draft utilities;
- time block display helpers;
- AI settings and model defaults;
- RAG chunking;
- secret encryption;
- voice recorder stop stability.

Important caveat: some tests still codify known-bad behavior around server-local day boundaries.

### Layer 2: Integration tests for server actions — still missing

Highest-priority integration targets:
- `app/actions/timer.ts`
- `app/actions/process-message.ts`

Priority behaviors:
- timer start/stop/resume;
- save/edit/delete block rules;
- note-version and insight regeneration;
- memory cache invalidation on block edits;
- chat clarification vs. auto-save decisions, including ongoing-duration open timers vs completed-duration blocks ending now;
- timezone-sensitive "today" range handling;
- BYOK model resolution on all model-using paths.

### Layer 3: End-to-end browser tests — skeleton only

Playwright exists and [tests/e2e/demo.test.ts](../tests/e2e/demo.test.ts) checks basic `/demo` loading, start/stop visibility, and opening the manual log form.

Remaining E2E coverage:
- `/demo` edit/delete, resume, local persistence, chat-created block, clear/import flows;
- authenticated `/app` timer/manual/chat logging flows;
- calendar/dashboard visibility;
- companion thread open/reopen behavior.

## Assumptions

- `/app`, `/app/calendar`, and `/app/dashboard` are the real authenticated product surfaces.
- `/demo` is a localStorage-backed demo path and can have separate constraints, but it should not contradict core evidence rules.
- `entries` and `proactive_messages` are legacy/reference paths unless intentionally revived.
- Legacy `coach_*` database references are intentionally preserved during migration.
