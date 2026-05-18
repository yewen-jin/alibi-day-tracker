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
- pure helpers extracted from `process-message.ts` into `lib/block-draft-utils.ts` (`deriveWindow`, `resolveCategory`, `inferCategoryFromText`, `getDayRange`, `CompanionDraft`) so they are independently testable without the `"use server"` boundary.

## Current Status

Branch: `dev`

Database setup:

- `active_timer`, `time_blocks`, `entries`, and `proactive_messages` are live and REST-visible.
- V3 additions are applied and REST-visible: `time_block_categories`, `time_block_note_versions`, `time_block_insights`, `time_blocks.category_id`, and `time_blocks.agent_metadata`.
- Companion chat tables are the current app path: `companion_conversations`, `companion_messages`, `companion_message_insights`, and `companion_drafts`.
- Existing legacy `coach_messages` / `coach_drafts` are preserved by additive migration and copied into the general companion thread.
- Default category rows are visible through REST.
- `entries` remains legacy-only for the current app path.

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

AI model routing:

- OpenRouter access is centralized in `lib/ai.ts`.
- `fastModel` uses `openai/gpt-4.1-nano` for routing, structured extraction, and short acknowledgments.
- `companionModel` uses `openai/gpt-5-mini` for user-visible companion chat, saved-block analysis, and proactive insight copy.
- New `companion_messages` rows record the conversation-level companion model in `model`; the Supabase backfill script preserves legacy rows as `openai/gpt-4o-mini`.
- Companion-facing prompts share the reusable `alibiCompanionGuide` in `lib/companion-voice.ts`.

UI status:

- `/app` has timer, post-stop/manual block editor, daily add-block button, a calendar shortcut button, latest-block resume, chat panel, and simple daily block list.
- Daily block rows include `chat about this`, which opens or reopens the block's reflective companion thread. Shared time-block detail rows place time/duration first, actions beside it when space allows, and content below so tracker rows and compact calendar detail panels use the same responsive flex layout.
- The resume button is removed from the DOM while a timer is active; when no timer is active, only the latest completed block can be resumed.
- `/app/dashboard` has totals, pattern markers, notes mirror, and chat mirror.
- `/app/calendar` is the timeline-first workspace: completed blocks are positioned by local start/end time, colored by category, selectable for inline detail, and support the same chat/edit/delete controls as tracker block rows. First load shows only the month view plus selected-day timeline; selecting a timeline block opens the inline detail panel and narrows the month/timeline area, while selecting a day clears detail/editor state and restores the larger month/day view. Resume stays tracker-only.
- `/app/calendar` hydrates the same general companion thread as `/app` on first render. Block-specific chat still switches to that block's reflective thread, and `main chat` returns to the general thread.
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

- `pnpm build` passes.
- `pnpm test` passes — unit tests cover note insights, chat insights, memory-context range/formatting, dashboard data including daily timeline placement helpers, and block draft utilities (Vitest).
- Playwright E2E skeleton exists at `tests/e2e/demo.test.ts`; integration tests for server actions are not yet implemented.
- Hosted schema was checked through Supabase REST table/column probes.
- Authenticated browser QA is still needed for note-save, note-edit insight regeneration, custom category creation, chat logging, chat analysis, and dashboard display.

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

## Current Gaps

- Weekly and monthly timeline analysis views remain pending beyond the current calendar month view plus selected-day timeline.
- External calendar/todo/agenda overlays are not implemented yet. Future work should explore Google Calendar or other calendar APIs/MCP connectors so scheduled events and tasks can appear alongside Alibi time blocks.
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

## Roadmap

### Phase 1 - Live QA And Copy Alignment

- Run authenticated smoke tests for note save/edit, custom categories, chat logging, chat analysis, and dashboard notes mirror.
- Smoke test `/demo` localStorage persistence, timer stop/edit, manual block save, chat-created block, resume, clear demo, sign-up/sign-in, and authenticated import.
- Keep `/app/docs` as a wiki, not a feature list. It should explain what Alibi is, how it works, how to write useful notes, and how to prompt chat well.
- Fix any remaining UI copy that treats notes as a minor optional field instead of primary evidence.

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

- Explore Google Calendar, external calendar APIs, or MCP connectors for user-authorized calendar/todo/agenda access.
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

Run live authenticated QA for memory-grounded companion chat across today, yesterday, and "last few days" prompts, then build richer week/month summaries that combine notes, metadata, and chat-derived insights while preserving source hierarchy.
