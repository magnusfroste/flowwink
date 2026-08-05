-- Bulk data belongs in one call, not fifty.
--
-- manage_flowtable_record moves ONE record per call, addressed by id. An agent
-- loading a product catalogue makes a round trip per row, and — worse — a
-- re-run duplicates everything, because upsert-by-id is useless to an agent
-- that never knew the ids. Same failure family as the base skill's duplicate-
-- key error: the platform punished retries, and retrying is how agents work.
--
-- Two functions:
--   bulk_upsert_flowtable_records — the engine. Upserts by a NATURAL key
--     (sku, name, …) with per-row results, so re-runs are idempotent and the
--     agent can report "48 in, 2 rejected: row 12 lacks a name" instead of
--     guessing.
--   import_csv_to_flowtable — a thin shell over the engine, because supplier
--     price lists arrive as CSV. Handles quoted fields and auto-detects the
--     delimiter (Swedish Excel exports use semicolons).

-- ─── Resolve a table by id, or by name/slug (optionally scoped to a base) ────
CREATE OR REPLACE FUNCTION public._resolve_flowtable_table(p_table text, p_base text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- The uuid casts are CASE-guarded: SQL does not guarantee short-circuit,
  -- so `p ~ uuid-regex AND id = p::uuid` can still evaluate the cast for
  -- "Bulktest" and abort the whole query. Bitten in production within minutes.
  SELECT t.id FROM public.flowtable_tables t
  LEFT JOIN public.flowtable_bases b ON b.id = t.base_id
  WHERE t.id = CASE WHEN p_table ~* '^[0-9a-f-]{36}$' THEN p_table::uuid END
     OR ((lower(t.name) = lower(trim(p_table)) OR t.slug = lower(trim(p_table)))
       AND (p_base IS NULL
            OR b.id = CASE WHEN p_base ~* '^[0-9a-f-]{36}$' THEN p_base::uuid END
            OR b.slug = lower(trim(p_base))
            OR lower(b.name) = lower(trim(p_base))))
  ORDER BY t.created_at LIMIT 1;
$$;

-- ─── The engine ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_upsert_flowtable_records(
  p_table text,
  p_records jsonb,
  p_key_field text DEFAULT NULL,
  p_base text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
  v_known_keys text[];
  v_rec jsonb;
  v_idx int := 0;
  v_existing_id uuid;
  v_new_id uuid;
  v_created int := 0; v_updated int := 0; v_failed int := 0;
  v_results jsonb := '[]'::jsonb;
  v_unknown text[];
  v_key_value text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can bulk-write Flowtable records';
  END IF;

  v_table_id := public._resolve_flowtable_table(p_table, p_base);
  IF v_table_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Table not found: '||COALESCE(p_table,'(null)')||'. Pass the table name, slug or id (and base if the name is ambiguous).');
  END IF;

  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RETURN jsonb_build_object('error', 'p_records must be a JSON array of objects (field key → value).');
  END IF;
  IF jsonb_array_length(p_records) > 500 THEN
    RETURN jsonb_build_object('error', 'Max 500 records per call — split larger loads into batches.');
  END IF;

  SELECT array_agg(key) INTO v_known_keys FROM public.flowtable_fields WHERE table_id = v_table_id;

  IF p_key_field IS NOT NULL AND NOT (p_key_field = ANY (v_known_keys)) THEN
    RETURN jsonb_build_object('error', 'key_field "'||p_key_field||'" is not a field on this table. Known keys: '||array_to_string(v_known_keys, ', '));
  END IF;

  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records) LOOP
    v_idx := v_idx + 1;
    BEGIN
      IF jsonb_typeof(v_rec) <> 'object' THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('index', v_idx, 'action', 'failed', 'error', 'not an object');
        CONTINUE;
      END IF;

      -- Unknown keys are a warning, not a failure: an agent that includes an
      -- extra column should lose the column, not the row.
      SELECT array_agg(k) INTO v_unknown
      FROM jsonb_object_keys(v_rec) k WHERE NOT (k = ANY (v_known_keys));
      IF v_unknown IS NOT NULL THEN
        v_rec := (SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
                  FROM jsonb_each(v_rec) WHERE key = ANY (v_known_keys));
      END IF;

      v_existing_id := NULL;
      IF p_key_field IS NOT NULL AND v_rec ? p_key_field THEN
        v_key_value := v_rec->>p_key_field;
        SELECT id INTO v_existing_id FROM public.flowtable_records
        WHERE table_id = v_table_id
          AND lower(COALESCE(values->>p_key_field, '')) = lower(COALESCE(v_key_value, ''))
        ORDER BY created_at LIMIT 1;
      END IF;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.flowtable_records
           SET values = values || v_rec, updated_at = now()
         WHERE id = v_existing_id;
        v_updated := v_updated + 1;
        v_results := v_results || jsonb_build_object('index', v_idx, 'action', 'updated',
          'record_id', v_existing_id,
          'ignored_keys', CASE WHEN v_unknown IS NULL THEN NULL ELSE to_jsonb(v_unknown) END);
      ELSE
        INSERT INTO public.flowtable_records (table_id, values)
        VALUES (v_table_id, v_rec) RETURNING id INTO v_new_id;
        v_created := v_created + 1;
        v_results := v_results || jsonb_build_object('index', v_idx, 'action', 'created',
          'record_id', v_new_id,
          'ignored_keys', CASE WHEN v_unknown IS NULL THEN NULL ELSE to_jsonb(v_unknown) END);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object('index', v_idx, 'action', 'failed', 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'table_id', v_table_id,
    'created', v_created, 'updated', v_updated, 'failed', v_failed,
    'results', v_results);
END;
$$;

-- ─── The CSV shell ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.import_csv_to_flowtable(
  p_table text,
  p_csv text,
  p_key_field text DEFAULT NULL,
  p_base text DEFAULT NULL,
  p_delimiter text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
  v_delim text;
  v_lines text[];
  v_split_re text;
  v_headers text[];
  v_mapped_keys text[];
  v_fields jsonb;
  v_line text;
  v_cells text[];
  v_obj jsonb;
  v_records jsonb := '[]'::jsonb;
  v_unmapped text[] := '{}';
  i int; j int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can import CSV into Flowtable';
  END IF;

  v_table_id := public._resolve_flowtable_table(p_table, p_base);
  IF v_table_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Table not found: '||COALESCE(p_table,'(null)'));
  END IF;

  v_lines := regexp_split_to_array(replace(COALESCE(p_csv, ''), E'\r\n', E'\n'), E'\n');
  v_lines := (SELECT array_agg(l) FROM unnest(v_lines) l WHERE trim(l) <> '');
  IF v_lines IS NULL OR array_length(v_lines, 1) < 2 THEN
    RETURN jsonb_build_object('error', 'CSV needs a header row and at least one data row.');
  END IF;
  IF array_length(v_lines, 1) > 501 THEN
    RETURN jsonb_build_object('error', 'Max 500 data rows per import — split the file.');
  END IF;

  -- Delimiter: honour the argument, otherwise count , vs ; in the header —
  -- Swedish Excel exports semicolons and agents rarely know that.
  v_delim := COALESCE(NULLIF(p_delimiter, ''),
    CASE WHEN length(v_lines[1]) - length(replace(v_lines[1], ';', ''))
            > length(v_lines[1]) - length(replace(v_lines[1], ',', ''))
         THEN ';' ELSE ',' END);
  -- Split on the delimiter only outside double quotes.
  v_split_re := v_delim || '(?=(?:[^"]*"[^"]*")*[^"]*$)';

  SELECT jsonb_object_agg(lower(name), key) || jsonb_object_agg(lower(key), key)
    INTO v_fields FROM public.flowtable_fields WHERE table_id = v_table_id;

  v_headers := regexp_split_to_array(v_lines[1], v_split_re);
  FOR i IN 1..array_length(v_headers, 1) LOOP
    v_headers[i] := trim(both '"' FROM trim(v_headers[i]));
    v_mapped_keys[i] := v_fields->>lower(v_headers[i]);
    IF v_mapped_keys[i] IS NULL THEN
      v_unmapped := v_unmapped || v_headers[i];
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM unnest(v_mapped_keys) k WHERE k IS NOT NULL) = 0 THEN
    RETURN jsonb_build_object('error',
      'No CSV header matches a field on the table. Headers: '||array_to_string(v_headers, ', ')||
      '. Create the fields first (manage_flowtable_field) or fix the header row.');
  END IF;

  FOR i IN 2..array_length(v_lines, 1) LOOP
    v_cells := regexp_split_to_array(v_lines[i], v_split_re);
    v_obj := '{}'::jsonb;
    FOR j IN 1..LEAST(array_length(v_cells, 1), array_length(v_mapped_keys, 1)) LOOP
      IF v_mapped_keys[j] IS NOT NULL THEN
        v_obj := v_obj || jsonb_build_object(
          v_mapped_keys[j],
          replace(trim(both '"' FROM trim(v_cells[j])), '""', '"'));
      END IF;
    END LOOP;
    v_records := v_records || v_obj;
  END LOOP;

  RETURN public.bulk_upsert_flowtable_records(v_table_id::text, v_records, p_key_field, NULL)
    || jsonb_build_object('delimiter_used', v_delim,
         'unmapped_headers', CASE WHEN array_length(v_unmapped,1) IS NULL THEN NULL ELSE to_jsonb(v_unmapped) END);
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_flowtable_table(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_upsert_flowtable_records(text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_csv_to_flowtable(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_flowtable_records(text, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_csv_to_flowtable(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._resolve_flowtable_table(text, text) TO service_role;


-- Same latent cast bug in manage_flowtable_base's update branch — repaired
-- here with the guarded form.
CREATE OR REPLACE FUNCTION public._resolve_flowtable_base(p_base text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.flowtable_bases
  WHERE id = CASE WHEN p_base ~* '^[0-9a-f-]{36}$' THEN p_base::uuid END
     OR slug = lower(trim(p_base))
     OR lower(name) = lower(trim(p_base))
  ORDER BY created_at LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public._resolve_flowtable_base(text) TO service_role;
