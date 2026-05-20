-- Compatibility bridge for existing Supabase-backed Alibi databases.
--
-- Older app-data tables reference auth.users directly. Current server code also
-- expects an app-owned user registry for profile/admin metadata.

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  auth_provider text not null default 'supabase',
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users
  add column if not exists email text,
  add column if not exists auth_provider text not null default 'supabase',
  add column if not exists role text not null default 'user',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.app_users
set role = 'user'
where role is null or role not in ('user', 'superadmin');

alter table public.app_users
  alter column auth_provider set default 'supabase',
  alter column auth_provider set not null,
  alter column role set default 'user',
  alter column role set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.app_users
  drop constraint if exists app_users_role_check;

alter table public.app_users
  add constraint app_users_role_check
  check (role in ('user', 'superadmin'));

insert into public.app_users (id, email, auth_provider, created_at, updated_at)
select
  users.id,
  users.email,
  'supabase',
  coalesce(users.created_at, now()),
  now()
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  auth_provider = excluded.auth_provider,
  updated_at = now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_users_updated_at on public.app_users;
create trigger set_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;

drop policy if exists "Users can select their own app user" on public.app_users;
create policy "Users can select their own app user"
on public.app_users for select
using (auth.uid() = id);
