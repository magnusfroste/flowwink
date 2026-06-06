CREATE OR REPLACE FUNCTION public.match_consultants(
  query_embedding extensions.vector,
  query_text text DEFAULT NULL::text,
  match_count integer DEFAULT 10,
  semantic_weight double precision DEFAULT 0.6,
  only_active boolean DEFAULT true
)
RETURNS TABLE(id uuid, name text, title text, skills text[], experience_years integer, availability text, summary text, semantic_score double precision, text_score double precision, hybrid_score double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  with q as (
    -- Build an OR-tsquery from any 3+ char word. plainto_tsquery ANDs
    -- everything, which makes natural-language briefs return 0. Strip
    -- punctuation, split on whitespace, drop short stopwordish tokens,
    -- escape ':' '&' '|' '!' '(' ')' from each lexeme, and OR them.
    select case
      when query_text is null or length(trim(query_text)) = 0 then null
      else nullif(
        (
          select string_agg(
            regexp_replace(w, '[:&|!()'']', '', 'g'),
            ' | '
          )
          from unnest(
            regexp_split_to_array(
              lower(regexp_replace(query_text, '[^a-z0-9åäö+#.\s-]', ' ', 'gi')),
              '\s+'
            )
          ) as w
          where length(w) >= 3
        ),
        ''
      )
    end as tsq_str
  ),
  base as (
    select
      c.id, c.name, c.title, c.skills, c.experience_years, c.availability, c.summary,
      case when query_embedding is not null and c.embedding is not null
           then 1 - (c.embedding operator(extensions.<=>) query_embedding)
           else 0 end as semantic_score,
      case
        when (select tsq_str from q) is not null
        then coalesce(
          ts_rank_cd(c.search_tsv, to_tsquery('simple', (select tsq_str from q))),
          0
        )
        else 0
      end as text_score
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
     or (text_score > 0)
  order by hybrid_score desc
  limit match_count;
$function$;