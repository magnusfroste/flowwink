-- ============================================================================
-- manage_account_roles — the migration layer for a company arriving with its
-- own chart of accounts.
--
-- The reframe that makes this small. A real Bokio export (LiteIT 2023) carries
-- 1 243 accounts, and mapping 1 243 accounts to ours would be a week of work
-- nobody would finish. But FlowWink does not post to account numbers — it posts
-- to ROLES, and there are 23 of them. And of those 1 243 accounts, exactly 29
-- had any balance or movement at all. The rest is Bokio shipping the whole BAS
-- chart whether you use it or not.
--
-- So the question is not "map 1 243 accounts". It is "which of YOUR accounts is
-- your bank, your receivables, your output VAT" — about twenty answers, most of
-- them obvious from the codes, and all of them evidenced by what the company
-- actually posted to.
--
-- WHOSE CHOICE WINS. The customer's. LiteIT books revenue to 3011, our se-bas2024
-- pack maps sales_revenue → 3001, and 3011 is not even in BAS 2024 (Bokio ships
-- accounts beyond the standard, exactly as our own hand-written chart did). If
-- we quietly kept 3001, every invoice FlowWink books would land on a different
-- account than five years of their history, and a parallel Fortnox comparison
-- would diverge on line one. Their history is the authority for their own books.
--
-- propose reads and writes nothing. set writes one role at a time and refuses an
-- account the chart does not have — a role pointing at a non-existent account is
-- a posting failure at the worst possible moment, mid-invoice.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manage_account_roles(
  p_action text DEFAULT 'list',
  p_locale text DEFAULT NULL,
  p_accounts jsonb DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_account_code text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_locale text;
  v_row record;
  v_proposals jsonb := '[]'::jsonb;
  v_unknown jsonb := '[]'::jsonb;
  v_acc jsonb;
  v_code text;
  v_current text;
  v_current_name text;
  v_used jsonb;
  v_candidate text;
  v_candidate_name text;
  v_confidence text;
  v_evidence text;
  v_prefix text;
  v_n int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage account roles';
  END IF;

  v_locale := COALESCE(NULLIF(btrim(p_locale), ''),
    (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
    'se-bas2024');

  -- ── list: what the engine resolves today ────────────────────────────────
  IF p_action = 'list' THEN
    RETURN jsonb_build_object(
      'locale', v_locale,
      'roles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'role', r.role, 'account_code', r.account_code,
                 'account_name', c.account_name,
                 'exists_in_chart', c.account_code IS NOT NULL,
                 'description', r.description) ORDER BY r.role)
        FROM public.account_roles r
        LEFT JOIN public.chart_of_accounts c
          ON c.locale = r.locale AND c.account_code = r.account_code
        WHERE r.locale = v_locale), '[]'::jsonb),
      'note', 'These are the accounts the engine posts to. account_for(role) resolves them; nothing in the engine names an account number directly.');
  END IF;

  -- ── set: one role, verified against the chart ───────────────────────────
  IF p_action = 'set' THEN
    IF COALESCE(btrim(p_role), '') = '' OR COALESCE(btrim(p_account_code), '') = '' THEN
      RETURN jsonb_build_object('error', 'set requires role and account_code');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.account_roles WHERE role = p_role) THEN
      RETURN jsonb_build_object('error', format(
        'Unknown role "%s". Valid roles: %s', p_role,
        (SELECT string_agg(DISTINCT role, ', ' ORDER BY role) FROM public.account_roles)));
    END IF;
    SELECT account_name INTO v_candidate_name FROM public.chart_of_accounts
     WHERE locale = v_locale AND account_code = btrim(p_account_code);
    IF v_candidate_name IS NULL THEN
      RETURN jsonb_build_object('error', format(
        'Account %s is not in the %s chart. Add it first (manage_chart_of_accounts) — a role pointing at an account that does not exist fails mid-invoice, which is the worst moment to find out.',
        p_account_code, v_locale));
    END IF;

    SELECT account_code INTO v_current FROM public.account_roles
     WHERE locale = v_locale AND role = p_role;

    INSERT INTO public.account_roles (locale, role, account_code, description)
    VALUES (v_locale, p_role, btrim(p_account_code), COALESCE(NULLIF(btrim(p_reason), ''), v_candidate_name))
    ON CONFLICT (locale, role) DO UPDATE
      SET account_code = EXCLUDED.account_code,
          description = EXCLUDED.description,
          updated_at = now();

    RETURN jsonb_build_object(
      'set', true, 'locale', v_locale, 'role', p_role,
      'from', v_current, 'to', btrim(p_account_code), 'account_name', v_candidate_name,
      'note', CASE WHEN v_current IS DISTINCT FROM btrim(p_account_code)
        THEN format('Every future posting for %s now lands on %s instead of %s. Entries already booked are unchanged — they reference the account code they were written with.', p_role, btrim(p_account_code), COALESCE(v_current, '(unset)'))
        ELSE 'Unchanged — the role already pointed here.' END);
  END IF;

  -- ── propose: match the company's own accounts against the roles ─────────
  IF p_action <> 'propose' THEN
    RETURN jsonb_build_object('error', format('Unknown action "%s". Use list|propose|set', p_action));
  END IF;

  IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' OR jsonb_array_length(p_accounts) = 0 THEN
    RETURN jsonb_build_object('error',
      'propose requires accounts: the company''s own accounts as [{code, name, in_use?, has_movement?}]. Send the ones IN USE, not the whole exported chart — a Bokio export carries ~1200 accounts of which a real company touches about 30, and the unused ones are noise that hides the decisions.');
  END IF;

  -- Their accounts, indexed. in_use/has_movement are the evidence that
  -- separates "an account that exists" from "an account they actually post to".
  CREATE TEMP TABLE IF NOT EXISTS _their (
    code text PRIMARY KEY, name text, in_use boolean, has_movement boolean
  ) ON COMMIT DROP;
  DELETE FROM _their;
  FOR v_acc IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
    v_code := btrim(COALESCE(v_acc ->> 'code', ''));
    CONTINUE WHEN v_code = '';
    INSERT INTO _their (code, name, in_use, has_movement)
    VALUES (v_code, btrim(COALESCE(v_acc ->> 'name', '')),
            COALESCE((v_acc ->> 'in_use')::boolean, true),
            COALESCE((v_acc ->> 'has_movement')::boolean, false))
    ON CONFLICT (code) DO NOTHING;
  END LOOP;

  FOR v_row IN
    SELECT r.role, r.account_code AS ours,
           (SELECT account_name FROM public.chart_of_accounts c
             WHERE c.locale = v_locale AND c.account_code = r.account_code) AS ours_name
      FROM public.account_roles r WHERE r.locale = v_locale ORDER BY r.role
  LOOP
    v_prefix := left(v_row.ours, 2);
    v_candidate := NULL; v_confidence := NULL; v_evidence := NULL;

    -- 1. They use the very account our role points at. Nothing to decide.
    SELECT code, name INTO v_candidate, v_candidate_name FROM _their
     WHERE code = v_row.ours AND in_use;

    IF v_candidate IS NOT NULL THEN
      v_confidence := 'exact';
      v_evidence := format('The company posts to %s, which is already what %s resolves to.', v_row.ours, v_row.role);
    ELSE
      -- 2. No exact match: LIST what they use in the same group and pick
      --    NOTHING. The first version of this auto-picked the nearest account
      --    in the 2-digit group and produced confident nonsense — vat_input
      --    2641 "proposed" 2611, which is OUTPUT VAT, wrapped in a persuasive
      --    sentence about their history deciding. A prefix is not a meaning:
      --    264x is input VAT and 261x is output VAT, and no prefix width is
      --    right for every role (30xx must span 3001→3011, 26xx must not).
      --    So the disagreement is handed over, exactly like the title
      --    candidates in the site sensor. One candidate is usually the answer;
      --    it is still not ours to assume.
      SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name, 'has_movement', has_movement)
                       ORDER BY has_movement DESC, code)
        INTO v_used
        FROM _their WHERE in_use AND left(code, 2) = v_prefix;

      IF v_used IS NOT NULL THEN
        v_confidence := 'candidates';
        v_evidence := format('The company does NOT post to %s ("%s"). It posts to %s account(s) in the %sxx group — listed under candidates. Their own history decides what their books mean, so if one of these is their %s, set it: keeping ours would put every future entry on a different account than years of theirs. If none of them is, that is an answer too.',
          v_row.ours, COALESCE(v_row.ours_name, '?'), jsonb_array_length(v_used), v_prefix, v_row.role);
      ELSE
        v_confidence := 'no_evidence';
        v_evidence := format('Nothing in the accounts you sent falls in the %sxx group, so there is no evidence either way. %s stays as it is — decide with the customer, do not guess.',
          v_prefix, v_row.role);
      END IF;
    END IF;

    v_proposals := v_proposals || jsonb_strip_nulls(jsonb_build_object(
      'role', v_row.role,
      'current', v_row.ours,
      'current_name', v_row.ours_name,
      'confirmed', v_confidence = 'exact',
      'candidates', CASE WHEN v_confidence = 'candidates' THEN v_used END,
      'confidence', v_confidence,
      'evidence', v_evidence));

  END LOOP;

  -- Accounts they post to that our chart has never heard of. Not all of these
  -- matter — but any of them could be the one carrying their revenue.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name,
                                               'has_movement', t.has_movement) ORDER BY t.code), '[]'::jsonb)
    INTO v_unknown
    FROM _their t
   WHERE t.in_use
     AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c
                      WHERE c.locale = v_locale AND c.account_code = t.code);

  SELECT count(*) INTO v_n FROM _their WHERE in_use;

  RETURN jsonb_build_object(
    'locale', v_locale,
    'accounts_considered', v_n,
    'proposals', v_proposals,
    'accounts_missing_from_chart', v_unknown,
    'note', 'Nothing was written. Read the "candidates" rows: those are the roles where the company posts somewhere other than our default, and they are right about their own books — pick one and apply it with action=set, one role at a time. This function never picks for you: a prefix is not a meaning, and an auto-picked account that sounds right is how input VAT ends up on an output VAT account. accounts_missing_from_chart is the migration you will actually feel — these are accounts the company posts to that this instance has never heard of, and moving between systems (Bokio → Dooer, Bokio → FlowWink) is mostly this list. Add the ones that matter with manage_chart_of_accounts before pointing a role at them.');
END; $function$;

GRANT EXECUTE ON FUNCTION public.manage_account_roles(text, text, jsonb, text, text, text) TO authenticated, service_role;
