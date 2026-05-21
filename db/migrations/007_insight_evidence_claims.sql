alter table time_block_insights
  add column if not exists evidence_claims jsonb not null default '[]'::jsonb;

alter table companion_message_insights
  add column if not exists evidence_claims jsonb not null default '[]'::jsonb;
