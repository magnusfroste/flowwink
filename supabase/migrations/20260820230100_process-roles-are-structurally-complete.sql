-- Matrisens ANDRA SVEP, strukturhål: processroller vars matriskarta saknade en
-- modul de bevisligen behöver för att göra sitt jobb.
--
-- Samma klass som 20260817230000 (modulfamiljer utan rader), men funnen från
-- andra hållet: inte "modulen saknas för alla roller" utan "rollen saknar en
-- modul dess EGEN process kräver". Symptomet är ett 403 mitt i ett arbetsflöde
-- som rollen är namngiven efter.
--
-- Fyllningsregeln är 20260817230000-mönstret: defaults för nyinstaller,
-- live-tabellen ENDAST där raden saknas (ON CONFLICT DO NOTHING). En operatörs
-- egna beviljanden och övriga rader rörs inte.
--
--   warehouse += purchasing
--     VARUMOTTAGNING är lagerrollens bokstavliga jobb. Inleveransen bokas mot
--     inköpsordern — receive_purchase_order, purchase_order_lines, matchningen
--     mot leverantörsfakturan — och allt det bor i `purchasing`. warehouse hade
--     `inventory` och `shipping` men inte modulen som äger dokumentet den tar
--     emot mot. Lagerpersonalen fick 403 på det ENDA steg som gör en inleverans
--     till en inleverans.
--
--   purchasing += inventory
--     Spegelvänt: inköpsrollen hade `purchasing` ensamt. Att lägga en order
--     kräver att man ser saldot man beställer mot — lagerplatser, kvarvarande
--     kvantiteter, påfyllningsnivåer — och `stock_locations` följer efter
--     20260820230000 modulen `inventory`. Utan raden kunde inköp beställa i
--     blindo och sedan inte verifiera att varan kom in.
--
-- Båda är LÄSBEHOV som råkar kräva modulmedlemskap, eftersom matrisen är en
-- ratt per modul och inte per verb. Det är ett medvetet grovkornigt beslut från
-- #102: en ratt som operatören förstår slår en finkornig som ingen ställer in.
--
-- LACKMUS:
--   POSITIVT: en `warehouse`-JWT → receive_purchase_order går igenom och
--             SELECT på purchase_orders ger rader (gav 403 / 0 rader förut).
--   POSITIVT: en `purchasing`-JWT → SELECT på stock_locations ger rader.
--   NEKANDE:  återkalla `purchasing` från warehouse i role_module_access →
--             samma inleverans nekas igen. Raden är en DEFAULT, inte en
--             hårdkodning: ratten står kvar hos operatören.
--   NEKANDE:  en `marketing`-JWT rör fortfarande varken purchasing eller
--             inventory — svepet vidgar två roller, inte alla.

DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('warehouse',  'purchasing'),
      ('purchasing', 'inventory')
    ) AS t(role_name, module_id)
  LOOP
    INSERT INTO public.role_module_access_defaults (role, module_id)
    VALUES (pair.role_name::public.app_role, pair.module_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_module_access (role, module_id)
    VALUES (pair.role_name::public.app_role, pair.module_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- support får AVSIKTLIGT inte `ecommerce` här. Behovet (returer kräver
-- orderraderna) löses i 20260820230000 med en LÄSPOLICY på returns-modulens
-- grind — support ska se ordern, aldrig ändra den. Att lösa det med
-- modulmedlemskap hade gett support full skrivrätt på butiksordrar för att
-- kunna läsa två fält.
