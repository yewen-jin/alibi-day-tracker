create table if not exists dashboard_view_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  dashboard_view_id uuid references dashboard_views(id) on delete set null,
  action text not null check (action in ('create', 'refresh')),
  status text not null check (status in ('success', 'error')),
  source_prompt text not null,
  model_version text,
  input_window_start timestamptz,
  input_window_end timestamptz,
  evidence_summary jsonb not null default '{}'::jsonb,
  attempts jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_view_generation_logs_user_created_idx
  on dashboard_view_generation_logs (user_id, created_at desc);

create index if not exists dashboard_view_generation_logs_view_created_idx
  on dashboard_view_generation_logs (dashboard_view_id, created_at desc);

alter table dashboard_view_generation_logs enable row level security;

drop policy if exists dashboard_view_generation_logs_own_rows on dashboard_view_generation_logs;
create policy dashboard_view_generation_logs_own_rows on dashboard_view_generation_logs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
