-- Backfill the consultant hybrid-search RPCs that drifted off managed/forked instances.
--
-- Discovered during the resume→consultants rename QA (2026-07-12): dev was missing BOTH
-- public.match_consultants and its dependency public.build_or_tsquery, so match_consultant
-- returned "Unknown error" (PostgREST function-not-found) even though the columns
-- (consultant_profiles.embedding, .search_tsv) existed. These live in the baseline; a managed
-- instance whose migrate runner skipped the backdated baseline slice never got them. This
-- forward-dated idempotent copy guarantees every instance has them. Definitions are verbatim
-- from 00000000000000_baseline.sql — keep in sync if the baseline changes.

create or replace function public.build_or_tsquery(query_text text) returns tsquery
    language plpgsql stable set search_path to 'public','extensions' as $$
declare tokens text[]; lex text; parts text[] := '{}';
begin
  if query_text is null or length(trim(query_text)) = 0 then return null; end if;
  tokens := regexp_split_to_array(lower(query_text), '[^a-zåäöéèüñ0-9]+');
  foreach lex in array tokens loop
    if length(lex) >= 2 then parts := parts || (quote_literal(lex) || ':*'); end if;
  end loop;
  if array_length(parts, 1) is null then return null; end if;
  return to_tsquery('simple', array_to_string(parts, ' | '));
exception when others then return null;
end; $$;

create or replace function public.match_consultants(
  query_embedding extensions.vector, query_text text default null, match_count integer default 10,
  semantic_weight double precision default 0.6, only_active boolean default true, rrf_k integer default 60)
returns table(id uuid, name text, title text, skills text[], experience_years integer, availability text,
  summary text, semantic_score double precision, text_score double precision, semantic_rank integer,
  text_rank integer, hybrid_score double precision)
    language sql stable security definer set search_path to 'public','extensions' as $$
  with q as (select public.build_or_tsquery(query_text) as tsq),
  candidates as (
    select c.* from public.consultant_profiles c
    where (not only_active or c.is_active = true)
      and (coalesce(length(trim(c.title)),0)>0 or coalesce(array_length(c.skills,1),0)>0
           or coalesce(length(trim(c.summary)),0)>0 or coalesce(length(trim(c.bio)),0)>0)),
  semantic as (
    select c.id, 1 - (c.embedding operator(extensions.<=>) query_embedding) as score,
           row_number() over (order by c.embedding operator(extensions.<=>) query_embedding asc) as rnk
    from candidates c where query_embedding is not null and c.embedding is not null
    order by c.embedding operator(extensions.<=>) query_embedding asc limit greatest(match_count*4,20)),
  textual as (
    select c.id, ts_rank_cd(c.search_tsv, (select tsq from q)) as score,
           row_number() over (order by ts_rank_cd(c.search_tsv, (select tsq from q)) desc) as rnk
    from candidates c where (select tsq from q) is not null and c.search_tsv @@ (select tsq from q)
    order by ts_rank_cd(c.search_tsv, (select tsq from q)) desc limit greatest(match_count*4,20)),
  fused as (
    select c.id, c.name, c.title, c.skills, c.experience_years, c.availability, c.summary,
      coalesce(s.score,0)::float as semantic_score, coalesce(t.score,0)::float as text_score,
      s.rnk::int as semantic_rank, t.rnk::int as text_rank,
      (case when s.rnk is not null then 1.0/(rrf_k+s.rnk) else 0 end
       + case when t.rnk is not null then 1.0/(rrf_k+t.rnk) else 0 end)::float as hybrid_score
    from candidates c left join semantic s on s.id=c.id left join textual t on t.id=c.id
    where s.id is not null or t.id is not null)
  select id,name,title,skills,experience_years,availability,summary,
         semantic_score,text_score,semantic_rank,text_rank,hybrid_score
  from fused order by hybrid_score desc, semantic_score desc limit match_count;
$$;
