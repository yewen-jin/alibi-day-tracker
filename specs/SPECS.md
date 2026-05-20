# Alibi - Product Spec

> Product and system contract. For implementation history, current status, and roadmap tracking, see [PROJECT.md](./PROJECT.md).

## Core Promise

> *Alibi is a digital mirror that tracks how you spend your day in depth, combining precise time blocking and flexible, timestamped CBT-style journaling. The aim is to build in-depth qualitative knowledge about your own productivity patterns over time.*

Not a planner. Not a scorecard. A reflective timeline with precision.

Alibi helps the user preserve evidence of what actually happened: what they did, what interrupted them, what they drifted into, what turned out useful, how it felt, and how those patterns change over time.

## Product Direction

Alibi is moving from a simple timer tracker toward a qualitative productivity pattern engine:

- **Time blocks are the timeline container.** Each block anchors experience to date, hour, start, end, duration, category, and tags.
- **Notes are the primary evidence source.** Journal-style notes capture the messy reality that simple task-duration tracking loses.
- **Chat is the elicitation layer.** The agent helps the user reconstruct what happened, name feelings, fill missing details, and log or edit blocks when natural language is easier.
- **Derived insights are replaceable interpretations.** AI output can summarize and structure, but raw notes and chat remain the truth.
- **Context belongs to Alibi, not the model vendor.** The app should retrieve and format its own evidence from the database so the companion model can be replaced without losing memory.
- **Integrations must be explicit and reversible.** Calendar, model-provider, and voice features require clear consent, narrow scopes, secret handling, and visible status/error states.
- **Future RAG should retrieve evidence, not vibes.** Any retrieval workflow should cite the original time block, note, chat turn, or derived observation it used.

## User Model

The user wants deeper self-knowledge about how they spend time. They may be trying to understand attention, energy, satisfaction, avoidance, creative momentum, context switching, or executive friction. Some users may recognize ADHD-style patterns, but the product is not limited to that identity or use case. A time block may not mean "I planned X and did X for Y hours."

The app must support records like:

- starting one thing and ending up spending most of the block on another;
- getting distracted but doing something useful;
- doing two activities in parallel;
- feeling guilty despite useful work;
- working hard without feeling satisfied;
- writing a later note that changes the interpretation of the block.

The goal is self-knowledge over time, not performance scoring.

## Interfaces

### Timer

The timer is a low-friction way to create a timeline anchor. Starting must not require task planning. Stopping creates or completes a `time_blocks` row, then the user can add details.

Required behavior:

- one active timer per user;
- start time preserved across refresh/navigation;
- stop writes a completed time block;
- latest completed block can be resumed from its original start time;
- metadata can be added after the fact.

### Manual Time Blocks

The user can create a completed time block without using the timer. Manual blocks are for backfilling missed work, reconstructing the day, or logging activity described in chat.

Required behavior:

- start and end time are editable;
- task name is required before save;
- category is required but can be user-created;
- hashtags and notes are optional;
- save writes the same `time_blocks` shape used by timer and chat.

### Public Demo

The public demo should let a visitor experience the app before creating an account. Demo data should use browser `localStorage` by default, not anonymous database rows.

Required behavior:

- visitor enters a name and starts a local demo session;
- timer, manual entry, OpenRouter-backed companion chat, block-specific threads, edit/delete, latest-block resume, custom categories, and dashboard mirror are available in demo form;
- completed demo blocks, active timer state, categories, chat messages, pending drafts, note-derived insights, chat-derived insights, demo AI token usage, and optional visitor-supplied AI endpoint settings are stored locally on the device;
- demo server actions may process a trimmed local snapshot for companion replies and note insights, but must not write demo records to Supabase;
- demo AI can use visitor-supplied OpenAI-compatible or Anthropic endpoint settings; otherwise it uses `OPENROUTER_DEMO_API_KEY` / demo model env vars, then the main OpenRouter defaults;
- demo AI calls must enforce a per-local-session token budget and gracefully fall back to local tracking or heuristic note insights when the budget is exhausted;
- no cleanup job is required because no anonymous database rows are created;
- if the visitor signs up or signs in on the same device, the authenticated app can import completed demo blocks into the real `time_blocks` table.

Temporary database-backed demo sessions are a future option only if the product needs cross-device demos or shared demo links.

### Notes

Notes are optional in the UI but structurally important to the pattern engine. The note field should invite "what really happened," including:

- actions actually performed;
- split attention or parallel activity;
- interruptions and useful distractions;
- friction, avoidance, or uncertainty;
- emotional state and body state;
- satisfaction, guilt, pride, or flatness;
- people, projects, context, and later reinterpretation.

When notes change, insight data derived from those notes must change too. Raw notes must never be overwritten by AI.

### Chat Agent

The companion is secondary to the timeline, but important for elicitation and reflection. It should help the user say what happened and how it felt, especially when the user does not yet have clean structured input.

The general companion thread can:

- respond conversationally without forcing a log;
- start or stop the active timer;
- create completed time blocks from clear natural-language logging intent;
- ask follow-up questions when task, time, or category is missing;
- help the user elaborate notes and emotional context;
- analyze saved blocks using notes first, then metadata, then linked chat, then general chat.

Each completed time block can also open a dedicated companion thread through "chat about this." This thread is one conversation per user/time block. Reopening the same block must return to the existing thread rather than creating duplicates.

Required behavior for block-specific companion threads:

- use the selected block as fixed context;
- include the block note as the highest-trust context for reflection;
- keep messages isolated from the general companion chat;
- discuss, summarize, reframe, and help the user reinterpret the block;
- avoid editing the block, creating new blocks, or operating timers in v1.

The agent must not guess missing time windows or silently invent categories when the user is uncertain. If information is necessary to write a valid block in the general thread, it asks. This applies to both time and category: a duration-only input is not enough to save a block, and a category inferred from keyword matching must be confirmed with the user before saving.

### Voice Chat

Voice is an alternate input/output surface for the same companion flow, not a separate assistant.

Required behavior:

- microphone input becomes a transcript, then the transcript is submitted through the existing `processCompanionMessage` flow;
- assistant text replies can optionally be played back as speech;
- mute/stop states must be visible and easy to control;
- raw audio must not be stored by default;
- Cartesia API keys and access tokens must never be exposed in page source, logs, or persistent client storage.

The first implementation uses push-to-talk browser recording with server-side batch transcription. Realtime streaming can be added later if latency becomes the main product constraint.

### Calendar And Mirror

The timeline interface should make days, gaps, and rhythms visible without treating empty time as failure.

The authenticated calendar workspace shows two linked views:

- a compact month calendar that makes block density and empty days visible;
- a selected-day 24-hour timeline that places completed blocks by local start/end time and colors them by category.

Selecting a day updates the daily timeline, clears any selected block detail/editor state, and restores the larger month-plus-day layout. First load should show only the month view and selected-day timeline, not an already-open block detail panel.

Selecting a timeline block opens an inline detail panel in the calendar workspace and narrows the month/timeline area to make room for it. The detail panel uses the same reusable time-block detail component as the tracker: time range and duration appear first, available actions appear next using flexbox, and category/task/notes/hashtags appear below. On wide tracker rows, time and actions may sit on one line; in compact calendar detail panels, actions can wrap under the time while remaining above the content.

Calendar block details support chat, edit, and delete. Block-specific chat opens the selected block's reflective companion thread; returning to main chat restores the general companion thread. Resume remains tracker-only.

### Google Calendar Sync

Google Calendar sync is separate from login OAuth. Connecting Google Calendar should request the narrowest practical calendar scope and should not imply Gmail access.

Required behavior:

- create or reuse a separate secondary Google calendar named `alibi`;
- sync completed `time_blocks` as Alibi-created events;
- track the mapping from `time_block_id` to `google_event_id`;
- track content hash, sync status, last error, and synced timestamp;
- auto-sync after save/edit/delete when connected;
- expose manual retry from `/app/calendar`;
- delete the Google event when an Alibi-created time block is deleted;
- keep imported/synced calendar events visually and semantically separate from Alibi source records.

The current sync contract is one-way export of Alibi blocks into the separate `alibi` calendar. Reading the user's existing agenda as contextual overlay is future work and should require a separate product decision.

The mirror/insight interface should surface observations such as:

- recurring friction by time of day;
- useful distractions;
- work that began as avoidance but produced value;
- categories or contexts that correlate with satisfaction;
- times where notes skew anxious, flat, proud, or guilty;
- repeated themes from chat that connect to dated blocks.

Every meaningful observation should have an evidence trail.

## Data Contract

### Source Hierarchy

Insight generation must use sources in this order:

1. `time_blocks.notes` - highest-trust human-written evidence tied to time.
2. `time_blocks` metadata - time, duration, category, tags, mood, effort, satisfaction, markers.
3. linked `companion_messages` - clarification and emotional context around a block.
4. general `companion_messages` - background narrative and recurring language.
5. `time_block_insights` and `companion_message_insights` - source-linked derived interpretations for retrieval and summaries, never more authoritative than raw input.

### Current Context Layer

The first companion memory layer is SQL-backed retrieval over the existing user-owned tables. It is not provider-native model memory and not yet vector RAG.

The context builder may retrieve:

- completed `time_blocks` in the relevant range;
- `time_block_insights` for those blocks;
- `companion_messages` linked to those blocks;
- `companion_message_insights` from the same range;
- the most recent visible thread messages.

Default scope is today. User language can expand context to yesterday, the last few days, week, or month. A complete time-block draft uses its explicit start/end window. This retrieval policy can interpret the user's analysis question, but it must not become a manual parser that writes time blocks.

### Current Core Tables

`time_blocks` is the primary timeline table. It stores start/end time, duration, task label, category slug/id, hashtags, notes, optional affect fields, marker booleans, and derived `agent_metadata`.

`active_timer` stores one running timer per user.

`time_block_categories` stores default and user-owned categories. Default categories remain available, but users can add their own while editing or chatting.

`time_block_note_versions` preserves meaningful note edits with previous text, new text, source, and timestamp.

`time_block_insights` stores derived interpretations from the latest relevant note version: actions, emotional tone, friction, avoidance, hyperfocus, satisfaction, uncertainty, people, projects, themes, source notes, and evidence excerpt.

`companion_conversations` stores one general thread per user and one optional block-specific thread per time block. Block conversations store a compact `context_snapshot` of the selected block so the companion can reflect from fixed block context without repeatedly loading broad history.

`companion_messages` stores thread-scoped chat history, records the conversation-level companion model, and can link messages to a related time block.

`companion_message_insights` stores derived interpretations from user-authored chat messages: actions they said they did, intentions, avoided or deferred items, friction, emotional language, useful drift, mismatch language, themes, and a source excerpt. It supports the dashboard chat mirror without forcing general chat into time blocks.

`companion_drafts` stores temporary clarification state for the general companion thread when the agent needs more information before writing a valid time block.

`user_secret_keys` stores encrypted secrets such as user AI provider keys and Google refresh tokens. The client must only receive masked previews.

`user_ai_settings` stores hosted/custom AI mode, provider id, provider base URL when applicable, model ids, disclosure acceptance, test status, disabled state, and last error.

`user_ai_provider_settings` stores provider-scoped BYOK settings. Each saved provider key can have its own base URL, fast model, companion model, key preview, disclosure acceptance, test status, disabled state, and last error. `user_ai_settings` remains the active provider selector for runtime resolution.

`google_calendar_connections` stores the user's Google Calendar connection state and the secondary `alibi` calendar id.

`google_calendar_event_syncs` stores per-time-block Google event sync state: event id, content hash, status, last error, and synced timestamp.

Legacy `coach_messages` and `coach_drafts` may remain in existing databases temporarily. The additive migration copies them into the new `companion_*` tables without deleting or overwriting legacy rows.

`entries` is legacy-only unless a future feature intentionally reuses it as a separate quick-note surface.

### Future Data Model Direction

The data model should evolve toward timeline-linked evidence, not a single flattened productivity row. Future schema work may add:

- `block_evidence_items` for atomic extracted claims from notes/chat, each tied to a source and time block;
- `projects` and child project-segment tables for grouping time blocks by concrete work stream, plus focused/non-focused allocations inside a block;
- break/event tables linked to the active timer or time block so breaks can be tracked without interrupting the underlying block;
- `pattern_observations` for longitudinal observations across many blocks;
- `rag_documents` or `rag_chunks` for retrievable note/chat/insight snippets with source pointers;
- embedding storage for retrieval once there is enough real user data to justify RAG;
- relationship fields for multi-activity or "attention shifted from A to B" blocks.

Agentic schema evolution must be migration-reviewed. The agent may propose database changes or draft migration SQL, but production schema changes should remain explicit human-applied migrations.

## AI Behavior

The agent's job is to elicit, preserve, and reflect evidence.

AI calls should use a split-model strategy:

- fast, low-cost models for mechanical work such as intent routing, structured extraction, and terse acknowledgments;
- stronger companion models for user-visible reflection, saved-block analysis, and proactive insight text where tone, restraint, and evidence grounding matter.

Hosted defaults use OpenRouter. Authenticated users may choose custom provider mode with an encrypted user-owned API key.

BYOK requirements:

- supported providers must be allowlisted;
- API keys must be encrypted server-side and never returned to the client;
- the UI must show only masked previews;
- users must be able to test, disable, and delete custom settings;
- provider/key management must be separate from model selection so saved keys can be reused while changing fast and companion model IDs;
- model choices must be scoped to the saved provider key, not global across all saved keys;
- users must be able to select a saved provider key and restore that key's model IDs;
- users must be able to reset the selected provider key's model choices to the app's default fast and companion model IDs;
- settings must show current mode, active provider, active model IDs, key preview, saved keys, and test status;
- users must explicitly acknowledge that Alibi will send chat, notes, time blocks, and memory context to their selected provider;
- generated messages and insights should persist the provider/model metadata used for the generation.

The reusable companion voice prompt should stay centralized in code so chat, analysis, and proactive insight copy share the same product voice.

The companion model should receive an Alibi-built memory packet rather than relying on the model provider's chat memory. This keeps the product portable across OpenRouter, ChatGPT, Claude, or future bring-your-own-model flows while preserving the same evidence hierarchy.

It should:

- ask gentle follow-ups that help the user reconstruct what happened;
- invite feelings and context without turning the app into a therapy bot;
- use lowercase, calm, specific language in reflective responses;
- sound like a close, observant friend rather than a productivity app;
- prefer "in your note, you wrote..." over generic analysis;
- cite dates, block labels, note excerpts, or chat context when making observations;
- acknowledge useful drift and mixed outcomes.

It must not:

- push goals, streaks, ratings, or productivity judgments;
- overwrite user notes with AI wording;
- present derived insight as certain truth;
- mutate database structure autonomously;
- create logs when required details are missing.
- let block-specific reflective threads mutate time blocks or timers.
- expose API keys, Google refresh tokens, Cartesia tokens, or raw audio in UI/logs.

## Guardrails

Alibi is not:

| Not | Reason |
| --- | --- |
| A planner | Planning is often the friction. |
| A to-do list | Tasks create expectation; Alibi collects evidence. |
| A goal-setter | Goals invite comparison. |
| A performance optimizer | The product builds self-knowledge rather than prescribing maximization. |
| A productivity scorecard | Scores and rankings create judgment. |
| A vague chatbot | Chat writes through structured time-block operations. |
| A therapy app | Journaling can be CBT-style and reflective, but Alibi does not provide treatment. |
| A generic wellness journal | The product is anchored to timestamped time blocks and evidence trails. |
| A Gmail client | Calendar sync is for Google Calendar only; email import is separate future work. |

If a feature makes the user feel pushed, ranked, or corrected, it does not fit.

## Success Criteria

The qualitative pattern engine is working when:

- the user can write nuanced journal-style notes on time blocks;
- editing notes updates derived insights while preserving note history;
- chat can help the user reconstruct activity and feelings without forcing a log;
- timer, manual entry, and chat all write the same time-block data model;
- dashboard and chat analysis prioritize note evidence;
- observations can point back to dated, timed source material;
- future RAG work has clean source records to retrieve from.
- integration features are consented, inspectable, revocable, and scoped to the minimum data needed.
