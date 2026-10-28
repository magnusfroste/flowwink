-- ─────────────────────────────────────────────────────────────────────────────
-- Valutan föds rätt — one currency rule for every commercial row
-- ─────────────────────────────────────────────────────────────────────────────
-- Maja Sol's subscription on Nordbrygg was born in 'usd' on a SEK business
-- (2026-08-30) and raised two USD draft invoices before anyone looked:
-- subscriptions.currency still defaulted to 'usd' after the 2026-08-20
-- platform-currency migration fixed the RPC beside it, and nothing upper-cased
-- what a caller wrote. One rule now, in the database, for every table that
-- carries a currency: empty means the business's currency, and whatever is
-- written is stored upper-case (ISO 4217 — Stripe talks lower-case, the ledger
-- does not). Existing lower-case values are lifted.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions ALTER COLUMN currency SET DEFAULT public.business_currency();

CREATE OR REPLACE FUNCTION public.normalize_currency()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  NEW.currency := upper(trim(COALESCE(NEW.currency, '')));
  IF NEW.currency = '' THEN NEW.currency := public.business_currency(); END IF;
  RETURN NEW;
END $fn$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'quotes', 'subscriptions', 'deals', 'contracts', 'orders', 'service_orders'] LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_normalize_currency', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF currency ON public.%I FOR EACH ROW EXECUTE FUNCTION public.normalize_currency()', t || '_normalize_currency', t);
      EXECUTE format('UPDATE public.%I SET currency = upper(trim(currency)) WHERE currency IS NOT NULL AND currency <> upper(trim(currency))', t);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END LOOP;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A subscription born without a currency carries the business's; an invoice
-- written in 'usd' is stored as 'USD'. Rolled back.
DO $$
DECLARE v_cur text := public.business_currency(); v_s uuid; v_i uuid; v_got text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.subscriptions (customer_email, customer_name, status, unit_amount_cents, billing_interval, provider)
      VALUES ('proof@example.test', 'proof', 'active', 1000, 'month', 'manual') RETURNING id INTO v_s;
    SELECT currency INTO v_got FROM public.subscriptions WHERE id = v_s;
    IF v_got IS DISTINCT FROM v_cur THEN RAISE EXCEPTION 'proof: subscription currency should be % got %', v_cur, v_got; END IF;
    INSERT INTO public.invoices (invoice_number, customer_name, line_items, subtotal_cents, tax_cents, total_cents, currency, status)
      VALUES ('PROOF-CUR-1', 'proof', '[]'::jsonb, 0, 0, 0, 'usd', 'draft') RETURNING id INTO v_i;
    SELECT currency INTO v_got FROM public.invoices WHERE id = v_i;
    IF v_got <> 'USD' THEN RAISE EXCEPTION 'proof: invoice currency should be USD got %', v_got; END IF;
    RAISE NOTICE 'currency proof ok';
    RAISE EXCEPTION '__currency_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__currency_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
