-- ============================================================================
-- A TOKEN LOOKUP RETURNS A VIEW, NOT THE ROW
-- ============================================================================
--
-- Two defects, one family, both anon-reachable — the same class as the week's
-- fw_edge_credentials finding (a SECURITY DEFINER surface that anon could run).
--
-- ── FINDING 1: dead but loaded guns ─────────────────────────────────────────
-- `get_contract_by_token(text)` was SECURITY DEFINER, granted to anon, and
-- declared `RETURNS SETOF public.contracts` — i.e. EVERY column of the row,
-- including `accept_token` itself, `signer_ip`, `signer_email`, `created_by`
-- and the whole billing_* block. A whole-rowtype return from a SECURITY
-- DEFINER function is a hole straight through the RLS that
-- 20260823040000_a4b5c6d7 had just put on `contracts`: the policy never runs,
-- because the definer is postgres.
--
-- The kicker: it had NO caller. Not in the frontend (PublicContractPage reads
-- `get_public_contract`), not in an edge function, not in a skill seed, not in
-- docs. Only the generated `src/integrations/supabase/types.ts` mentioned it.
-- A loaded, anon-triggerable weapon that nothing in the product ever fired.
--
-- Three of them, in fact — the same sweep found:
--   get_contract_by_token(text)     SETOF contracts            no caller
--   get_quote_by_token(text)        SETOF quotes               no caller
--   sign_contract_by_token(6 args)  contract_signatures        no caller,
--                                                              and it WRITES
-- `sign_contract_by_token` is the worst shape of the three: an anon-executable
-- INSERT into contract_signatures with no input guard, superseded long ago by
-- the `contract-sign` edge function (which is what useSignContract actually
-- calls, and which alone computes the tamper-evidence content_hash over body
-- AND appendices). Signing through the RPC would have produced a signature row
-- with no hash — evidence that proves nothing. All three are DROPPED here.
--
-- `get_invoice_by_token(text)` is the same shape (SETOF invoices, leaking
-- public_token, customer_email, created_by, deal_id, lead_id, project_id,
-- payment_url, reconciliation_id, subscription_id, contract_id, company_id,
-- order_id) but it DOES have a caller: src/pages/PublicInvoicePage.tsx. It is
-- therefore not dropped but narrowed to a fixed column list — the same shape
-- `get_public_contract` and `get_public_quote` already use.
--
-- ── FINDING 2: a guard that rotted ──────────────────────────────────────────
-- `get_public_contract` carried `length(coalesce(trim(p_token),'')) >= 16`
-- (see 20260808154535_0cdc7e1f, line ~157). The appendices migration
-- 20260808400000 re-created the function to add the `appendices` column and
-- silently dropped the guard AND the `LIMIT 1` along with it, leaving a naked
-- `WHERE c.accept_token = p_token`. Nobody noticed: the happy path is
-- identical, and only the empty/short-token case differs.
--
-- That is the whole "villkoret ruttnar" class: a condition re-typed from
-- memory by a migration whose subject was something else entirely. The fix is
-- therefore NOT another copy of `length(...) >= 16` — it is ONE NAMED THING,
-- `public.token_is_plausible(text)`, that a reviewer can grep for and a
-- guardrail test can assert on. Seven functions in the family now call it.
--
-- ── TOKEN LENGTH: measured, not guessed ─────────────────────────────────────
-- The floor must never be able to reject a token the product actually mints.
-- Every generator in the tree was read first:
--   contracts.accept_token
--     src/hooks/useContractWorkflow.ts:12   24 random bytes → base64url = 32
--     supabase/functions/agent-execute/index.ts:11234  24 bytes → hex   = 48
--   quotes.accept_token
--     src/hooks/useQuoteWorkflow.ts:16      24 random bytes → base64url = 32
--     src/lib/modules/quotes-module.ts:396  randomUUID() sans dashes    = 32
--   invoices.public_token
--     baseline DEFAULT encode(gen_random_bytes(24),'hex')              = 48
-- Shortest thing the platform can produce: 32 characters. The historical
-- floor of 16 is kept — it is the documented contract, it is half the
-- shortest real token, and raising it would buy nothing while risking a
-- hand-set legacy token. NULL and whitespace-only are rejected explicitly
-- (`coalesce` + `trim`), which is what an empty `/contract/` URL sends.
--
-- ── SWEEP: what else in the family had one of the two defects ───────────────
-- (a) whole-rowtype, anon-executable:  the three dropped + get_invoice_by_token
-- (b) public token lookup with no input guard:
--       get_public_contract          FIXED here
--       get_contract_certificate     FIXED here
--       get_quote_certificate        FIXED here
--       get_quote_payment_status     FIXED here
--       get_invoice_by_token         FIXED here
--       mark_invoice_viewed_by_token FIXED here  (a WRITE, no guard at all)
--       set_quote_item_selection     FIXED here  (a WRITE, no guard at all)
--       get_public_quote             already correct — it is the model
-- Out of family, REPORTED not touched (different token generators, needs its
-- own pass): confirm_newsletter_subscription, unsubscribe_newsletter,
-- get_survey_by_token, submit_survey_response.
-- Also reported not touched: ~30 anon-executable SECURITY DEFINER admin RPCs
-- returning whole rowtypes (clock_in, close_accounting_period, resolve_approval
-- …). Those carry internal role guards and are a separate, fleet-wide change.
--
-- ── REPRODUCTION RECIPE ─────────────────────────────────────────────────────
-- Prove the leak is gone, as anon, against local Postgres:
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres <<'SQL'
--   BEGIN;
--   -- 1. the dropped functions are gone for everyone
--   SELECT to_regprocedure('public.get_contract_by_token(text)') IS NULL AS gone_contract,
--          to_regprocedure('public.get_quote_by_token(text)')    IS NULL AS gone_quote,
--          to_regprocedure('public.sign_contract_by_token(text,text,text,text,text,text)')
--                                                                IS NULL AS gone_sign;
--   -- expect: t | t | t
--
--   -- 2. no surviving anon-executable token function returns a whole rowtype.
--   --    NB: match the result against pg_class, not against a name regex —
--   --    '^(SETOF )?[a-z_]+$' also matches jsonb / void / boolean and buries
--   --    the answer in false positives. Ask the catalogue what a table is.
--   SELECT coalesce(string_agg(p.proname, ', '), '(none)')
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--      AND has_function_privilege('anon', p.oid, 'EXECUTE')
--      AND pg_get_function_arguments(p.oid) ~ 'token'
--      AND regexp_replace(pg_get_function_result(p.oid), '^SETOF ', '') IN (
--            SELECT c.relname FROM pg_class c
--              JOIN pg_namespace cn ON cn.oid = c.relnamespace
--             WHERE cn.nspname = 'public' AND c.relkind IN ('r','v','m','p'));
--   -- expect: (none)
--
--   -- 3. seed one contract, then read it with anon's eyes. body_markdown must
--   --    clear 200 chars or guard_contracts_require_body() rejects the INSERT.
--   INSERT INTO public.contracts (title, counterparty_name, status, accept_token, body_markdown)
--   VALUES ('Leak probe', 'Acme AB', 'pending_signature', repeat('t', 32),
--           repeat('Avtalstext. ', 30));
--   SET LOCAL ROLE anon;
--   SELECT * FROM public.get_public_contract(repeat('t', 32));
--   -- expect: exactly one row, 13 columns, NO accept_token / signer_ip /
--   --         created_by / billing_* among them
--   SELECT count(*) FROM public.get_public_contract('');       -- expect 0
--   SELECT count(*) FROM public.get_public_contract('   ');    -- expect 0
--   SELECT count(*) FROM public.get_public_contract(NULL);     -- expect 0
--   SELECT count(*) FROM public.get_public_contract('short');  -- expect 0
--   RESET ROLE;
--   ROLLBACK;
--   SQL
--
-- Idempotence, the way this file was verified before commit:
--   psql -v ON_ERROR_STOP=1 ... -c 'BEGIN' -f <this file> -f <this file> -c 'ROLLBACK'
--
-- Forward-dated on purpose: a managed instance's migrate runner applies from
-- its own ledger HEAD and SILENTLY SKIPS anything timestamped below it. A
-- security fix that skips is worse than no fix, because the audit says green.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. The guard, as one named thing
-- ─────────────────────────────────────────────────────────────────────────────
-- Called from inside SECURITY DEFINER bodies only, so it executes with the
-- definer's privileges and needs no grant of its own. It touches no table and
-- is STRICT, so a NULL token short-circuits to NULL → the WHERE clause is not
-- satisfied → no row. REVOKE FROM PUBLIC from the start, per the anon-surface
-- hardening rule.
CREATE OR REPLACE FUNCTION public.token_is_plausible(p_token text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  -- 16 is the historical floor and half the shortest token the platform mints
  -- (see the TOKEN LENGTH note at the top of this migration before changing it).
  SELECT length(btrim(p_token)) >= 16;
$$;

COMMENT ON FUNCTION public.token_is_plausible(text) IS
  'The one input guard every public token lookup shares. Rejects NULL, empty, '
  'whitespace-only and implausibly short tokens before they reach a WHERE '
  'clause. Named rather than inlined so the guard cannot rot away unnoticed '
  'the way get_public_contract''s did between 20260808154535 and 20260808400000.';

-- REVOKE FROM PUBLIC IS NOT ENOUGH ON SUPABASE. Verified on the local stack:
--
--   SELECT defaclnamespace::regnamespace, array_to_string(defaclacl,', ')
--     FROM pg_default_acl WHERE defaclobjtype = 'f';
--   -- public | postgres=X/postgres, anon=X/postgres,
--   --          authenticated=X/postgres, service_role=X/postgres
--
-- ALTER DEFAULT PRIVILEGES hands anon an EXPLICIT execute grant on every new
-- function in schema public at creation time. Revoking PUBLIC removes the
-- world entry and leaves that explicit anon entry standing — the function is
-- born anon-callable anyway, and a reviewer reading `REVOKE ... FROM PUBLIC`
-- believes the opposite. Anything that should NOT be anon-reachable must name
-- anon and authenticated in the revoke, which is what this does. (This is why
-- the sweep found ~30 admin RPCs anon-executable that nobody ever granted.)
REVOKE ALL ON FUNCTION public.token_is_plausible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.token_is_plausible(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.token_is_plausible(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the dead-but-loaded guns
-- ─────────────────────────────────────────────────────────────────────────────
-- Nothing in the tree calls these. Verified across src/, supabase/functions/,
-- src/lib/modules/ (skill seeds), supabase/seed/, docs/ and the test suite —
-- only the GENERATED types.ts named them, which is a description of the DB,
-- not a caller of it.
DROP FUNCTION IF EXISTS public.get_contract_by_token(text);
DROP FUNCTION IF EXISTS public.get_quote_by_token(text);
DROP FUNCTION IF EXISTS public.sign_contract_by_token(text, text, text, text, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_public_contract — the guard restored, the LIMIT restored
-- ─────────────────────────────────────────────────────────────────────────────
-- Column list is unchanged from 20260808400000 (the appendices contract that
-- src/pages/PublicContractPage.tsx and contract-appendices.guardrails.test.ts
-- both depend on). What comes back: the guard, LIMIT 1, and an explicit
-- `accept_token IS NOT NULL` so a draft that never got a token can never be
-- reached by a NULL comparison quirk.
DROP FUNCTION IF EXISTS public.get_public_contract(text);
CREATE FUNCTION public.get_public_contract(p_token text)
RETURNS TABLE(
  id uuid, title text, counterparty_name text, counterparty_email text,
  status public.contract_status, body_markdown text,
  signed_at timestamp with time zone, version integer, currency text,
  value_cents bigint, start_date date, end_date date,
  appendices jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.title, c.counterparty_name, c.counterparty_email, c.status,
         c.body_markdown, c.signed_at, c.version, c.currency, c.value_cents,
         c.start_date, c.end_date,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', d.id, 'label', d.label, 'title', d.title, 'kind', d.kind,
                    'body_markdown', d.body_markdown,
                    'file_name', d.file_name, 'file_url', d.file_url)
                  ORDER BY d.sort_order)
             FROM public.contract_documents d WHERE d.contract_id = c.id
         ), '[]'::jsonb) AS appendices
    FROM public.contracts c
   WHERE public.token_is_plausible(p_token)
     AND c.accept_token IS NOT NULL
     AND c.accept_token = btrim(p_token)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_contract(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_contract(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_invoice_by_token — a fixed column list instead of the whole row
-- ─────────────────────────────────────────────────────────────────────────────
-- Caller: src/pages/PublicInvoicePage.tsx, which reads exactly
--   id, invoice_number, status, customer_name, line_items, subtotal_cents,
--   tax_cents, total_cents, currency, due_date, notes, viewed_at
-- The extras below (issue_date, tax_rate, payment_terms, paid_at,
-- paid_amount_cents, invoice_type) are all things an invoice already shows a
-- customer on paper, kept so a partial-payment or credit-note view does not
-- need another migration.
-- Deliberately NOT returned: public_token (the credential itself),
-- customer_email, created_by, payment_url, exchange_rate, credited_invoice_id,
-- and every internal foreign key (deal_id, lead_id, project_id,
-- reconciliation_id, subscription_id, contract_id, company_id, order_id).
-- Those describe the seller's internal graph; the buyer's token buys the
-- buyer's invoice, not a window into the CRM.
DROP FUNCTION IF EXISTS public.get_invoice_by_token(text);
CREATE FUNCTION public.get_invoice_by_token(p_token text)
-- Column types mirror public.invoices exactly (subtotal/tax/total are integer,
-- paid_amount_cents is bigint, status is the invoice_status enum rendered as
-- text) so the JSON on the wire is byte-identical to what `SELECT *` produced
-- for the columns that survive. This is a pure narrowing, not a reshaping.
RETURNS TABLE(
  id uuid, invoice_number text, status text, invoice_type text,
  customer_name text, line_items jsonb,
  subtotal_cents integer, tax_rate numeric, tax_cents integer,
  total_cents integer, paid_amount_cents bigint, currency text,
  issue_date date, due_date date, payment_terms text,
  paid_at timestamp with time zone, viewed_at timestamp with time zone,
  notes text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT i.id, i.invoice_number, i.status::text, i.invoice_type,
         i.customer_name, i.line_items,
         i.subtotal_cents, i.tax_rate, i.tax_cents,
         i.total_cents, i.paid_amount_cents, i.currency,
         i.issue_date, i.due_date, i.payment_terms,
         i.paid_at, i.viewed_at,
         i.notes
    FROM public.invoices i
   WHERE public.token_is_plausible(p_token)
     AND i.public_token IS NOT NULL
     AND i.public_token = btrim(p_token)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. mark_invoice_viewed_by_token — an unguarded anon WRITE
-- ─────────────────────────────────────────────────────────────────────────────
-- Body is otherwise unchanged from the baseline. It was reachable by anon with
-- any string at all; a caller passing '' would have stamped viewed_at on every
-- invoice whose public_token happened to be '' — which is exactly the row a
-- half-finished import produces.
CREATE OR REPLACE FUNCTION public.mark_invoice_viewed_by_token(p_token text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.invoices
     SET viewed_at = now()
   WHERE public.token_is_plausible(p_token)
     AND public_token IS NOT NULL
     AND public_token = btrim(p_token)
     AND viewed_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_invoice_viewed_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_invoice_viewed_by_token(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. get_contract_certificate — the signing evidence, guarded
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns signer name, e-mail, IP and user agent. Those are the very fields a
-- token is supposed to protect, so this is the last function in the family
-- that should have been running without an input guard. Body otherwise
-- unchanged; only the WHERE clause gains the guard and the trim.
CREATE OR REPLACE FUNCTION public.get_contract_certificate(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'kind', 'contract',
    'reference', c.title,
    'title', c.title,
    'counterparty_name', c.counterparty_name,
    'status', c.status,
    'version', c.version,
    'value_cents', c.value_cents,
    'currency', c.currency,
    'decided_at', COALESCE(c.signed_at, c.terminated_at),
    'signature', (
      SELECT jsonb_build_object(
        'action', s.action,
        'signer_name', s.signer_name,
        'signer_email', s.signer_email,
        'signature_data', s.signature_data,
        'signature_image', s.signature_image,
        'content_hash', s.content_hash,
        'ip_address', s.ip_address,
        'user_agent', s.user_agent,
        'signed_at', s.created_at
      )
      FROM public.contract_signatures s
      WHERE s.contract_id = c.id
        AND s.action IN ('accept', 'reject')
      ORDER BY s.created_at DESC
      LIMIT 1
    )
  )
  FROM public.contracts c
  WHERE public.token_is_plausible(p_token)
    AND c.accept_token IS NOT NULL
    AND c.accept_token = btrim(p_token)
    AND c.status = ANY (ARRAY['active'::contract_status, 'terminated'::contract_status])
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_contract_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contract_certificate(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. get_quote_certificate — same evidence, same guard
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_quote_certificate(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'kind', 'quote',
    'reference', q.quote_number,
    'title', q.title,
    'status', q.status,
    'version', q.version,
    'total_cents', q.total_cents,
    'currency', q.currency,
    'valid_until', q.valid_until,
    'decided_at', COALESCE(q.accepted_at, q.rejected_at),
    'signature', (
      SELECT jsonb_build_object(
        'action', s.action,
        'signer_name', s.signer_name,
        'signer_email', s.signer_email,
        'signature_data', s.signature_data,
        'signature_image', s.signature_image,
        'content_hash', s.content_hash,
        'ip_address', s.ip_address,
        'user_agent', s.user_agent,
        'signed_at', s.created_at
      )
      FROM public.quote_signatures s
      WHERE s.quote_id = q.id
        AND s.action IN ('accept', 'reject')
      ORDER BY s.created_at DESC
      LIMIT 1
    ),
    'payment', (
      SELECT jsonb_build_object(
        'invoice_number', i.invoice_number,
        'invoice_status', i.status,
        'total_cents', i.total_cents,
        'paid_amount_cents', COALESCE(i.paid_amount_cents, 0),
        'prepayment_pct', q.prepayment_pct,
        'quote_paid_at', q.paid_at
      )
      FROM public.invoices i
      WHERE i.id = q.invoice_id
    )
  )
  FROM public.quotes q
  WHERE public.token_is_plausible(p_token)
    AND q.accept_token IS NOT NULL
    AND q.accept_token = btrim(p_token)
    AND q.status::text = ANY (ARRAY['accepted', 'rejected'])
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_quote_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_certificate(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. get_quote_payment_status — guarded
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_quote_payment_status(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'invoice_number', i.invoice_number,
    'invoice_status', i.status,
    'total_cents', i.total_cents,
    'paid_amount_cents', COALESCE(i.paid_amount_cents, 0),
    'remaining_cents', GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0)),
    'pay_now_cents', CASE
      WHEN COALESCE(i.paid_amount_cents, 0) = 0 AND q.prepayment_pct IS NOT NULL
        THEN LEAST(
          GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0)),
          GREATEST(1, ROUND(i.total_cents * q.prepayment_pct / 100.0))::bigint
        )
      ELSE GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0))
    END,
    'currency', i.currency,
    'prepayment_pct', q.prepayment_pct,
    'quote_paid_at', q.paid_at
  )
  FROM public.quotes q
  JOIN public.invoices i ON i.id = q.invoice_id
  WHERE public.token_is_plausible(p_token)
    AND q.accept_token IS NOT NULL
    AND q.accept_token = btrim(p_token)
    AND q.status::text = 'accepted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_quote_payment_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_payment_status(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. set_quote_item_selection — an unguarded anon WRITE
-- ─────────────────────────────────────────────────────────────────────────────
-- The customer toggling an optional line on the public quote page. Body is
-- unchanged apart from the guard and the trim on the token lookup: without
-- them, '' plus a guessed item UUID reached the UPDATE.
CREATE OR REPLACE FUNCTION public.set_quote_item_selection(
  _accept_token text, _item_id uuid, _selected boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _quote_id uuid;
  _is_optional boolean;
  _status text;
  _new_subtotal bigint;
  _new_tax bigint;
  _new_total bigint;
  _tax_rate numeric;
BEGIN
  -- The guard first: a token too short to be one of ours never reaches a row.
  IF NOT COALESCE(public.token_is_plausible(_accept_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Quote or item not found');
  END IF;

  -- locate the quote via token + verify item belongs to it
  SELECT q.id, q.status::text, q.tax_rate, qi.is_optional
    INTO _quote_id, _status, _tax_rate, _is_optional
  FROM quotes q
  JOIN quote_items qi ON qi.quote_id = q.id
  WHERE qi.id = _item_id
    AND q.accept_token IS NOT NULL
    AND q.accept_token = btrim(_accept_token);

  IF _quote_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Quote or item not found');
  END IF;

  IF _status IN ('accepted','rejected','expired') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Quote is finalized');
  END IF;

  IF NOT COALESCE(_is_optional, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Line item is not optional');
  END IF;

  UPDATE quote_items SET selected_by_customer = _selected, updated_at = now()
  WHERE id = _item_id;

  -- recompute quote totals from included lines only
  SELECT COALESCE(SUM(line_subtotal_cents),0), COALESCE(SUM(line_tax_cents),0), COALESCE(SUM(line_total_cents),0)
    INTO _new_subtotal, _new_tax, _new_total
  FROM quote_items
  WHERE quote_id = _quote_id AND (is_optional = false OR selected_by_customer = true);

  UPDATE quotes
     SET subtotal_cents = _new_subtotal,
         tax_cents      = _new_tax,
         total_cents    = _new_total,
         updated_at     = now()
   WHERE id = _quote_id;

  RETURN jsonb_build_object(
    'ok', true,
    'subtotal_cents', _new_subtotal,
    'tax_cents', _new_tax,
    'total_cents', _new_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_quote_item_selection(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_quote_item_selection(text, uuid, boolean) TO anon, authenticated, service_role;
