-- ============================================================================
-- Invoice basis out, the external number back (2026-11-14, #862 part 1.1–1.3).
--
-- A customer sells, quotes, contracts and bills in FlowWink and keeps the
-- books in Fortnox. With ledger = 'external' (20261110120000) FlowWink no
-- longer books by itself — but the invoices still have to REACH the books.
--
-- No new entity: the basis IS the issued invoice. Three facts are added to it,
-- and they are the whole state machine:
--
--   ready      issued, not yet handed over                 (exported_at IS NULL)
--   exported   handed over, the other system has not said (exported_at set)
--   confirmed  the other system's own number is written   (external_ref set)
--
--   list_invoice_basis(from, to, status)     the read — one row per invoice,
--                                            lines included, the buyer's
--                                            org/VAT number as the join key
--   mark_invoice_basis_exported(ids)         ready → exported, idempotent
--   confirm_invoice_export(id|number, ref)   → confirmed. The same reference
--                                            again is a no-op; another one on a
--                                            confirmed invoice, or a reference
--                                            another invoice carries, is
--                                            refused — the same basis is never
--                                            imported twice.
--
-- Nothing here is system-specific: no Fortnox, no OAuth. A bridge outside the
-- platform reads the basis over the gateway and writes the reference back.
-- ============================================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS exported_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS external_ref text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS external_confirmed_at timestamptz;

COMMENT ON COLUMN public.invoices.exported_at IS
  'When this invoice was handed to the external ledger as basis (mark_invoice_basis_exported). NULL = ready.';
COMMENT ON COLUMN public.invoices.external_ref IS
  'The external ledger''s own number for this invoice (confirm_invoice_export). One invoice per reference.';

-- One invoice per external reference: the idempotency the other system relies on.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_external_ref_key
  ON public.invoices (external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_basis_ready_idx
  ON public.invoices (issue_date) WHERE exported_at IS NULL AND external_ref IS NULL;

-- Who may hand the invoices over: the service role (the gateway, a bridge), an
-- admin, or staff whose role is granted Invoicing.
CREATE OR REPLACE FUNCTION public.invoice_basis_caller_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.role() = 'service_role'
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.can_access_module(auth.uid(), 'invoicing');
$$;
REVOKE ALL ON FUNCTION public.invoice_basis_caller_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_basis_caller_ok() TO authenticated, service_role;

-- ── The read ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_invoice_basis(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_status text DEFAULT 'ready',
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text := lower(coalesce(nullif(btrim(p_status), ''), 'ready'));
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_rows jsonb;
  v_counts jsonb;
BEGIN
  IF NOT public.invoice_basis_caller_ok() THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('ready', 'exported', 'confirmed', 'all') THEN
    RAISE EXCEPTION 'p_status must be one of ready | exported | confirmed | all (got %)', p_status USING ERRCODE = '22023';
  END IF;

  WITH basis AS (
    SELECT i.*,
           CASE WHEN i.external_ref IS NOT NULL THEN 'confirmed'
                WHEN i.exported_at IS NOT NULL THEN 'exported'
                ELSE 'ready' END AS export_status
      FROM public.invoices i
     -- The basis is an ISSUED invoice: a draft is not owed, a cancelled one is not either.
     WHERE i.status::text NOT IN ('draft', 'cancelled', 'void')
       AND (p_from IS NULL OR i.issue_date >= p_from)
       AND (p_to IS NULL OR i.issue_date <= p_to)
  ), picked AS (
    SELECT * FROM basis b
     WHERE v_status = 'all' OR b.export_status = v_status
     ORDER BY b.issue_date, b.invoice_number
     LIMIT v_limit
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'invoice_id', p.id,
        'invoice_number', p.invoice_number,
        'invoice_type', p.invoice_type,
        'credited_invoice_id', p.credited_invoice_id,
        'issue_date', p.issue_date,
        'due_date', p.due_date,
        'payment_terms', p.payment_terms,
        'currency', p.currency,
        'customer_name', p.customer_name,
        'customer_email', p.customer_email,
        -- The join key between the two systems.
        'org_number', c.org_number,
        'vat_number', c.vat_number,
        'company_id', p.company_id,
        'company_name', c.name,
        'contract_id', p.contract_id,
        'subscription_id', p.subscription_id,
        'order_id', p.order_id,
        'project_id', p.project_id,
        'lines', COALESCE(p.line_items, '[]'::jsonb),
        'tax_rate', p.tax_rate,
        'subtotal_cents', p.subtotal_cents,
        'tax_cents', p.tax_cents,
        'total_cents', p.total_cents,
        'export_status', p.export_status,
        'exported_at', p.exported_at,
        'external_ref', p.external_ref,
        'external_confirmed_at', p.external_confirmed_at
      ) ORDER BY p.issue_date, p.invoice_number)
      FROM picked p LEFT JOIN public.companies c ON c.id = p.company_id), '[]'::jsonb),
    (SELECT jsonb_build_object(
        'ready', count(*) FILTER (WHERE b.export_status = 'ready'),
        'exported', count(*) FILTER (WHERE b.export_status = 'exported'),
        'confirmed', count(*) FILTER (WHERE b.export_status = 'confirmed'))
       FROM basis b)
    INTO v_rows, v_counts;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to, 'status', v_status,
    'counts', v_counts,
    'count', jsonb_array_length(v_rows),
    'truncated', jsonb_array_length(v_rows) >= v_limit,
    'invoices', v_rows,
    'next', CASE WHEN v_status = 'ready' AND jsonb_array_length(v_rows) > 0
                 THEN 'mark_invoice_basis_exported(p_invoice_ids) once the other system has taken them, then confirm_invoice_export(p_invoice_id, p_external_ref) with its number.'
                 ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.list_invoice_basis(date, date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_invoice_basis(date, date, text, integer) TO authenticated, service_role;

-- ── ready → exported ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_invoice_basis_exported(p_invoice_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_marked uuid[];
  v_already integer;
  v_refused integer;
BEGIN
  IF NOT public.invoice_basis_caller_ok() THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_invoice_ids IS NULL OR cardinality(p_invoice_ids) = 0 THEN
    RAISE EXCEPTION 'p_invoice_ids is required: the invoice_id values list_invoice_basis answered' USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.invoices i
       SET exported_at = now()
     WHERE i.id = ANY (p_invoice_ids)
       AND i.exported_at IS NULL
       AND i.status::text NOT IN ('draft', 'cancelled', 'void')
    RETURNING i.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_marked FROM upd;

  SELECT count(*) INTO v_already FROM public.invoices i
   WHERE i.id = ANY (p_invoice_ids) AND NOT (i.id = ANY (v_marked))
     AND i.exported_at IS NOT NULL;
  -- A draft or a cancelled invoice is not basis, and an id that names nothing is not either.
  v_refused := cardinality(p_invoice_ids) - cardinality(v_marked) - v_already;

  RETURN jsonb_build_object(
    'marked', cardinality(v_marked),
    'already_exported', v_already,
    'not_basis', v_refused,
    'invoice_ids', to_jsonb(v_marked)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mark_invoice_basis_exported(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_invoice_basis_exported(uuid[]) TO authenticated, service_role;

-- ── → confirmed: the other system's number, written back ────────────────────
CREATE OR REPLACE FUNCTION public.confirm_invoice_export(
  p_external_ref text,
  p_invoice_id uuid DEFAULT NULL,
  p_invoice_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref text := nullif(btrim(p_external_ref), '');
  v_inv public.invoices%ROWTYPE;
  v_other text;
BEGIN
  IF NOT public.invoice_basis_caller_ok() THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'p_external_ref is required: the external ledger''s own number for this invoice' USING ERRCODE = '22023';
  END IF;
  IF p_invoice_id IS NULL AND nullif(btrim(p_invoice_number), '') IS NULL THEN
    RAISE EXCEPTION 'p_invoice_id or p_invoice_number is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_inv FROM public.invoices i
   WHERE (p_invoice_id IS NOT NULL AND i.id = p_invoice_id)
      OR (p_invoice_id IS NULL AND i.invoice_number = btrim(p_invoice_number))
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'NOT_FOUND', 'retryable', false,
      'hint', 'No such invoice. list_invoice_basis shows the invoice_id and invoice_number of every invoice that is basis.');
  END IF;
  IF v_inv.status::text IN ('draft', 'cancelled', 'void') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'INVALID_INPUT', 'retryable', false,
      'hint', format('Invoice %s is %s — only an issued invoice is basis for the books.', v_inv.invoice_number, v_inv.status));
  END IF;

  -- The same reference again: nothing to do, and say so (a bridge that retries is not an error).
  IF v_inv.external_ref = v_ref THEN
    RETURN jsonb_build_object('confirmed', true, 'idempotent', true, 'invoice_id', v_inv.id,
      'invoice_number', v_inv.invoice_number, 'external_ref', v_inv.external_ref, 'export_status', 'confirmed');
  END IF;
  IF v_inv.external_ref IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'ALREADY_EXISTS', 'retryable', false,
      'hint', format('Invoice %s is already confirmed as %s. An invoice carries one external reference; if that one is wrong a person corrects it in the admin.', v_inv.invoice_number, v_inv.external_ref));
  END IF;
  SELECT i.invoice_number INTO v_other FROM public.invoices i WHERE i.external_ref = v_ref AND i.id <> v_inv.id LIMIT 1;
  IF v_other IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'ALREADY_EXISTS', 'retryable', false,
      'hint', format('External reference %s already belongs to invoice %s — the same basis is never imported twice.', v_ref, v_other));
  END IF;

  UPDATE public.invoices
     SET external_ref = v_ref,
         external_confirmed_at = now(),
         exported_at = COALESCE(exported_at, now())
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('confirmed', true, 'idempotent', false, 'invoice_id', v_inv.id,
    'invoice_number', v_inv.invoice_number, 'external_ref', v_ref, 'export_status', 'confirmed');
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_invoice_export(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_invoice_export(text, uuid, text) TO authenticated, service_role;

-- Proof, rolled back: ready → exported → confirmed, each step once.
DO $proof$
DECLARE
  v_id uuid;
  v_draft uuid;
  v_out jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    -- Staging only. A database this cannot be staged in (a column a later
    -- migration made mandatory) skips the proof — never the migration. What the
    -- three functions answer AFTER this block is the proof, and its errors stand.
    BEGIN
      -- Born issued: whether the ledger books it or not is not this proof's
      -- business (the insert branch of on_invoice_status_book never stops a write).
      INSERT INTO public.invoices (invoice_number, customer_name, customer_email, status, issue_date, line_items, subtotal_cents, tax_cents, total_cents)
        VALUES ('PROOF-BASIS-1', 'Proof Kund', 'proof-basis@example.test', 'sent', DATE '2020-02-10',
                '[{"description":"Proof","quantity":1,"unit_price_cents":10000}]'::jsonb, 10000, 2500, 12500)
        RETURNING id INTO v_id;
      INSERT INTO public.invoices (invoice_number, customer_name, customer_email, status, issue_date, line_items, subtotal_cents, tax_cents, total_cents)
        VALUES ('PROOF-BASIS-2', 'Proof Kund', 'proof-basis@example.test', 'draft', DATE '2020-02-11', '[]'::jsonb, 0, 0, 0)
        RETURNING id INTO v_draft;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'invoice basis: proof skipped here, could not stage an invoice (%)', SQLERRM;
      RAISE EXCEPTION 'proof skipped — rolling back' USING ERRCODE = 'P0PRF';
    END;

    v_out := public.list_invoice_basis(DATE '2020-02-01', DATE '2020-02-29', 'ready');
    IF (v_out ->> 'count')::int <> 1 OR v_out -> 'invoices' -> 0 ->> 'invoice_number' <> 'PROOF-BASIS-1' THEN
      RAISE EXCEPTION 'proof: only the issued invoice is basis, got %', v_out USING ERRCODE = 'P0FAL';
    END IF;

    v_out := public.mark_invoice_basis_exported(ARRAY[v_id, v_draft]);
    IF (v_out ->> 'marked')::int <> 1 OR (v_out ->> 'not_basis')::int <> 1 THEN
      RAISE EXCEPTION 'proof: one marked, the draft refused, got %', v_out USING ERRCODE = 'P0FAL';
    END IF;
    v_out := public.mark_invoice_basis_exported(ARRAY[v_id]);
    IF (v_out ->> 'marked')::int <> 0 OR (v_out ->> 'already_exported')::int <> 1 THEN
      RAISE EXCEPTION 'proof: marking twice marks nothing, got %', v_out USING ERRCODE = 'P0FAL';
    END IF;
    IF (public.list_invoice_basis(DATE '2020-02-01', DATE '2020-02-29', 'ready') ->> 'count')::int <> 0 THEN
      RAISE EXCEPTION 'proof: an exported invoice is no longer ready' USING ERRCODE = 'P0FAL';
    END IF;

    v_out := public.confirm_invoice_export('FNX-PROOF-1', v_id);
    IF NOT coalesce((v_out ->> 'confirmed')::boolean, false) OR (v_out ->> 'idempotent')::boolean THEN
      RAISE EXCEPTION 'proof: first confirmation, got %', v_out USING ERRCODE = 'P0FAL';
    END IF;
    v_out := public.confirm_invoice_export('FNX-PROOF-1', NULL, 'PROOF-BASIS-1');
    IF NOT coalesce((v_out ->> 'idempotent')::boolean, false) THEN
      RAISE EXCEPTION 'proof: the same reference again is a no-op, got %', v_out USING ERRCODE = 'P0FAL';
    END IF;
    v_out := public.confirm_invoice_export('FNX-PROOF-2', v_id);
    IF v_out ->> 'code' <> 'ALREADY_EXISTS' THEN
      RAISE EXCEPTION 'proof: a confirmed invoice keeps its reference, got %', v_out USING ERRCODE = 'P0FAL';
    END IF;
    v_out := public.confirm_invoice_export('FNX-PROOF-1', v_draft);
    IF v_out ->> 'status' <> 'refused' THEN
      RAISE EXCEPTION 'proof: a draft is not confirmed, got %', v_out USING ERRCODE = 'P0FAL';
    END IF;

    RAISE EXCEPTION 'proof passed — rolling back' USING ERRCODE = 'P0PRF';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN NULL;
  END;
END $proof$;
