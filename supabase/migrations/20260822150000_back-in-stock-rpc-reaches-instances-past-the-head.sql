-- request_back_in_stock landade UNDER ledgerns HEAD — den når inte alla instanser.
--
-- #244 mergades med sin migration kvar på `20260821200000`, medan main då redan
-- bar migrationer fram till `20260822140000` (rollsvep 4, anon-ythärdningen,
-- sandbox-sådden). Repot har alltså nu en migration under sin egen HEAD, och
-- det är exakt den drift `scripts/check-migration-forward-dated.ts` finns för:
-- en ledger tar sin högsta applicerade version och SKIPPAR TYST allt under den.
--
-- Konsekvens per instans, och det är därför symptomet är osynligt:
--   • Ny install (tom ledger) → kör allt i ordning, RPC:n finns. Ser rätt ut.
--   • Instans vars ledger ännu inte passerat 20260821200000 (dev låg på
--     20260814150157 när detta skrevs) → hinner med. Ser också rätt ut.
--   • Instans som redan applicerat 20260822-batchen → HOPPAR ÖVER RPC:n för
--     alltid. `supabase db push` säger ingenting; funktionen saknas bara, och
--     StockStatus faller tillbaka på upserten som inte fungerar för anon.
-- Två av tre utfall är gröna, vilket är precis varför den här klassen överlever
-- i månader (jfr baseline-squashen som tömde role_module_access_defaults).
--
-- Fixen är inte att döpa om filen i main: en instans som redan applicerat
-- 20260821200000 har den versionen i sin ledger, och att ta bort filen får
-- `db push` att gnälla om en historik som inte matchar. I stället läggs samma
-- DDL en gång till, forward-daterad. Kroppen är oförändrad och idempotent
-- (CREATE OR REPLACE + GRANT), så den som redan har RPC:n får en no-op och den
-- som skippade originalet får funktionen. Originalfilen står kvar orörd för
-- nyinstallationer.
--
-- LACKMUS (samma anon-JWT-claims-mönster som originalet):
--   SET LOCAL ROLE anon;
--   SELECT set_config('request.jwt.claims','{"role":"anon"}', true);
--   POSITIVT: SELECT public.request_back_in_stock('<produkt-uuid>', 'a@b.se')
--             två gånger i rad → båda lyckas, EN rad finns efteråt.
--   NEKANDE:  SELECT/UPDATE på back_in_stock_requests som anon → 0 rader.
--   Och på en instans vars ledger passerat 20260821200000: funktionen SAKNAS
--   före den här migrationen (`\df request_back_in_stock` ger tomt) — det är
--   fyndet som bevisas åtgärdat.

CREATE OR REPLACE FUNCTION public.request_back_in_stock(
  p_product_id uuid,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  -- Publik, oautentiserad yta: validera hårt, faila tyst (ingest_form_lead-
  -- mönstret). Inget returvärde — inte ens "fanns redan" läcker.
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN;
  END IF;
  IF p_product_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.back_in_stock_requests (product_id, email)
  VALUES (p_product_id, v_email)
  ON CONFLICT (product_id, email) DO UPDATE
    SET notified_at = NULL;  -- förnyad anmälan re-arm:ar nästa utskick
END;
$$;

-- Poängen med funktionen är att besökare får kalla den. Granten upprepas här
-- medvetet, inte för att den behövs idag: anon-ythärdningen (20260822020000)
-- revokar PUBLIC-defaulten men lämnar anons EGEN default-grant kvar (den
-- migrationen är uttrycklig med att den inte fattar det flottbeslutet), och
-- request_back_in_stock står inte i dess revoke-lista. Ett explicit grant är
-- hängslet för den dag ratten stängs — då slocknar publika ytor utan ett
-- eget grant tyst, vilket är precis vad den här funktionen inte får göra.
GRANT EXECUTE ON FUNCTION public.request_back_in_stock(uuid, text)
  TO anon, authenticated, service_role;
