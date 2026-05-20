-- User integrations, BYOK model settings, and calendar sync state.

create table if not exists user_secret_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  purpose text not null check (purpose in ('ai_provider_key', 'google_refresh_token')),
  provider text not null,
  encrypted_value text not null,
  key_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, purpose, provider)
);

create table if not exists user_ai_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  mode text not null default 'hosted' check (mode in ('hosted', 'custom')),
  provider text not null default 'openrouter',
  base_url text,
  fast_model text not null default 'openai/gpt-4.1-nano',
  companion_model text not null default 'openai/gpt-5-mini',
  key_preview text,
  disclosure_accepted_at timestamptz,
  disabled_at timestamptz,
  tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_ai_provider_settings (
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null check (
    provider in ('openrouter', 'openai', 'openai_compatible', 'anthropic')
  ),
  base_url text,
  fast_model text not null default 'openai/gpt-4.1-nano',
  companion_model text not null default 'openai/gpt-5-mini',
  key_preview text,
  disclosure_accepted_at timestamptz,
  disabled_at timestamptz,
  tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists google_calendar_connections (
  user_id uuid primary key references app_users(id) on delete cascade,
  google_account_email text,
  google_calendar_id text,
  scope text not null,
  connected_at timestamptz not null default now(),
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists google_calendar_event_syncs (
  user_id uuid not null references app_users(id) on delete cascade,
  time_block_id uuid not null references time_blocks(id) on delete cascade,
  google_event_id text,
  content_hash text not null,
  sync_status text not null default 'pending' check (
    sync_status in ('pending', 'synced', 'failed', 'deleted')
  ),
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, time_block_id)
);

create index if not exists user_secret_keys_user_purpose_idx
  on user_secret_keys (user_id, purpose);

create index if not exists google_calendar_event_syncs_status_idx
  on google_calendar_event_syncs (user_id, sync_status);

drop trigger if exists user_secret_keys_set_updated_at on user_secret_keys;
create trigger user_secret_keys_set_updated_at
  before update on user_secret_keys
  for each row execute function set_updated_at();

drop trigger if exists user_ai_settings_set_updated_at on user_ai_settings;
create trigger user_ai_settings_set_updated_at
  before update on user_ai_settings
  for each row execute function set_updated_at();

drop trigger if exists user_ai_provider_settings_set_updated_at on user_ai_provider_settings;
create trigger user_ai_provider_settings_set_updated_at
  before update on user_ai_provider_settings
  for each row execute function set_updated_at();

drop trigger if exists google_calendar_connections_set_updated_at on google_calendar_connections;
create trigger google_calendar_connections_set_updated_at
  before update on google_calendar_connections
  for each row execute function set_updated_at();

drop trigger if exists google_calendar_event_syncs_set_updated_at on google_calendar_event_syncs;
create trigger google_calendar_event_syncs_set_updated_at
  before update on google_calendar_event_syncs
  for each row execute function set_updated_at();
