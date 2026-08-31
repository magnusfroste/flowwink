-- Översättningsdriften sägs högt.
--
-- En sida per språk lagrar sanningen men döljer glidningen: operatören som
-- förbättrar den svenska tjänstesidan får ingen signal om att det engelska
-- syskonet nu är inaktuellt. Ingen ratchet fångar det — det är ett
-- PROCESSHÅL, inte ett kodfel — så det får två röster: ett chip i adminlistan
-- (frontend) och den här funktionen, så en agent kan hitta driften och föreslå
-- uppdateringar.
--
-- "Efter" betyder: senast rörd mer än p_min_hours före gruppens färskaste
-- version. Tröskeln finns för att batch-operationer (backfills, inriktningar)
-- rör varje rad inom sekunder — flaggas de som drift lär sig alla ignorera
-- signalen.
CREATE OR REPLACE FUNCTION public.list_stale_translations(
  p_min_hours integer DEFAULT 24
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'pages')) THEN
    RAISE EXCEPTION 'Requires the pages module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT coalesce(jsonb_agg(g ORDER BY (g ->> 'days_behind')::numeric DESC), '[]'::jsonb)
    INTO v
  FROM (
    SELECT jsonb_build_object(
      'base_slug', (SELECT p2.slug FROM pages p2
                     WHERE p2.translation_group_id = p.translation_group_id
                       AND p2.deleted_at IS NULL
                     ORDER BY p2.updated_at DESC LIMIT 1),
      'freshest', jsonb_build_object(
        'slug', f.slug, 'locale', f.locale,
        'updated_at', f.updated_at),
      'behind', jsonb_build_object(
        'slug', p.slug, 'locale', p.locale, 'status', p.status,
        'updated_at', p.updated_at),
      'days_behind', round(extract(epoch FROM (f.updated_at - p.updated_at)) / 86400.0, 1)
    ) AS g
    FROM pages p
    JOIN LATERAL (
      SELECT p2.slug, p2.locale, p2.updated_at
        FROM pages p2
       WHERE p2.translation_group_id = p.translation_group_id
         AND p2.deleted_at IS NULL
       ORDER BY p2.updated_at DESC
       LIMIT 1
    ) f ON true
    WHERE p.translation_group_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.updated_at < f.updated_at - make_interval(hours => greatest(1, coalesce(p_min_hours, 24)))
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'min_hours', greatest(1, coalesce(p_min_hours, 24)),
    'stale', v,
    'note', CASE WHEN jsonb_array_length(v) = 0
      THEN 'Every language version is within the threshold of its freshest sibling.'
      ELSE format('%s translation(s) have fallen behind their freshest sibling.', jsonb_array_length(v)) END);
END $$;

REVOKE ALL ON FUNCTION public.list_stale_translations(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_stale_translations(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_stale_translations(integer) IS
  'Språkversioner som halkat efter gruppens färskaste syskon. Tröskeln i '
  'timmar skyddar mot att batch-operationer läses som drift.';

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v_g uuid := gen_random_uuid(); v jsonb; n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO pages (slug, title, status, content_json, locale, translation_group_id, updated_at) VALUES
    ('__drift_sv__', 'Färsk', 'published', '[]'::jsonb, 'sv', v_g, now()),
    ('__drift_en__', 'Efter', 'published', '[]'::jsonb, 'en', v_g, now() - interval '5 days');

  v := public.list_stale_translations(24);
  SELECT count(*) INTO n FROM jsonb_array_elements(v -> 'stale') e
   WHERE e -> 'behind' ->> 'slug' = '__drift_en__';
  IF n <> 1 THEN
    RAISE EXCEPTION 'drift check: a 5-day-stale sibling was not reported';
  END IF;

  -- Tröskeln: samma par inom fönstret rapporteras INTE.
  UPDATE pages SET updated_at = now() - interval '2 hours' WHERE slug = '__drift_en__';
  v := public.list_stale_translations(24);
  SELECT count(*) INTO n FROM jsonb_array_elements(v -> 'stale') e
   WHERE e -> 'behind' ->> 'slug' = '__drift_en__';
  IF n <> 0 THEN
    RAISE EXCEPTION 'drift check: a sibling inside the threshold was flagged — batch noise would drown the signal';
  END IF;

  DELETE FROM pages WHERE translation_group_id = v_g;
  RAISE NOTICE 'translation drift: both directions hold';
END $$;
