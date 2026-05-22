---
name: alibi-custom-dashboard-generation
description: Use when working on Alibi custom dashboard generation, dashboard agent prompts, structured dashboard output validation, dashboard view refresh behavior, or investigating dashboard generation failures through dashboard_view_generation_logs.
---

# Alibi Custom Dashboard Generation

Use this skill when the task touches user-created dashboard views in `/app/dashboard`, the dashboard agent prompt, strict dashboard output schemas, generation retry behavior, or generation logs.

## Feature Summary

Custom dashboards let a user describe the view they want in natural language. The server builds an evidence packet from saved Alibi data, asks the dashboard agent to compose a fixed renderer-safe dashboard, validates the generated object, saves the view, and stores a run/log record.

The renderer remains a fixed palette:

- `metric_cards`
- `simple_chart`
- `observation_list`
- `pattern_cards`
- `source_panel`

The AI chooses how to arrange and fill those parts, but it must not invent arbitrary UI, markup, categories, tasks, ratings, sources, or evidence.

## Key Files

- `app/actions/dashboard-views.ts`
  - Server actions for creating, updating, refreshing, publishing, and archiving custom views.
  - Loads user data, builds the evidence packet, calls the dashboard agent, saves runs/logs.
- `lib/dashboard-view-agent.ts`
  - Dashboard agent prompt.
  - AI SDK structured output generation.
  - One repair attempt.
  - Strict fallback JSON extraction when a provider wraps valid JSON in prose.
  - Attempt logging callbacks.
- `lib/dashboard-view-spec.ts`
  - Zod schemas for `spec`, `result`, and evidence objects.
  - Evidence packet construction.
  - Renderer-bound validation.
- `lib/repositories/dashboard-views.ts`
  - Kysely repository for views, runs, and generation logs.
- `components/dashboard/custom-dashboard-renderer.tsx`
  - Safe renderer for the fixed dashboard palette.
- `db/migrations/008_dashboard_views.sql`
  - `dashboard_views` and `dashboard_view_runs`.
- `db/migrations/010_dashboard_view_generation_logs.sql`
  - `dashboard_view_generation_logs`.
- `tests/unit/dashboard-view-agent.test.ts`
  - Mocked model-output tests for success, repair, parse fallback, evidence rejection, and refresh preservation.

## Output Contract

Creation must produce:

```ts
{
  spec: DashboardViewSpec,
  result: DashboardViewResult
}
```

Update must produce the same shape as creation. Refresh must produce:

```ts
{
  result: DashboardViewResult
}
```

Rules:

- `spec.sections` describes UI structure only.
- `result.sections` contains generated content only.
- Section ids and types must match exactly between spec and result.
- Update may revise the saved spec and result to change rendering, section order, section types, titles, descriptions, metrics, and sources.
- Refresh must preserve the saved spec and regenerate only matching result sections.
- Metric card `value` fields are strings because they are display text.
- Chart point `value` fields are numbers.
- Evidence objects must be copied exactly from `packet.evidence`.
- Do not coerce malformed model output into valid-looking analysis.
- Do not alias invalid component names like `chart` to `simple_chart`.

## Evidence Rules

The evidence packet contains:

- Timed data: `blocks`, categories, duration, start/end, effort, satisfaction, and markers.
- Aggregates: time by category, hourly rhythm, effort, satisfaction.
- Text evidence: note, chat, and block excerpts.

Every qualitative claim in observations, pattern cards, and source panels should cite copied packet evidence. Unknown or altered evidence ids must fail validation.

## Generation Workflow

1. User submits the custom dashboard prompt.
2. `createDashboardViewDraftAction` loads the current user and dashboard input.
3. `buildDashboardEvidencePacket` builds a bounded evidence packet.
4. `generateDashboardCreateSnapshot` asks the dashboard agent for structured output.
5. The generated object is validated with:
   - `dashboardViewSpecSchema`
   - `dashboardViewResultSchema`
   - saved spec section matching
   - copied evidence matching
6. On failure, retry once with a repair prompt containing the validation issue and exact contract.
7. If still invalid, save an error run with a user-facing message.
8. Always save a generation log when the log table exists.

Refresh is the same pattern, except it passes the saved spec and validates that only matching `result.sections` are regenerated.

Update is different from refresh: it passes the saved spec, latest result, fresh evidence, and the user's update request, then replaces the saved spec and writes a new run. Use update when the user wants to change rendering or layout; use refresh when the user wants the same saved dashboard recomputed from newer evidence.

## Logging

`dashboard_view_runs` stores the current run status/result for a view.

`dashboard_view_generation_logs` stores audit data for create and refresh attempts:

- `action`: `create`, `refresh`, or `update`
- `status`: `success` or `error`
- `source_prompt`
- `model_version`
- `input_window_start` / `input_window_end`
- `evidence_summary`
- `attempts`
- `error`

JSONB inserts in `createDashboardViewGenerationLog` must serialize objects/arrays with `JSON.stringify(...)` and cast as `::jsonb`; passing plain JS objects directly can cause `invalid input syntax for type json`.

## Investigating Failures

Start with the latest generation logs:

```bash
set -a
source .env.local >/dev/null 2>&1
psql "$POSTGRES_URL_NON_POOLING" -P pager=off -c "
select
  created_at,
  action,
  status,
  model_version,
  left(source_prompt, 140) as prompt,
  evidence_summary,
  attempts,
  error
from dashboard_view_generation_logs
order by created_at desc
limit 8;
"
```

If `POSTGRES_URL` includes Supabase pooler-only query params that `psql` rejects, use `POSTGRES_URL_NON_POOLING`.

Interpretation:

- `No object generated: could not parse the response` means the provider returned text the AI SDK could not parse as structured output. It is not necessarily a lack of evidence.
- `Expected string, received number` on metric values means the model returned numeric display values in `metric_cards`; tighten prompt/schema handling, do not coerce silently.
- `Unrecognized key(s)` usually means the model put spec fields into result objects or used an unsupported shape.
- `unknown or altered evidence` means the model invented or modified evidence instead of copying packet evidence exactly.

## Implementation Guidance

- Keep interpretation in the dashboard agent prompt, not local parser heuristics.
- Keep validation strict at the rendering boundary.
- A fallback may extract JSON from raw model text, but the extracted object must still pass the exact same schemas.
- Avoid adding broad local normalization; it can turn invalid model output into misleading analysis.
- For saved-dashboard edits, prefer the update path over mutating renderer output by hand. The renderer should stay a fixed safe palette; the saved spec/result should change.
- When improving reliability, prefer clearer schema/prompt constraints, better logging, smaller packet shape, or provider/model-specific structured-output settings.

## Verification

Run:

```bash
pnpm test:unit
pnpm build
```

`npm run lint` is currently not a reliable gate in this repo.
