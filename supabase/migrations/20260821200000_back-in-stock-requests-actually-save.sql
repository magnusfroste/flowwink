-- "Meddela mig när den är tillbaka" gick sönder för anonyma besökare — tyst.
--
-- BackInStockForm (src/components/public/StockStatus.tsx) gör en anon UPSERT
-- mot back_in_stock_requests med onConflict 'product_id,email'. Tesen var att
-- INSERT-policyn "Anyone can request back in stock notifications" (WITH CHECK
-- true) bar första anmälan och att bara den ANDRA föll på att anon saknar
-- UPDATE-policy för konfliktvägen. Empirin på dev (anon-JWT-mönstret nedan)
-- visade värre: Postgres kräver för INSERT ... ON CONFLICT DO UPDATE att
-- målraden går att LÄSA — SELECT-policyn prövas redan på den rena insertvägen,
-- innan någon konflikt ens finns. anon har (korrekt) ingen läsväg på tabellen,
-- så VARJE anmälan via upserten nekas med 42501 på en instans utan
-- anon-SELECT. Besökaren ser "Could not save your request" — deterministiskt,
-- men utklätt till nätverksfel.
--
-- Vägar som övervägdes och förkastades:
--   * UPDATE-policy (USING true) för anon + no-op-vaktande trigger — räcker
--     inte: SELECT-kravet står kvar och upserten failar ändå.
--   * anon-SELECT-policy — gör hela prenumerantlistan (e-postadresser) läsbar
--     via PostgREST för vem som helst. Aldrig.
--
-- Därför samma mönster som ingest_form_lead (20260805190000): en SECURITY
-- DEFINER-RPC som är hela den publika skrivytan. Den validerar hårt, failar
-- tyst och returnerar ingenting — en utomstående ska inte kunna sondera vilka
-- adresser som väntar på en produkt. Förnyad anmälan re-arm:ar notified_at:
-- den som anmäler sig IGEN (produkten kom in, notifierades, tog slut på nytt)
-- vill uppenbart ha nästa utskick också — utan re-arm satt raden kvar som
-- "redan notifierad" och personen fick aldrig mer något mejl. Ingen ny
-- missbruksyta: att anmäla någon annans adress är redan möjligt via
-- INSERT-policyn; re-arm kräver samma kunskap (adress + produkt).
--
-- Tabellens RLS lämnas orörd: INSERT-policyn står kvar (skrivbar-men-oläsbar
-- är rätt för en publik kö), och anon får varken SELECT eller UPDATE.
--
-- LACKMUS (anon-JWT-claims-mönstret):
--   SET LOCAL ROLE anon;
--   SELECT set_config('request.jwt.claims','{"role":"anon"}', true);
--   POSITIVT: SELECT public.request_back_in_stock('<produkt-uuid>', 'a@b.se')
--             två gånger i rad → båda lyckas, EN rad finns efteråt.
--   POSITIVT: sätt notified_at på raden (som postgres), kör anmälan igen som
--             anon → notified_at är NULL igen (re-arm).
--   NEKANDE:  SELECT på back_in_stock_requests som anon → 0 rader.
--   NEKANDE:  UPDATE ... SET notified_at = now() som anon → 0 rader träffade.
--   NEKANDE:  ogiltig e-post ('inte-en-adress') / okänd produkt → RETURN utan
--             rad och utan fel (publik yta: validera hårt, faila tyst).

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

-- Poängen med funktionen är att besökare får kalla den.
GRANT EXECUTE ON FUNCTION public.request_back_in_stock(uuid, text)
  TO anon, authenticated, service_role;
