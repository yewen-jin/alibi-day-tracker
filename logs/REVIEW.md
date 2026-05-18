# Review

Date: 2026-05-05

This review covers architecture decisions, database schema, project efficiency, bugs, software design, and the `coach` to `companion` naming transition. Product intent was grounded in [PROJECT.md](./PROJECT.md), [SPECS.md](./SPECS.md), and [README.md](./README.md).

## Findings

### 1. High: chat logging can fabricate evidence instead of eliciting it

The chat flow currently auto-builds a time window from duration-only input and auto-infers a category from text, then saves the block without clarification. That conflicts with the product contract that missing time/category must be asked for, not guessed.

References:
- [lib/block-draft-utils.ts](./lib/block-draft-utils.ts) — `deriveWindow` (duration-only fallback, lines 92–100)
- [lib/block-draft-utils.ts](./lib/block-draft-utils.ts) — `resolveCategory` (inferred source path, lines 119–128)
- [app/actions/process-message.ts](./app/actions/process-message.ts) — category gate (lines 1348–1361)
- [SPECS.md](./SPECS.md:115)

**Status (2026-05-05): open — proposed, not yet implemented.**

Two sub-issues:

**1a. Duration-only window** — `deriveWindow` in `lib/block-draft-utils.ts` builds a `now`-anchored window when only `duration_minutes` is provided, inventing when the work happened. Fix: remove that final branch so a duration-only draft returns `null`. The existing clarification gate at `process-message.ts:1319–1332` already handles a null window by asking "what time was that, or about how long did it take?" — it just never fires because `deriveWindow` currently returns a window instead of null.

**1b. Silent save on inferred category** — `resolveCategory` returns `source: "inferred"` when a category is matched from keywords, but the save gate at `process-message.ts:1348–1361` only asks for clarification when category is `null`. Fix: also clarify when `source === "inferred"`, offering the inferred value as a suggestion:

```ts
const { category, source } = resolveCategory(mergedDraft)
if (!category || source === "inferred") {
  const question = source === "inferred"
    ? `should i file it under ${category}, or something else?`
    : clarificationQuestion(mergedDraft)
  await savePendingDraft(supabase, user.id, conversation.id, mergedDraft)
  return finishWithAssistant({ type: "clarify", question, draft: mergedDraft }, question, "clarification")
}
```

### 2. High: "today" is not timezone-safe in chat analysis

The tracker UI computes the current day in the browser, but server-side chat analysis uses `new Date()` and `setHours()` on the server. Users outside the server timezone can get the wrong block set for prompts like "what did I do today?"

References:
- [lib/block-draft-utils.ts](./lib/block-draft-utils.ts) — `getDayRange` (lines 130–141)
- [app/actions/process-message.ts](./app/actions/process-message.ts) — `companionChat` calls `getDayRange()` with no timezone
- [app/actions/process-message.ts](./app/actions/process-message.ts) — `analyseBlocks` calls `getAnalysisRange` which falls back to `getDayRange()`

**Status (2026-05-05): open — proposed, not yet implemented.**

`getDayRange` was extracted to `lib/block-draft-utils.ts` (previously inline in `process-message.ts`) but its implementation is unchanged. The `timezone` string already arrives in `processCompanionMessage` via `input.timezone` and is passed to the LLM router, but not forwarded to `getDayRange`.

Fix: add a `timezone?: string | null` parameter to `getDayRange` and compute midnight using the user's elapsed local time rather than `setHours(0,0,0,0)` on the server. Thread `timezone` from `processCompanionMessage` through `companionChat` and `analyseBlocks` (both call `getDayRange`). Use `date-fns-tz` (`date-fns` is already a dependency) for `startOfDay`/`endOfDay` rather than a manual elapsed-time calculation.

### 3. Medium: the documented primary schema does not fully reproduce the repo's data access surface

The docs point fresh setups at `supabase-v2.sql`, but legacy code still queries `entries` and `proactive_messages`, and those tables are not created anywhere under `db/`. On a fresh environment, those paths fail.

References:
- [README.md](./README.md:115)
- [app/actions/get-entries.ts](./app/actions/get-entries.ts:18)
- [app/actions/proactive-messages.ts](./app/actions/proactive-messages.ts:15)
- [app/actions/generate-insight.ts](./app/actions/generate-insight.ts:48)

### 4. Medium: chat history loading is unbounded and will get slower with usage

`fetchCoachMessagesForUser` reads the full transcript every time, then callers slice it locally or filter it in memory. That affects normal chat, analysis, and initial hydration.

References:
- [app/actions/process-message.ts](./app/actions/process-message.ts:547)
- [app/actions/process-message.ts](./app/actions/process-message.ts:642)
- [app/actions/process-message.ts](./app/actions/process-message.ts:675)
- [app/actions/process-message.ts](./app/actions/process-message.ts:976)

### 5. Medium: the schema stores category twice without a database invariant

`time_blocks.category` and `time_blocks.category_id` can drift from each other. Application code writes both, but Postgres does not enforce that the slug matches the referenced category row. That is a long-term data integrity risk.

References:
- [db/supabase-v2.sql](./db/supabase-v2.sql:18)
- [db/supabase-v2.sql](./db/supabase-v2.sql:74)
- [app/actions/timer.ts](./app/actions/timer.ts:936)
- [app/actions/timer.ts](./app/actions/timer.ts:1057)

### 6. Medium: the rhythm view under-represents when time was actually spent

The dashboard aggregates only the start hour of each block, but the UI presents it as "by hour" / "when you track". Long blocks crossing multiple hours are undercounted.

References:
- [lib/dashboard-data.ts](./lib/dashboard-data.ts:109)
- [components/dashboard/rhythm-chart.tsx](./components/dashboard/rhythm-chart.tsx:65)

### 7. Low: static verification is weaker than it looks

`npm run build` passes, but `npm run lint` is broken because the script still calls `next lint` on Next 16. There is also no repo test suite outside dependency artifacts.

References:
- [package.json](./package.json:9)

**Status (2026-05-05):** Unit test layer implemented (see Testing Method section). The broken `next lint` script is still unresolved.

## Architecture Summary

The core V3 direction is coherent:
- one primary timeline table for saved work;
- note versioning that preserves user-authored history;
- derived note insight rows that are replaceable rather than authoritative;
- Supabase RLS and server actions as the main application boundary.

The main design problems are contract drift in chat logging, timezone correctness, leftover legacy surfaces that still shape the schema story, and a lack of bounded history access in companion chat.

## Verification

What I verified:
- `npm run build` passes.
- `npm run lint` fails because the current script is incompatible with the installed Next.js version.
- No repo-local tests were found.

**Updated (2026-05-05):** `npm run test` passes — 37 unit tests (Vitest). `npm run lint` still broken. Integration and full E2E layers not yet implemented.

## Testing Method

A three-layer approach matched to the current architecture and risk.

### Layer 1: Unit tests for pure logic — done

Pure logic that does not need React or Supabase, covered by Vitest:

| File | Tests | Status |
|---|---|---|
| `lib/note-insights.ts` | 12 | passing |
| `lib/dashboard-data.ts` | 9 | passing |
| `lib/block-draft-utils.ts` | 16 | passing |

The `block-draft-utils.ts` module was extracted from `process-message.ts` specifically to make `deriveWindow`, `resolveCategory`, `inferCategoryFromText`, and `getDayRange` importable by tests without crossing the `"use server"` boundary.

Coverage includes: note-derived marker extraction, duration/rhythm aggregation, category inference, time-window derivation (including all four `deriveWindow` branches), `getDayRange` midnight/span correctness with fake timers, and `resolveCategory` extracted/inferred/none paths.

### Layer 2: Integration tests for server actions — not yet implemented

The highest-risk code lives in:
- `app/actions/timer.ts`
- `app/actions/process-message.ts`

These should be tested with Supabase mocked at the query boundary and AI calls stubbed. Priority behavioral contracts:
- timer start/stop/resume flows;
- save/edit/delete block rules;
- note-version and insight regeneration behavior;
- chat clarification vs. auto-save decisions (ties directly to Findings 1a and 1b);
- timezone-sensitive "today" range handling (ties directly to Finding 2).

### Layer 3: End-to-end browser tests — skeleton only

Playwright is installed and configured. `tests/e2e/demo.test.ts` has a skeleton for:
- `/demo` page load and start-button visibility;
- start → stop timer flow;
- manual log form open.

Selectors are unconfirmed against the live UI. Remaining flows to cover:
- `/demo`: edit/delete, resume, local persistence;
- `/app`: authenticated timer flow, block save/edit, chat logging, dashboard visibility;
- companion thread open/reopen.

### Coverage priority

Do not chase blanket coverage first. Cover the surfaces that can silently corrupt evidence:
- time-window derivation;
- category resolution;
- note history preservation;
- insight refresh on edit;
- companion logging/clarification behavior;
- dashboard aggregation correctness.

## Naming Review: `coach` to `companion`

Status:
- Active product copy and current runtime naming are mostly switched to `companion`.
- Remaining database references to legacy `coach_*` tables are intentional and should be treated as compatibility artifacts, not inconsistencies.
- GitHub repo name and setup documentation now use `alibi-day-tracker`.

### Consistent now

- Product/docs language has largely moved to `companion`: [SPECS.md](./SPECS.md:94), [PROJECT.md](./PROJECT.md:88), [README.md](./README.md:107)
- Runtime chat code uses `companion_*`: [app/actions/process-message.ts](./app/actions/process-message.ts:547), [app/actions/process-message.ts](./app/actions/process-message.ts:715), [db/supabase-v2.sql](./db/supabase-v2.sql:134)
- Main app and demo input labels/IDs use `companion`: [components/timer-tracker-app.tsx](./components/timer-tracker-app.tsx:1084), [app/demo/page.tsx](./app/demo/page.tsx:897)
- Voice and prompt naming is aligned: [README.md](./README.md:109), [app/actions/process-message.ts](./app/actions/process-message.ts:10), [app/actions/generate-insight.ts](./app/actions/generate-insight.ts:17)

### Intentionally retained

- Legacy migration and backfill references to `coach_*` tables: [db/supabase-coach-message-model.sql](./db/supabase-coach-message-model.sql:1), [db/supabase-chat-history.sql](./db/supabase-chat-history.sql:98), [SPECS.md](./SPECS.md:162), [PROJECT.md](./PROJECT.md:72)
- Local workspace paths in this historical review may still show the old checkout directory name, but setup docs point to the renamed GitHub repo.

Conclusion:
- The rename is complete enough for the live app surface.
- Remaining `coach` references are acceptable under the current stated rule: keep legacy database references for migration compatibility.

## Assumptions

- `/app` and `/app/dashboard` are the real V3 surfaces.
- `entries` and `proactive_messages` are legacy paths unless intentionally revived.
- Legacy `coach_*` database references are intentionally preserved during migration.
