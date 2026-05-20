---
name: alibi-database-migration
description: Use when working on Alibi database portability, changing Postgres providers, moving remaining Supabase app-data access to repositories, or assessing what remains before switching database vendors. Covers the current Kysely/DATABASE_URL setup, portable migrations, Supabase Auth boundary, and cutover checklist.
---

# Alibi Database Migration

Use this skill when the task touches database-provider independence, migration SQL, repository cutovers, or a future move away from Supabase-hosted app data.

## Current Setup

- Framework: Next.js App Router with server actions in `app/actions/`.
- Current app-data direction: standard Postgres through Kysely + `pg`, configured by `DATABASE_URL` and optional `DATABASE_SSL=true`.
- DB client: `lib/db/client.ts`.
  - Server-only.
  - Exports `getDb()`.
  - Defines the typed Kysely `Database` table map.
- Auth boundary: `lib/auth/session.ts`.
  - Supabase Auth still owns login/session for now.
  - Use `getCurrentUser()`, `requireUser()`, or `requireSyncedUser()` instead of direct `supabase.auth.getUser()` in new server code.
  - `syncAppUser()` upserts Supabase-authenticated users into app-owned `app_users`.
- Portable schema: `db/migrations/001_initial_app_schema.sql`.
  - Creates `app_users`.
  - App-owned tables reference `app_users(id)`, not `auth.users(id)`.
  - Omits Supabase RLS policies; user ownership must be enforced in repository queries.
- Legacy Supabase schema files remain in `db/` as reference/backfill artifacts until the portable path is fully verified.
- Reference docs are under `specs/`; review/history logs are under `logs/`.

## Repository Status

Implemented Kysely repository paths:

- `lib/repositories/time-blocks.ts`
  - Completed time blocks.
  - Time block categories.
  - Time block insights for block ids.
- `lib/repositories/companion.ts`
  - Recent companion message insights.
  - Recent user companion messages.
- `lib/repositories/legacy.ts`
  - Legacy entries.
  - Unread proactive messages.
  - Mark proactive message read.

Currently migrated callers:

- `/app/dashboard`
- `/app/calendar`
- `app/actions/get-entries.ts`
- `app/actions/proactive-messages.ts`
- Some server auth checks in `/app` and docs routes now use the auth boundary.

Still using Supabase app-data API:

- Timer mutations and range reads in `app/actions/timer.ts`.
- Companion conversation/message/draft/insight writes in `app/actions/process-message.ts`.
- Proactive insight generation in `app/actions/generate-insight.ts`.
- Supabase Auth client and middleware remain intentionally in place.

## Migration Rules

- Do not introduce direct `supabase.from(...)` in new server app-data code.
- Keep Supabase client usage only for Auth until a separate auth-independence phase.
- Every repository function for user-owned data must accept `userId` explicitly and include a user predicate.
- Keep existing server action return shapes unless the caller is updated in the same change.
- Keep database clients out of client components.
- Prefer portable Postgres features: UUIDs, JSONB, arrays, generated columns, indexes, triggers.
- Do not add Supabase RLS policies to the portable migration path. Enforce ownership in SQL predicates and tests.
- Preserve legacy `coach_*` / Supabase SQL files as migration references until replacement migrations are verified.

## Provider Switch Checklist

When switching database providers:

1. Confirm provider supports standard Postgres features used by `db/migrations/001_initial_app_schema.sql`: `pgcrypto`, UUIDs, `timestamptz`, generated columns, JSONB, text arrays, partial indexes, and triggers.
2. Create a fresh database and set `DATABASE_URL`; set `DATABASE_SSL=true` only if the provider requires SSL.
3. Run `db/migrations/001_initial_app_schema.sql` against the new database.
4. Verify default `time_block_categories` exist.
5. Smoke test migrated repository paths first:
   - `/app/dashboard`
   - `/app/calendar`
   - `getEntries`
   - proactive message reads and mark-read
6. Move remaining Supabase app-data paths to repositories:
   - `app/actions/timer.ts`
   - `app/actions/process-message.ts`
   - `app/actions/generate-insight.ts`
7. Add repository tests for:
   - user-scoped reads;
   - user-scoped updates/deletes;
   - app-user upsert;
   - race-prone timer start/resume behavior.
8. Migrate/copy existing production data from Supabase tables to provider tables, mapping `auth.users.id` to `app_users.id`.
9. Run authenticated smoke tests for timer, manual block save/edit/delete, dashboard, calendar, companion chat, block-specific chat, and proactive insight generation.
10. Remove remaining Supabase app-data usage only after the app works fully through `DATABASE_URL`.

## Useful Commands

```bash
rg "supabase\\.from|auth\\.getUser\\(" app lib
npm run test:unit
npm run build
```

`npm run lint` is currently not a reliable gate in this repo.
