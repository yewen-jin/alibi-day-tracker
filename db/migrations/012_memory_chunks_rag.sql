create extension if not exists vector;

create table if not exists memory_chunks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (
    source_type in (
      'time_block',
      'time_block_insight',
      'companion_message',
      'companion_message_insight',
      'time_block_note_version'
    )
  ),
  source_id text not null,
  source_created_at timestamptz not null,
  chunk_index integer not null default 0,
  chunk_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  content_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'embedded', 'failed', 'stale')),
  error text,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rag_retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  use_case text not null check (
    use_case in (
      'companion_chat',
      'companion_analysis',
      'dashboard_create',
      'dashboard_refresh',
      'dashboard_update'
    )
  ),
  query text not null,
  source_types text[],
  date_range_start timestamptz,
  date_range_end timestamptz,
  match_count integer not null default 0,
  top_source_ids text[] not null default '{}',
  max_similarity double precision,
  min_similarity double precision,
  status text not null default 'success' check (status in ('success', 'fallback', 'error')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists memory_chunks_user_source_created_idx
  on memory_chunks (user_id, source_type, source_created_at desc);

create unique index if not exists memory_chunks_source_chunk_idx
  on memory_chunks (user_id, source_type, source_id, chunk_index);

create index if not exists memory_chunks_embedding_hnsw_idx
  on memory_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null and status = 'embedded';

create index if not exists rag_retrieval_logs_user_created_idx
  on rag_retrieval_logs (user_id, created_at desc);

drop trigger if exists set_memory_chunks_updated_at on memory_chunks;
create trigger set_memory_chunks_updated_at
before update on memory_chunks
for each row execute function set_updated_at();

alter table memory_chunks enable row level security;
alter table rag_retrieval_logs enable row level security;

drop policy if exists memory_chunks_own_rows on memory_chunks;
create policy memory_chunks_own_rows on memory_chunks
  for select using (auth.uid() = user_id);

drop policy if exists rag_retrieval_logs_own_rows on rag_retrieval_logs;
create policy rag_retrieval_logs_own_rows on rag_retrieval_logs
  for select using (auth.uid() = user_id);

create or replace function match_memory_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count integer default 12,
  match_source_types text[] default null,
  match_start timestamptz default null,
  match_end timestamptz default null,
  min_similarity double precision default 0.2
)
returns table (
  id text,
  user_id uuid,
  source_type text,
  source_id text,
  source_created_at timestamptz,
  chunk_index integer,
  chunk_text text,
  metadata jsonb,
  content_hash text,
  similarity double precision
)
language sql
stable
as $$
  select
    memory_chunks.id,
    memory_chunks.user_id,
    memory_chunks.source_type,
    memory_chunks.source_id,
    memory_chunks.source_created_at,
    memory_chunks.chunk_index,
    memory_chunks.chunk_text,
    memory_chunks.metadata,
    memory_chunks.content_hash,
    1 - (memory_chunks.embedding <=> query_embedding) as similarity
  from memory_chunks
  where memory_chunks.user_id = match_user_id
    and memory_chunks.embedding is not null
    and memory_chunks.status = 'embedded'
    and (match_source_types is null or memory_chunks.source_type = any(match_source_types))
    and (match_start is null or memory_chunks.source_created_at >= match_start)
    and (match_end is null or memory_chunks.source_created_at < match_end)
    and (1 - (memory_chunks.embedding <=> query_embedding)) >= min_similarity
  order by memory_chunks.embedding <=> query_embedding
  limit match_count;
$$;
