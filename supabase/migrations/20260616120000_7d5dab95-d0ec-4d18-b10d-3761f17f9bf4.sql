-- CRM lead de-duplication: find_duplicate_leads (read-only) + merge_leads (reassign children, then delete dupe).
-- Mirrors find_duplicate_companies (migration 20260612100000). The email comparison normalizes
-- plus-addressing and case (anna+x@d ≡ anna+y@d ≡ anna@d) so gmail-style aliases collapse — the exact
-- case a naive exact-string dedup missed in the demo CRM (two "Anna Wikström" rows that differed only
-- by a +tag). merge_leads moves every child row off the duplicate before deleting it, so no history is
-- lost (a plain delete would CASCADE-wipe tasks/deals/activities and orphan invoices/quotes/tickets).
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalize an email for duplicate comparison: trim, lowercase, strip "+tag" before the @.
CREATE OR REPLACE FUNCTION "public"."normalize_email"("p_email" "text")
RETURNS "text" LANGUAGE "sql" IMMUTABLE AS $$
  SELECT CASE
           WHEN p_email IS NULL OR btrim(p_email) = '' THEN NULL
           ELSE lower(regexp_replace(btrim(p_email), '\+[^@]*@', '@'))
         END;
$$;
ALTER FUNCTION "public"."normalize_email"("text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."normalize_email"("text") TO "anon", "authenticated", "service_role";

-- ── find_duplicate_leads ──────────────────────────────────────────────────────
-- Read-only. Candidate pairs scored by GREATEST(name trigram similarity, normalized-email match).
-- A matching normalized email scores 1.0; otherwise the trigram name score (gated by p_threshold).
CREATE OR REPLACE FUNCTION "public"."find_duplicate_leads"(
  "p_threshold" numeric DEFAULT 0.45,
  "p_limit" integer DEFAULT 25
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY (x.score) DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT a.id AS lead_a, a.name AS name_a, a.email AS email_a, a.status::text AS status_a,
           b.id AS lead_b, b.name AS name_b, b.email AS email_b, b.status::text AS status_b,
           round(GREATEST(
             similarity(lower(coalesce(a.name, '')), lower(coalesce(b.name, ''))),
             CASE WHEN normalize_email(a.email) IS NOT NULL
                   AND normalize_email(a.email) = normalize_email(b.email) THEN 1.0 ELSE 0 END
           )::numeric, 2) AS score,
           (normalize_email(a.email) IS NOT NULL
             AND normalize_email(a.email) = normalize_email(b.email)) AS same_email
    FROM leads a
    JOIN leads b ON a.id < b.id
    WHERE (a.name IS NOT NULL AND b.name IS NOT NULL
            AND similarity(lower(a.name), lower(b.name)) >= p_threshold)
       OR (normalize_email(a.email) IS NOT NULL
            AND normalize_email(a.email) = normalize_email(b.email))
    ORDER BY 9 DESC
    LIMIT GREATEST(COALESCE(p_limit, 25), 1)
  ) x;
  RETURN jsonb_build_object('success', true, 'pairs', v_rows);
END $$;
ALTER FUNCTION "public"."find_duplicate_leads"(numeric, integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."find_duplicate_leads"(numeric, integer) TO "anon", "authenticated", "service_role";

-- ── merge_leads ───────────────────────────────────────────────────────────────
-- Reassign every child row from the duplicate onto the primary, fill empty primary fields from the
-- duplicate, sum their scores, then delete the duplicate. The child-table list is applied defensively:
-- each table/column is only touched if it exists on this instance (modules are gated per deployment).
CREATE OR REPLACE FUNCTION "public"."merge_leads"(
  "p_primary_id" "uuid",
  "p_duplicate_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_primary leads%ROWTYPE;
  v_dupe    leads%ROWTYPE;
  v_moved   jsonb := '{}'::jsonb;
  v_tbl     text;
  v_cnt     integer;
  v_child_tables text[] := ARRAY[
    'crm_tasks', 'deals', 'lead_activities', 'pricelists',
    'invoices', 'quotes', 'tickets', 'webinar_registrations'
  ];
BEGIN
  IF p_primary_id = p_duplicate_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'primary and duplicate are the same lead');
  END IF;

  SELECT * INTO v_primary FROM leads WHERE id = p_primary_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'primary lead not found');
  END IF;

  SELECT * INTO v_dupe FROM leads WHERE id = p_duplicate_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate lead not found');
  END IF;

  -- Reassign child rows duplicate -> primary (only tables/columns present on this instance).
  FOREACH v_tbl IN ARRAY v_child_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'lead_id') THEN
      EXECUTE format('UPDATE public.%I SET lead_id = $1 WHERE lead_id = $2', v_tbl)
        USING p_primary_id, p_duplicate_id;
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      IF v_cnt > 0 THEN
        v_moved := v_moved || jsonb_build_object(v_tbl, v_cnt);
      END IF;
    END IF;
  END LOOP;

  -- Fill-null on the primary from the duplicate; scores are additive (matches CRM publish() semantics).
  UPDATE leads SET
    name        = COALESCE(v_primary.name, v_dupe.name),
    phone       = COALESCE(v_primary.phone, v_dupe.phone),
    company_id  = COALESCE(v_primary.company_id, v_dupe.company_id),
    assigned_to = COALESCE(v_primary.assigned_to, v_dupe.assigned_to),
    ai_summary  = COALESCE(v_primary.ai_summary, v_dupe.ai_summary),
    score       = COALESCE(v_primary.score, 0) + COALESCE(v_dupe.score, 0),
    updated_at  = now()
  WHERE id = p_primary_id;

  DELETE FROM leads WHERE id = p_duplicate_id;

  INSERT INTO audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('lead.merged', 'lead', p_primary_id, auth.uid(),
    jsonb_build_object('merged_lead_id', p_duplicate_id, 'merged_email', v_dupe.email, 'moved', v_moved));

  RETURN jsonb_build_object('success', true, 'primary_id', p_primary_id,
                            'merged_id', p_duplicate_id, 'moved', v_moved);
END $$;
ALTER FUNCTION "public"."merge_leads"("uuid", "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."merge_leads"("uuid", "uuid") TO "anon", "authenticated", "service_role";
