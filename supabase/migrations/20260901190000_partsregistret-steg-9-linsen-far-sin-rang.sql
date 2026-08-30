-- Kundryggraden, steg 9: linsen får sin rang.
--
-- Hittat genom att riva nordbrygg till noll och köra båda processerna på nytt:
-- Kafé Blomman AB fakturerades 4 000 kr och syntes ändå INTE i v_customers.
-- customer_rank stod på noll, för ingenting räknade upp den. Bara kortgästen
-- syntes, eftersom köp-triggern sätter hans rank vid skapandet.
--
-- En lins som inte visar en kund man just fakturerat är värdelös. Odoo räknar
-- upp ranken när en försäljning bokförs, och gör det på BÅDA — adressaten och
-- den kommersiella parten:
--
--     (partner | partner.commercial_partner_id)._increase_rank('customer_rank', count)
--
-- Vi behåller ranken som en MARKÖR (greatest(rank, 1)) i stället för en
-- räknare. Två skäl: koden sätter den redan så på två andra ställen, och
-- blandad semantik är sämre än endera. Kolumnen är ett heltal, så den kan bli
-- en riktig räknare den dag talet betyder något för oss.

CREATE OR REPLACE FUNCTION public.partners_bump_rank()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_col text := TG_ARGV[0];   -- 'customer_rank' | 'supplier_rank'
BEGIN
  IF NEW.partner_id IS NULL THEN
    RETURN NULL;
  END IF;
  -- Bara när parten NYSS blev satt: en uppdatering av något annat fält på ett
  -- gammalt dokument ska inte röra registret.
  IF TG_OP = 'UPDATE' AND OLD.partner_id IS NOT DISTINCT FROM NEW.partner_id THEN
    RETURN NULL;
  END IF;

  -- Både adressaten och den juridiska personen, precis som hos Odoo. Utan det
  -- andra ledet blir bolaget osynligt i linsen medan kontaktpersonen syns.
  EXECUTE format(
    'UPDATE public.partners SET %I = greatest(%I, 1)
      WHERE id IN (SELECT id FROM public.partners WHERE id = $1
                   UNION SELECT commercial_partner_id FROM public.partners WHERE id = $1)
        AND %I = 0', v_col, v_col, v_col)
    USING NEW.partner_id;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.partners_bump_rank() IS
  'Markerar parten som kund respektive leverantör när ett kommersiellt dokument '
  'får sin part. Träffar både adressaten och den kommersiella parten (Odoo '
  '_increase_rank). Idempotent: bara rank = 0 rörs.';

DO $$
DECLARE
  spec  text[];
  specs text[][] := ARRAY[
    -- kundsidan: dokument som betyder "vi har sålt till dem"
    ARRAY['invoices',        'customer_rank'],
    ARRAY['orders',          'customer_rank'],
    ARRAY['subscriptions',   'customer_rank'],
    ARRAY['quotes',          'customer_rank'],
    ARRAY['contracts',       'customer_rank'],
    -- leverantörssidan
    ARRAY['purchase_orders', 'supplier_rank'],
    ARRAY['vendor_invoices', 'supplier_rank']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    IF to_regclass('public.' || specs[i][1]) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',
                   specs[i][1] || '_bump_partner_rank', specs[i][1]);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OF partner_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.partners_bump_rank(%L)',
      specs[i][1] || '_bump_partner_rank', specs[i][1], specs[i][2]);
  END LOOP;
END $$;

-- ── Backfill: parter som redan har dokument men saknar rang ────────────────
CREATE OR REPLACE FUNCTION public.backfill_partner_ranks(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cust_pending int; v_supp_pending int;
  v_cust int := 0; v_supp int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: backfilling partner ranks requires the admin role';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _rank_customers ON COMMIT DROP AS SELECT NULL::uuid AS id WHERE false;
  DELETE FROM _rank_customers;
  INSERT INTO _rank_customers
    SELECT DISTINCT unnest(ARRAY[p.id, p.commercial_partner_id])
    FROM partners p
    WHERE p.customer_rank = 0 AND (
      EXISTS (SELECT 1 FROM invoices d      WHERE d.partner_id = p.id)
      OR EXISTS (SELECT 1 FROM orders d     WHERE d.partner_id = p.id)
      OR EXISTS (SELECT 1 FROM subscriptions d WHERE d.partner_id = p.id)
      OR EXISTS (SELECT 1 FROM quotes d     WHERE d.partner_id = p.id)
      OR EXISTS (SELECT 1 FROM contracts d  WHERE d.partner_id = p.id));

  CREATE TEMP TABLE IF NOT EXISTS _rank_suppliers ON COMMIT DROP AS SELECT NULL::uuid AS id WHERE false;
  DELETE FROM _rank_suppliers;
  INSERT INTO _rank_suppliers
    SELECT DISTINCT unnest(ARRAY[p.id, p.commercial_partner_id])
    FROM partners p
    WHERE p.supplier_rank = 0 AND (
      EXISTS (SELECT 1 FROM purchase_orders d WHERE d.partner_id = p.id)
      OR EXISTS (SELECT 1 FROM vendor_invoices d WHERE d.partner_id = p.id));

  SELECT count(*) INTO v_cust_pending FROM partners WHERE customer_rank = 0 AND id IN (SELECT id FROM _rank_customers);
  SELECT count(*) INTO v_supp_pending FROM partners WHERE supplier_rank = 0 AND id IN (SELECT id FROM _rank_suppliers);

  IF NOT p_dry_run THEN
    WITH u AS (UPDATE partners SET customer_rank = 1
                WHERE customer_rank = 0 AND id IN (SELECT id FROM _rank_customers) RETURNING 1)
      SELECT count(*) INTO v_cust FROM u;
    WITH u AS (UPDATE partners SET supplier_rank = 1
                WHERE supplier_rank = 0 AND id IN (SELECT id FROM _rank_suppliers) RETURNING 1)
      SELECT count(*) INTO v_supp FROM u;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'customers_missing_rank', v_cust_pending,
    'suppliers_missing_rank', v_supp_pending,
    'customers_marked', v_cust,
    'suppliers_marked', v_supp);
END $$;

REVOKE ALL ON FUNCTION public.backfill_partner_ranks(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_partner_ranks(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.backfill_partner_ranks(boolean) IS
  'Markerar parter som redan har kommersiella dokument men saknar rang, så de '
  'syns i v_customers respektive v_vendors. Träffar även den kommersiella '
  'parten — annars är bolaget osynligt medan kontaktpersonen syns.';

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
-- En lins som inte visar en kund man just fakturerat är precis den sortens
-- tysta fel som bara upptäcks när någon undrar var kunden tog vägen.
CREATE OR REPLACE FUNCTION public.assert_invoiced_customer_is_visible()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_missing int;
BEGIN
  -- Avgränsat till kedjans EGNA rader. Ett påstående som granskar hela
  -- instansen faller på gammal data för alltid och blir därmed en grind som
  -- alla lär sig ignorera. Instansens hälsa mäts av backfill_partner_ranks,
  -- som rapporterar ett tal i stället för att kasta.
  SELECT count(*) INTO v_missing
  FROM invoices i
  JOIN partners p ON p.id = i.partner_id
  JOIN partners cp ON cp.id = p.commercial_partner_id
  WHERE cp.active AND cp.customer_rank = 0
    AND i.customer_email LIKE 'kedja.%@sandbox.local';

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'lens check: % invoiced part(y|ies) from this chain are invisible in v_customers — a customer you just billed must appear in the customer lens', v_missing;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_invoiced_customer_is_visible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_invoiced_customer_is_visible() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $outer$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  PERFORM public.assert_invoiced_customer_is_visible();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
