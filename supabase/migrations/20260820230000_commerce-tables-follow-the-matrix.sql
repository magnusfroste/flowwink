-- Matrisens ANDRA SVEP, P1: tabellerna rollsvepet #102 aldrig nådde.
--
-- #102 gjorde matrisen (role_module_access) till enda ratten för nav, skills och
-- ett trettiotal tabeller. Sju tabeller stod kvar med sitt gamla styre — antingen
-- ren admin-only eller en HÅRDKODAD rollista i policyn. Båda formerna är
-- skuggmatriser: en operatör som beviljar `ecommerce` åt support ser ingenting
-- hända, för policyn frågar inte matrisen utan has_role().
--
-- Symptomet som fann dem är värt att namnge: NEKAD BEHÖRIGHET RENDERAD SOM
-- FRÅNVARANDE DATA. orders/order_items var admin-only på SELECT, så support,
-- sales och warehouse fick inte 403 — de fick noll rader. Agenten svarade
-- "kunden har inga ordrar" i chatten. En tom lista ljuger tystare än ett fel.
--
-- Mönstret är ADDITIVT, exakt som 20260817233000: matrispolicyn läggs BREDVID
-- befintliga policies (permissive OR). Admin-, kund- och approver-vägarna
-- överlever orörda. Hårdkodade rollistor tas bort ENDAST där matrispolicyn
-- bevisligen ersätter dem — admin täcks alltid, eftersom can_access_module()
-- själv börjar med has_role(_user_id,'admin').
--
-- LACKMUSMÖNSTRET (negativtest) står i kommentar över varje policy: vilket
-- JWT-claims-test som BEVISAR den, i formen
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}', true);
-- En policy utan ett negativtest som misslyckas är inte bevisad — den är bara
-- skriven. Varje rad nedan anger både det positiva och det NEKANDE utfallet.

-- ── 1. Enkla "modulen förvaltar tabellen"-policies ──────────────────────────
-- LACKMUS (gäller alla fyra raderna nedan, byt modul/tabell):
--   POSITIVT: en användare med rollen `sales` (har `ecommerce` i matrisen) →
--             SELECT/UPDATE på orders ger rader / lyckas.
--   NEKANDE:  samma användare mot vendor_invoices (purchasing saknas för sales)
--             → SELECT ger 0 rader, UPDATE 0 rader. Återkalla `ecommerce` från
--             sales i role_module_access och orders ska OMEDELBART gå till 0
--             rader — annars läser något annat än matrisen.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      -- Butiksordern → ecommerce. Var admin-only på SELECT/UPDATE/DELETE:
      -- support/sales/warehouse såg INGENTING (den tysta tomma listan).
      ('orders',          'ecommerce'),
      ('order_items',     'ecommerce'),
      -- Returer → returns. Ersätter den hårdkodade listan
      -- admin|support|warehouse|sales (se avsnitt 2).
      ('returns',         'returns'),
      ('return_items',    'returns'),
      -- Kundfakturor → invoicing. Var admin + approver; accounting-rollen
      -- ÄGER invoicing i matrisen men kunde inte röra tabellen.
      ('invoices',        'invoicing'),
      -- Leverantörsfakturor → purchasing. Klassen "write-without-read":
      -- purchasing kunde SKAPA en leverantörsfaktura via SECURITY DEFINER-RPC
      -- men hade ingen SELECT-väg tillbaka till raden den just skapat.
      ('vendor_invoices', 'purchasing'),
      ('vendor_products', 'purchasing'),
      -- Lagerplatser → inventory. Var admin-only på skrivning.
      ('stock_locations', 'inventory')
    ) AS v(tbl, module_id)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN
      RAISE NOTICE 'Table % missing here — skipping', t.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   t.module_id || ' module manages ' || t.tbl, t.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING (public.can_access_module(auth.uid(), %L))
         WITH CHECK (public.can_access_module(auth.uid(), %L))',
      t.module_id || ' module manages ' || t.tbl, t.tbl, t.module_id, t.module_id);
  END LOOP;
END $$;

-- ── 2. Bort med de hårdkodade rollistorna som nu ÄR ersatta ────────────────
-- returns/return_items bar `admin|support|warehouse|sales` inbakat i policyn.
-- support och warehouse har `returns` i matrisen och tappar ingenting. sales
-- har det INTE — och förlorar därför sin returåtkomst. Det är avsikten, inte en
-- bieffekt: efter #102 är matrisen enda ratten, och en operatör som vill att
-- sälj ska hantera returer beviljar `returns` åt sales i Role Permissions. Att
-- lämna listan kvar hade betytt att den ratten inte fungerade.
--
-- LACKMUS: användare med rollen `sales` (utan `returns`) →
--   NEKANDE: SELECT på returns ger 0 rader, INSERT nekas (RLS-fel).
--   POSITIVT: bevilja `returns` åt sales i role_module_access → samma SELECT
--             ger rader UTAN att någon policy skrivs om. Det är beviset på att
--             ratten går hela vägen ned i RLS.
DROP POLICY IF EXISTS "Staff manage returns" ON public.returns;
DROP POLICY IF EXISTS "Staff manage return_items" ON public.return_items;

-- vendor_invoices: "Accounting can read vendor_invoices" var listan
-- admin|accounting. accounting-rollen har `purchasing` i matrisen, så
-- purchasing-policyn ovan täcker den redan — listan är ren dubblett.
-- NB: policyn finns LIVE men inte i repots baseline — den skapades ur band på
-- instanserna. DROP ... IF EXISTS hanterar båda världarna, och att den saknades
-- i repot är i sig ett skäl att bli av med den: en grind ingen migration äger
-- kan ingen migration heller resonera om.
-- LACKMUS: användare med rollen `accounting` → SELECT på vendor_invoices ger
--   fortfarande rader efter att listan tagits bort (positivt). Återkalla
--   `purchasing` från accounting → 0 rader (nekande). Före den här migrationen
--   var det nekande utfallet OMÖJLIGT att framkalla — rollistan svarade ändå.
DROP POLICY IF EXISTS "Accounting can read vendor_invoices" ON public.vendor_invoices;

-- MEDVETET KVAR: "Writers view vendor invoices" (writer|approver) och
-- "Approvers can view/update invoices" (approver). `approver` är en
-- ATTESTRELATION, inte en modulroll — samma samexistens som is_manager_of fick
-- i 20260817233000: matrisen svarar på "får rollen röra modulen", attestrollen
-- på "får personen godkänna just detta". `writer` i den listan är ett
-- kvarvarande arv och adresseras separat; att riva den här hade varit en
-- åtkomstförlust utanför det här svepets bevisade fynd.

-- ── 3. Läsning som stod öppen för HELA den inloggade världen ────────────────
-- vendor_products och stock_locations hade `USING (true)` på SELECT — samma
-- klass som journal_entries i 20260817233000, där kundportalens inloggade
-- konton kunde läsa huvudboken via PostgREST. Här läcker det INKÖPSPRISER och
-- lagerstruktur till varje kundkonto. Läsning stramas till personal (is_staff);
-- modulpolicyn ovan står kvar för skrivning och för icke-personal-agenter.
-- Utan den här strypningen vore modulpolicyns SELECT-led dekorativt: en
-- permissive OR med `true` bredvid sig grindar ingenting.
--
-- LACKMUS: en `customer`-JWT →
--   NEKANDE: SELECT på vendor_products ger 0 rader (gav ALLA rader före).
--   POSITIVT: en `warehouse`-JWT (is_staff) ger fortsatt rader.
DO $$
BEGIN
  IF to_regclass('public.vendor_products') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can view vendor products" ON public.vendor_products;
    DROP POLICY IF EXISTS "staff read vendor_products" ON public.vendor_products;
    CREATE POLICY "staff read vendor_products" ON public.vendor_products
      FOR SELECT USING (public.is_staff(auth.uid()));
  END IF;

  IF to_regclass('public.stock_locations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated can view locations" ON public.stock_locations;
    DROP POLICY IF EXISTS "staff read stock_locations" ON public.stock_locations;
    CREATE POLICY "staff read stock_locations" ON public.stock_locations
      FOR SELECT USING (public.is_staff(auth.uid()));
  END IF;
END $$;

-- ── 4. support läser ordern som returen SITTER PÅ ──────────────────────────
-- support äger `returns` men inte `ecommerce`, och ska inte äga `ecommerce` —
-- support ska inte kunna redigera eller annullera butiksordrar. Men en retur
-- ÄR en delmängd av en order: return_items pekar på orderraderna, och
-- inspect_return/refund_return räknar sitt förväntade belopp ur dem. Utan
-- läsning på orders/order_items kan support hantera returen men inte se vad
-- som köptes — och agenten svarar återigen "inga ordrar" i stället för 403.
--
-- Därför en LÄSPOLICY (endast SELECT) på returns-modulens grind, inte
-- ecommerce-medlemskap. Skrivning förblir ecommerce-modulens: en supportroll
-- kan LÄSA ordern men aldrig ändra den. Det här är avsiktligt asymmetriskt och
-- är hela poängen — modulgränsen finns kvar, men den går mellan LÄSA och
-- SKRIVA i stället för mellan SE och INTE SE.
--
-- LACKMUS (det avgörande negativtestet i hela migrationen):
--   POSITIVT: `support`-JWT → SELECT på orders ger rader.
--   NEKANDE:  samma JWT → UPDATE på orders uppdaterar 0 rader, INSERT nekas,
--             DELETE nekas. Om en UPDATE går igenom har någon råkat ge policyn
--             FOR ALL i stället för FOR SELECT.
--   NEKANDE:  återkalla `returns` från support → SELECT ger 0 rader igen.
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS "returns module reads orders" ON public.orders;
    CREATE POLICY "returns module reads orders" ON public.orders
      FOR SELECT USING (public.can_access_module(auth.uid(), 'returns'));
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "returns module reads order_items" ON public.order_items;
    CREATE POLICY "returns module reads order_items" ON public.order_items
      FOR SELECT USING (public.can_access_module(auth.uid(), 'returns'));
  END IF;
END $$;

-- ── 5. expenses: modulläsning utan att röra ägarregeln ─────────────────────
-- expenses behåller `user_id = auth.uid()` — man skapar, ändrar och raderar
-- INTE utlägg åt andra, oavsett modulbeviljande. Men accounting-rollen äger
-- `expenses` i matrisen och måste kunna LÄSA underlagen den bokför; idag såg
-- den bara sina egna. Endast SELECT läggs till, medvetet: attestvägen ligger
-- redan på expense_reports (20260817233000 §3), inte på enskilda rader.
--
-- LACKMUS:
--   POSITIVT: `accounting`-JWT → SELECT på expenses ger ANDRAS rader.
--   NEKANDE:  samma JWT → UPDATE på en annan användares expense uppdaterar
--             0 rader (ägarpolicyn är den enda UPDATE-vägen), DELETE likaså.
DO $$
BEGIN
  IF to_regclass('public.expenses') IS NOT NULL THEN
    DROP POLICY IF EXISTS "expenses module reads expenses" ON public.expenses;
    CREATE POLICY "expenses module reads expenses" ON public.expenses
      FOR SELECT USING (public.can_access_module(auth.uid(), 'expenses'));
  END IF;
END $$;
