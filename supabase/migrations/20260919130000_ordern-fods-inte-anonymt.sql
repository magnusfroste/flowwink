-- Ordern föds inte anonymt.
--
-- Säkerhetspasset 2026-09-19 (efter processbatteriets webinarfynd) listade varje
-- INSERT-policy som är öppen för alla UTAN villkor. Två av dem var inte en
-- besökaryta utan en kvarleva:
--
--   orders       "Anyone can create orders"       WITH CHECK (true)
--   order_items  "Anyone can create order items"  WITH CHECK (true)
--
-- Verifierat lokalt: en anonym POST mot /rest/v1/orders med status 'paid' och
-- valfri total svarade 201 — en "betald" order i adminlistan som ingen betalat.
-- Ingen klient skriver order direkt: kassan går genom create-checkout och
-- agenter genom place_order, båda med service-rollen (som inte läser RLS).
-- Personal skriver genom "ecommerce module manages orders" (matrisen).
--
-- Idempotent: DROP POLICY IF EXISTS.
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create order items" ON public.order_items;

DO $proof$
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    BEGIN
      INSERT INTO public.orders (customer_email, customer_name, total_cents, status, currency)
      VALUES ('proof-anon@example.test', 'proof', 99900, 'paid', 'SEK');
      RAISE EXCEPTION 'proof: an anonymous visitor created a paid order';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ordern-fods-inte-anonymt: proof passed';
END $proof$;
