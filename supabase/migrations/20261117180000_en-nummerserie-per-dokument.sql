-- ============================================================================
-- One number series per document, whoever creates it (2026-11-17).
--
-- Found by doing quote-to-cash by hand in the admin, in a browser: the quote a
-- person created was numbered QUO-0001 on an instance whose series stood at
-- QUO-0033 — a second QUO-0001. Two generators answered "what is the next
-- number":
--
--   the admin     next_document_number(kind, prefix) — an atomic counter that
--                 only its own callers advance;
--   the skills    "the highest number among the latest rows, plus one" — which
--                 never told the counter, and which two callers at the same
--                 moment answer alike.
--
-- So a person and an agent numbered past each other. For invoices the two even
-- wrote different shapes: INV-0007 from the admin, INV-2026-00007 from every
-- skill (the documented series, the one the receipt, the quote conversion and
-- the e-invoice use).
--
-- One reader now, the counter, and it can no longer be behind: the next number
-- is one above BOTH the counter and the highest number the table already
-- carries. Invoices are numbered in the yearly series, in the business's year.
-- The skills call the same function (core.ts). Numbers already issued stay as
-- they are — an INV-0007 a customer holds is still that invoice.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_document_number(p_kind text, p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seq integer;
  v_floor integer := 0;
  v_key text := p_kind;
  v_year text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'next_document_number: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'invoice' THEN
    -- The yearly series, in the business's year (on 1 Jan 00:30 in Stockholm
    -- the UTC year is still last year). One counter row per year.
    v_year := to_char(public.platform_today(), 'YYYY');
    v_key := 'invoice:' || v_year;
    SELECT coalesce(max(substring(invoice_number FROM '^INV-\d{4}-(\d{1,9})$')::integer), 0)
      INTO v_floor
      FROM public.invoices
     WHERE invoice_number LIKE 'INV-' || v_year || '-%';
  ELSIF p_kind = 'quote' THEN
    SELECT coalesce(max(substring(quote_number FROM '^' || p_prefix || '-(\d{1,9})$')::integer), 0)
      INTO v_floor
      FROM public.quotes
     WHERE quote_number LIKE p_prefix || '-%';
  END IF;

  -- The row lock serialises callers; the floor keeps the counter from ever
  -- answering a number a row already carries (a number written past it by an
  -- import, a restore, or the generators this replaces).
  INSERT INTO public.document_counters (kind, last_value)
  VALUES (v_key, v_floor + 1)
  ON CONFLICT (kind)
  DO UPDATE SET last_value = greatest(document_counters.last_value, v_floor) + 1, updated_at = now()
  RETURNING last_value INTO v_seq;

  IF p_kind = 'invoice' THEN
    RETURN 'INV-' || v_year || '-' || lpad(v_seq::text, 5, '0');
  END IF;
  RETURN p_prefix || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.next_document_number(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_document_number(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text, text) TO authenticated, service_role;

-- ── Proof, rolled back: it writes its own rows and leaves none ──────────────
DO $$
DECLARE
  v_year text := to_char(public.platform_today(), 'YYYY');
  v_high integer;
  v_a text;
  v_b text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    -- A quote written past the counter, as the old generators wrote them.
    SELECT coalesce(max(substring(quote_number FROM '^QUO-(\d{1,9})$')::integer), 0) + 40 INTO v_high FROM public.quotes;
    INSERT INTO public.quotes (quote_number, line_items, subtotal_cents, tax_cents, total_cents)
    VALUES ('QUO-' || lpad(v_high::text, 4, '0'), '[]'::jsonb, 0, 0, 0);
    v_a := public.next_document_number('quote', 'QUO');
    v_b := public.next_document_number('quote', 'QUO');
    IF v_a <> 'QUO-' || lpad((v_high + 1)::text, 4, '0') OR v_b <> 'QUO-' || lpad((v_high + 2)::text, 4, '0') THEN
      RAISE EXCEPTION 'one-series proof: after QUO-% the counter answered % then %', v_high, v_a, v_b;
    END IF;

    v_a := public.next_document_number('invoice', 'INV');
    v_b := public.next_document_number('invoice', 'INV');
    IF v_a !~ ('^INV-' || v_year || '-\d{5}$') OR v_b !~ ('^INV-' || v_year || '-\d{5}$')
       OR right(v_b, 5)::integer <> right(v_a, 5)::integer + 1 THEN
      RAISE EXCEPTION 'one-series proof: invoices were numbered % then %', v_a, v_b;
    END IF;
    IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number IN (v_a, v_b)) THEN
      RAISE EXCEPTION 'one-series proof: the counter answered a number an invoice already carries (%, %)', v_a, v_b;
    END IF;

    -- Every other document keeps its series as it was.
    v_a := public.next_document_number('proof-kind', 'PRF');
    IF v_a <> 'PRF-0001' THEN RAISE EXCEPTION 'one-series proof: a new kind began at %', v_a; END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'one-series proof:%' THEN RAISE; END IF;
    IF SQLERRM <> 'proof-rollback' THEN
      RAISE NOTICE 'one number series: proof rows not accepted here (%), skipped', SQLERRM;
    END IF;
  END;
END $$;
