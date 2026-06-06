
-- Re-apply consultant semantic search schema (idempotent)
create extension if not exists vector;

alter table public.consultant_profiles
  add column if not exists embedding extensions.vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_status text not null default 'stale',
  add column if not exists embedded_at timestamptz,
  add column if not exists search_tsv tsvector;

create index if not exists consultant_profiles_embedding_idx
  on public.consultant_profiles using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists consultant_profiles_search_tsv_idx
  on public.consultant_profiles using gin (search_tsv);

create index if not exists consultant_profiles_embedding_status_idx
  on public.consultant_profiles (embedding_status)
  where embedding_status = 'stale';

create or replace function public.consultant_profile_search_maintenance()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.search_tsv :=
      setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
      setweight(to_tsvector('simple', array_to_string(coalesce(new.skills, '{}'), ' ')), 'A') ||
      setweight(to_tsvector('simple', array_to_string(coalesce(new.certifications, '{}'), ' ')), 'B') ||
      setweight(to_tsvector('simple', array_to_string(coalesce(new.languages, '{}'), ' ')), 'B') ||
      setweight(to_tsvector('simple', coalesce(new.summary, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(new.bio, '')), 'C');

  if tg_op = 'INSERT' then
    new.embedding_status := 'stale';
    return new;
  end if;

  if new.name is distinct from old.name
     or new.title is distinct from old.title
     or new.bio is distinct from old.bio
     or new.summary is distinct from old.summary
     or new.skills is distinct from old.skills
     or new.certifications is distinct from old.certifications
     or new.languages is distinct from old.languages
     or new.experience_json is distinct from old.experience_json
  then
    new.embedding_status := 'stale';
    new.embedding := null;
    new.embedded_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_consultant_profile_search on public.consultant_profiles;
create trigger trg_consultant_profile_search
before insert or update on public.consultant_profiles
for each row execute function public.consultant_profile_search_maintenance();

-- Touch every row to populate search_tsv + mark stale so the cron picks them up
update public.consultant_profiles set name = name;

create or replace function public.match_consultants(
  query_embedding extensions.vector(1536),
  query_text text default null,
  match_count int default 10,
  semantic_weight float default 0.6,
  only_active boolean default true
)
returns table (
  id uuid,
  name text,
  title text,
  skills text[],
  experience_years int,
  availability text,
  summary text,
  semantic_score float,
  text_score float,
  hybrid_score float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with base as (
    select
      c.id, c.name, c.title, c.skills, c.experience_years, c.availability, c.summary,
      case when query_embedding is not null and c.embedding is not null
           then 1 - (c.embedding operator(extensions.<=>) query_embedding)
           else 0 end as semantic_score,
      case when query_text is not null and length(trim(query_text)) > 0
           then ts_rank_cd(c.search_tsv, plainto_tsquery('simple', query_text))
           else 0 end as text_score
    from public.consultant_profiles c
    where (not only_active or c.is_active = true)
  )
  select
    id, name, title, skills, experience_years, availability, summary,
    semantic_score,
    text_score,
    (semantic_weight * semantic_score) + ((1 - semantic_weight) * least(text_score, 1.0)) as hybrid_score
  from base
  where (query_embedding is not null and semantic_score > 0)
     or (query_text is not null and text_score > 0)
  order by hybrid_score desc
  limit match_count;
$$;

grant execute on function public.match_consultants(extensions.vector, text, int, float, boolean)
  to anon, authenticated, service_role;
