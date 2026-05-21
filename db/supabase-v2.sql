-- Alibi v2 timer schema.
-- Run this in Supabase SQL editor after the existing v1 entries schema.

create extension if not exists pgcrypto;

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer generated always as (
    case
      when ended_at is null then null
      else floor(extract(epoch from ended_at - started_at))::integer
    end
  ) stored,
  task_name text,
  category text,
  category_id uuid,
  hashtags text[] not null default '{}',
  notes text,
  mood text check (
    mood is null
    or mood in ('joyful', 'neutral', 'flat', 'anxious', 'guilty', 'proud')
  ),
  effort_level text check (
    effort_level is null
    or effort_level in ('easy', 'medium', 'hard', 'grind')
  ),
  satisfaction text check (
    satisfaction is null
    or satisfaction in ('satisfied', 'mixed', 'frustrated', 'unclear')
  ),
  avoidance_marker boolean not null default false,
  hyperfocus_marker boolean not null default false,
  guilt_marker boolean not null default false,
  novelty_marker boolean not null default false,
  agent_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_blocks_ended_after_started check (
    ended_at is null or ended_at > started_at
  )
);

alter table public.time_blocks
  add column if not exists agent_metadata jsonb not null default '{}',
  add column if not exists category_id uuid;

alter table public.time_blocks
  drop constraint if exists time_blocks_category_check;

create table if not exists public.time_block_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null,
  color text not null default '#43849D' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists time_block_categories_default_slug_idx
  on public.time_block_categories (slug)
  where user_id is null;

create unique index if not exists time_block_categories_user_slug_idx
  on public.time_block_categories (user_id, slug)
  where user_id is not null;

alter table public.time_blocks
  drop constraint if exists time_blocks_category_id_fkey,
  add constraint time_blocks_category_id_fkey
    foreign key (category_id) references public.time_block_categories(id) on delete set null;

insert into public.time_block_categories (slug, name, color, is_default)
values
  ('deep_work', 'deep work', '#3253C7', true),
  ('admin', 'admin', '#6B7DD6', true),
  ('social', 'social', '#BF7DAD', true),
  ('errands', 'errands', '#43849D', true),
  ('care', 'care', '#2F8F72', true),
  ('creative', 'creative', '#7A5CC7', true),
  ('rest', 'rest', '#C88A2D', true)
on conflict do nothing;

create table if not exists public.time_block_note_versions (
  id uuid primary key default gen_random_uuid(),
  time_block_id uuid not null references public.time_blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_notes text,
  new_notes text,
  source text not null default 'manual' check (source in ('manual', 'chat', 'agent')),
  created_at timestamptz not null default now(),
  constraint time_block_note_versions_changed check (
    coalesce(previous_notes, '') <> coalesce(new_notes, '')
  )
);

create table if not exists public.time_block_insights (
  id uuid primary key default gen_random_uuid(),
  time_block_id uuid not null references public.time_blocks(id) on delete cascade,
  note_version_id uuid references public.time_block_note_versions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'notes' check (source in ('notes')),
  source_notes text,
  actions text[] not null default '{}',
  emotional_tone text,
  friction_points text[] not null default '{}',
  avoidance_signals text[] not null default '{}',
  hyperfocus_signals text[] not null default '{}',
  satisfaction_signals text[] not null default '{}',
  uncertainty_signals text[] not null default '{}',
  people text[] not null default '{}',
  projects text[] not null default '{}',
  themes text[] not null default '{}',
  evidence_excerpt text,
  evidence_claims jsonb not null default '[]'::jsonb,
  model_version text not null,
  created_at timestamptz not null default now(),
  unique (time_block_id)
);

alter table public.time_block_insights
  add column if not exists note_version_id uuid references public.time_block_note_versions(id) on delete set null,
  add column if not exists source_notes text,
  add column if not exists evidence_claims jsonb not null default '[]'::jsonb;

create table if not exists public.active_timer (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.companion_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'general' check (kind in ('general', 'time_block')),
  title text,
  related_time_block_id uuid references public.time_blocks(id) on delete set null,
  context_snapshot jsonb not null default '{"kind":"general"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companion_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.companion_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  message_type text not null default 'chat' check (
    message_type in ('chat', 'ack', 'clarification', 'analysis', 'error', 'context')
  ),
  model text not null default 'openai/gpt-5-mini',
  related_time_block_id uuid references public.time_blocks(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.companion_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.companion_conversations(id) on delete cascade,
  draft jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, conversation_id)
);

create table if not exists public.companion_message_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.companion_messages(id) on delete cascade,
  conversation_id uuid not null references public.companion_conversations(id) on delete cascade,
  related_time_block_id uuid references public.time_blocks(id) on delete set null,
  scope text not null default 'general' check (scope in ('general', 'time_block')),
  did_actions text[] not null default '{}',
  intended_actions text[] not null default '{}',
  avoided_or_deferred text[] not null default '{}',
  friction_points text[] not null default '{}',
  emotional_signals text[] not null default '{}',
  useful_drift text[] not null default '{}',
  mismatch_signals text[] not null default '{}',
  themes text[] not null default '{}',
  evidence_excerpt text,
  evidence_claims jsonb not null default '[]'::jsonb,
  model_version text not null,
  created_at timestamptz not null default now(),
  unique (message_id)
);

alter table public.companion_message_insights
  add column if not exists evidence_claims jsonb not null default '[]'::jsonb;

create index if not exists time_blocks_user_started_at_idx
  on public.time_blocks (user_id, started_at);

create index if not exists time_blocks_user_ended_at_idx
  on public.time_blocks (user_id, ended_at)
  where ended_at is not null;

create index if not exists time_blocks_user_category_id_idx
  on public.time_blocks (user_id, category_id);

create unique index if not exists companion_conversations_user_general_idx
  on public.companion_conversations (user_id)
  where kind = 'general' and related_time_block_id is null;

create unique index if not exists companion_conversations_user_block_idx
  on public.companion_conversations (user_id, related_time_block_id)
  where related_time_block_id is not null;

create index if not exists companion_messages_conversation_created_at_idx
  on public.companion_messages (conversation_id, created_at);

create index if not exists companion_messages_user_created_at_idx
  on public.companion_messages (user_id, created_at);

create index if not exists companion_drafts_user_status_idx
  on public.companion_drafts (user_id, status);

create index if not exists companion_message_insights_user_created_at_idx
  on public.companion_message_insights (user_id, created_at desc);

create index if not exists companion_message_insights_user_scope_idx
  on public.companion_message_insights (user_id, scope);

create index if not exists companion_message_insights_related_block_idx
  on public.companion_message_insights (related_time_block_id)
  where related_time_block_id is not null;

create index if not exists time_block_note_versions_block_created_at_idx
  on public.time_block_note_versions (time_block_id, created_at desc);

create index if not exists time_block_insights_user_block_idx
  on public.time_block_insights (user_id, time_block_id);

create or replace function public.set_time_blocks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_time_blocks_updated_at on public.time_blocks;

create trigger set_time_blocks_updated_at
before update on public.time_blocks
for each row
execute function public.set_time_blocks_updated_at();

alter table public.time_blocks enable row level security;
alter table public.time_block_categories enable row level security;
alter table public.active_timer enable row level security;
alter table public.companion_conversations enable row level security;
alter table public.companion_messages enable row level security;
alter table public.companion_drafts enable row level security;
alter table public.companion_message_insights enable row level security;
alter table public.time_block_note_versions enable row level security;
alter table public.time_block_insights enable row level security;

drop policy if exists "Users can select their own time blocks" on public.time_blocks;
create policy "Users can select their own time blocks"
on public.time_blocks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own time blocks" on public.time_blocks;
create policy "Users can insert their own time blocks"
on public.time_blocks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own time blocks" on public.time_blocks;
create policy "Users can update their own time blocks"
on public.time_blocks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own time blocks" on public.time_blocks;
create policy "Users can delete their own time blocks"
on public.time_blocks
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select default and own categories" on public.time_block_categories;
create policy "Users can select default and own categories"
on public.time_block_categories
for select
using (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can insert their own categories" on public.time_block_categories;
create policy "Users can insert their own categories"
on public.time_block_categories
for insert
with check (auth.uid() = user_id and is_default = false);

drop policy if exists "Users can update their own categories" on public.time_block_categories;
create policy "Users can update their own categories"
on public.time_block_categories
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id and is_default = false);

drop policy if exists "Users can delete their own categories" on public.time_block_categories;
create policy "Users can delete their own categories"
on public.time_block_categories
for delete
using (auth.uid() = user_id and is_default = false);

drop policy if exists "Users can select their own active timer" on public.active_timer;
create policy "Users can select their own active timer"
on public.active_timer
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own active timer" on public.active_timer;
create policy "Users can insert their own active timer"
on public.active_timer
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own active timer" on public.active_timer;
create policy "Users can update their own active timer"
on public.active_timer
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own active timer" on public.active_timer;
create policy "Users can delete their own active timer"
on public.active_timer
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select their own companion conversations" on public.companion_conversations;
create policy "Users can select their own companion conversations"
on public.companion_conversations
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own companion conversations" on public.companion_conversations;
create policy "Users can insert their own companion conversations"
on public.companion_conversations
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own companion conversations" on public.companion_conversations;
create policy "Users can update their own companion conversations"
on public.companion_conversations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own companion conversations" on public.companion_conversations;
create policy "Users can delete their own companion conversations"
on public.companion_conversations
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select their own companion messages" on public.companion_messages;
create policy "Users can select their own companion messages"
on public.companion_messages
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own companion messages" on public.companion_messages;
create policy "Users can insert their own companion messages"
on public.companion_messages
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own companion messages" on public.companion_messages;
create policy "Users can update their own companion messages"
on public.companion_messages
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own companion messages" on public.companion_messages;
create policy "Users can delete their own companion messages"
on public.companion_messages
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select their own companion drafts" on public.companion_drafts;
create policy "Users can select their own companion drafts"
on public.companion_drafts
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own companion drafts" on public.companion_drafts;
create policy "Users can insert their own companion drafts"
on public.companion_drafts
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own companion drafts" on public.companion_drafts;
create policy "Users can update their own companion drafts"
on public.companion_drafts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own companion drafts" on public.companion_drafts;
create policy "Users can delete their own companion drafts"
on public.companion_drafts
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select their own companion message insights" on public.companion_message_insights;
create policy "Users can select their own companion message insights"
on public.companion_message_insights
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own companion message insights" on public.companion_message_insights;
create policy "Users can insert their own companion message insights"
on public.companion_message_insights
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own companion message insights" on public.companion_message_insights;
create policy "Users can update their own companion message insights"
on public.companion_message_insights
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own companion message insights" on public.companion_message_insights;
create policy "Users can delete their own companion message insights"
on public.companion_message_insights
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select their own note versions" on public.time_block_note_versions;
create policy "Users can select their own note versions"
on public.time_block_note_versions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own note versions" on public.time_block_note_versions;
create policy "Users can insert their own note versions"
on public.time_block_note_versions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can select their own time block insights" on public.time_block_insights;
create policy "Users can select their own time block insights"
on public.time_block_insights
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own time block insights" on public.time_block_insights;
create policy "Users can insert their own time block insights"
on public.time_block_insights
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own time block insights" on public.time_block_insights;
create policy "Users can update their own time block insights"
on public.time_block_insights
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own time block insights" on public.time_block_insights;
create policy "Users can delete their own time block insights"
on public.time_block_insights
for delete
using (auth.uid() = user_id);
