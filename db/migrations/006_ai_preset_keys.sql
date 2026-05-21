-- Allow multiple saved AI provider keys per user, discriminated by preset_id.
-- The existing (user_id, provider) primary key in user_ai_provider_settings and
-- (user_id, purpose, provider) unique key in user_secret_keys made it impossible
-- to save two distinct openai_compatible keys (e.g. DeepSeek + Qwen).
-- After this migration, preset_id is the discriminator. Legacy rows are
-- backfilled with preset_id = provider for back-compat.

-- 1. user_secret_keys: add preset_id, swap unique key.
alter table user_secret_keys
  add column if not exists preset_id text;

update user_secret_keys
   set preset_id = provider
 where preset_id is null;

alter table user_secret_keys
  alter column preset_id set not null;

alter table user_secret_keys
  drop constraint if exists user_secret_keys_user_id_purpose_provider_key;

alter table user_secret_keys
  add constraint user_secret_keys_user_purpose_preset_key
    unique (user_id, purpose, preset_id);

-- 2. user_ai_provider_settings: add preset_id, swap primary key.
alter table user_ai_provider_settings
  add column if not exists preset_id text;

update user_ai_provider_settings
   set preset_id = provider
 where preset_id is null;

alter table user_ai_provider_settings
  alter column preset_id set not null;

alter table user_ai_provider_settings
  drop constraint if exists user_ai_provider_settings_pkey;

alter table user_ai_provider_settings
  add primary key (user_id, preset_id);

-- 3. user_ai_settings: remember the active preset.
alter table user_ai_settings
  add column if not exists preset_id text;

update user_ai_settings
   set preset_id = provider
 where preset_id is null
   and mode = 'custom';
