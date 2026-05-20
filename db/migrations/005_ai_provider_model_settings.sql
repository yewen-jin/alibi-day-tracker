-- Store model choices per saved AI provider key, while keeping user_ai_settings
-- as the active provider selector.

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

insert into user_ai_provider_settings (
  user_id,
  provider,
  base_url,
  fast_model,
  companion_model,
  key_preview,
  disclosure_accepted_at,
  disabled_at,
  tested_at,
  last_error,
  created_at,
  updated_at
)
select
  user_id,
  provider,
  base_url,
  fast_model,
  companion_model,
  key_preview,
  disclosure_accepted_at,
  disabled_at,
  tested_at,
  last_error,
  created_at,
  updated_at
from user_ai_settings
where mode = 'custom'
on conflict (user_id, provider) do update set
  base_url = excluded.base_url,
  fast_model = excluded.fast_model,
  companion_model = excluded.companion_model,
  key_preview = excluded.key_preview,
  disclosure_accepted_at = excluded.disclosure_accepted_at,
  disabled_at = excluded.disabled_at,
  tested_at = excluded.tested_at,
  last_error = excluded.last_error,
  updated_at = now();

drop trigger if exists user_ai_provider_settings_set_updated_at on user_ai_provider_settings;
create trigger user_ai_provider_settings_set_updated_at
  before update on user_ai_provider_settings
  for each row execute function set_updated_at();
