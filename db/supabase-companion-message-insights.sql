-- Alibi companion chat insight migration.
-- Run this after companion_conversations and companion_messages exist.
-- This is additive: raw companion chat remains unchanged.

create extension if not exists pgcrypto;

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

create index if not exists companion_message_insights_user_created_at_idx
  on public.companion_message_insights (user_id, created_at desc);

create index if not exists companion_message_insights_user_scope_idx
  on public.companion_message_insights (user_id, scope);

create index if not exists companion_message_insights_related_block_idx
  on public.companion_message_insights (related_time_block_id)
  where related_time_block_id is not null;

alter table public.companion_message_insights enable row level security;

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
