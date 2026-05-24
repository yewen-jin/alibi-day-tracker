create table if not exists voice_capture_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  session_id uuid not null,
  outcome text not null check (outcome in ('success', 'error', 'aborted')),
  error_message text,
  client_started_at timestamptz not null,
  client_finalized_at timestamptz not null,
  duration_ms integer,
  session_meta jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  server_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists voice_capture_logs_user_created_idx
  on voice_capture_logs (user_id, created_at desc);

create index if not exists voice_capture_logs_outcome_created_idx
  on voice_capture_logs (outcome, created_at desc);

create unique index if not exists voice_capture_logs_session_unique
  on voice_capture_logs (user_id, session_id);

alter table voice_capture_logs enable row level security;

drop policy if exists voice_capture_logs_own_rows on voice_capture_logs;
create policy voice_capture_logs_own_rows on voice_capture_logs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
