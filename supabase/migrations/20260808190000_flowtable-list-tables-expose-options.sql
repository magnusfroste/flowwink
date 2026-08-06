-- An agent could set a select column's choices but never read them back.
--
-- Found while checking a report that OpenClaw could not set dropdown options
-- over MCP. It can — 6 of 12 select fields on the Optic Tunnels base were
-- correctly configured, and a live call through the gateway set the rest. What
-- it cannot do is VERIFY: `list_flowtable_tables` is the only schema-discovery
-- surface, and it returned `{key, name, type}` with no `options`. So a select
-- field with choices and one without look identical from the outside, and an
-- operator has no way to tell a successful write from a silently dropped one.
--
-- That matters more than it sounds, because the write side fails quietly: a
-- `choices` value that is not an array is dropped and the call still answers
-- `status: success, updated: true`. Read-back was the only way to catch it, and
-- read-back did not exist. (The handler-side validation is a separate fix, in
-- agent-execute.)
--
-- `options` is emitted only when non-empty, so the payload for plain text
-- columns is unchanged and nothing already parsing this output breaks.
CREATE OR REPLACE FUNCTION public.list_flowtable_tables(p_base_id uuid DEFAULT NULL, p_base_slug text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_base_id uuid;
BEGIN
  v_base_id := coalesce(p_base_id, (SELECT id FROM flowtable_bases WHERE slug = p_base_slug LIMIT 1));
  IF v_base_id IS NULL THEN RAISE EXCEPTION 'Provide p_base_id or a valid p_base_slug'; END IF;
  RETURN jsonb_build_object('base_id', v_base_id, 'tables', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'table_id', t.id, 'name', t.name, 'slug', t.slug,
      'record_count', (SELECT count(*) FROM flowtable_records r WHERE r.table_id = t.id),
      'fields', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('key', f.key, 'name', f.name, 'type', f.type)
          -- Merged in rather than always present: a text column keeps the exact
          -- shape it had before this migration.
          || CASE WHEN coalesce(f.options, '{}'::jsonb) <> '{}'::jsonb
                  THEN jsonb_build_object('options', f.options)
                  ELSE '{}'::jsonb END
          ORDER BY f.position)
        FROM flowtable_fields f WHERE f.table_id = t.id), '[]'::jsonb)
    ) ORDER BY t.position)
    FROM flowtable_tables t WHERE t.base_id = v_base_id), '[]'::jsonb));
END; $$;
