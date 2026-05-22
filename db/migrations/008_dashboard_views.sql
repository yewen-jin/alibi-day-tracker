create table if not exists dashboard_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  source_prompt text not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (user_id, slug)
);

create table if not exists dashboard_view_runs (
  id uuid primary key default gen_random_uuid(),
  dashboard_view_id uuid not null references dashboard_views(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  status text not null check (status in ('success', 'error')),
  input_window_start timestamptz,
  input_window_end timestamptz,
  result jsonb,
  model_version text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_views_user_status_idx
  on dashboard_views (user_id, status, created_at);

create index if not exists dashboard_view_runs_view_created_idx
  on dashboard_view_runs (dashboard_view_id, created_at desc);

drop trigger if exists set_dashboard_views_updated_at on dashboard_views;
create trigger set_dashboard_views_updated_at
before update on dashboard_views
for each row
execute function set_updated_at();

alter table dashboard_views enable row level security;
alter table dashboard_view_runs enable row level security;

drop policy if exists dashboard_views_own_rows on dashboard_views;
create policy dashboard_views_own_rows on dashboard_views
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists dashboard_view_runs_own_rows on dashboard_view_runs;
create policy dashboard_view_runs_own_rows on dashboard_view_runs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
