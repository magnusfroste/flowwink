-- Verifikationen som aldrig skrevs — och momsen som försvann med den.
--
-- ── Det verkliga felet (mätt på Nordbrygg, 2026-08-27) ──────────────────────
-- Inköpskedjan postade TVÅ verifikationer och saknade den i mitten:
--
--   mottagning:   Dt 1460 Lager        13 440,00  /  Kr 2441 GRNI      13 440,00
--   faktura:      — INGENTING —
--   betalning:    Dt 2440 Lev.skuld    15 052,80  /  Kr 1930 Bank      15 052,80
--
-- Varje verifikation balanserar för sig, så ingen kontroll larmade. Men de
-- hänger inte ihop, och tre saldon bär spåren:
--
--   • 2441 GRNI  −60 736,00 och växande. Upplupningen som mottagningen bokar
--     stängs aldrig av någon. Kontot är en evighetsmaskin.
--   • 2440 Leverantörsskuld  +40 852,80 DEBET. Betalningen debiterar en skuld
--     som ingen någonsin krediterat — ett skuldkonto som blivit en tillgång.
--   • 2641 Debiterad ingående moms: ALDRIG rörd. 8 044,80 avdragsgill moms
--     fanns aldrig i huvudboken och kunde därför aldrig hamna i ruta 48 på
--     momsdeklarationen. Pengar företaget hade rätt till, borta i tystnad.
--
-- Odoo kallar mellansteget anglosaxisk redovisning: mottagningen bokas mot
-- "Stock Interim (Received)" och leverantörsfakturan NOLLSTÄLLER det kontot
-- (DR Interim Received / CR Accounts Payable, plus ingående moms). Vår 2441
-- spelar exakt Interim Received-rollen — i BAS är den en kortfristig skuld i
-- 244x-serien i stället för en tillgång, men funktionen är densamma: ett
-- clearingkonto mellan leverans och faktura som ska gå till noll.
--
-- ── Vad som ändras ──────────────────────────────────────────────────────────
-- 1. Kontona läses ur KONTOROLLERNA (account_for), inte ur funktionskroppen.
--    Rollerna 'inventory', 'goods_received_not_invoiced' och
--    'purchase_price_variance' fanns inte — de skapas här för båda paketen.
-- 2. book_vendor_invoice() bokför den saknade verifikationen, och en trigger
--    på vendor_invoices ser till att den skrivs oavsett vem som registrerar
--    (agentens db:-skill, admin-UI:t eller en RPC).
-- 3. Mottagningens verifikation dateras efter HÄNDELSEN (goods_receipts.
--    received_date), inte CURRENT_DATE. Mätt: en mottagning daterad
--    2026-08-28 fick verifikation daterad 2026-08-23.
-- 4. Båda verifikationerna bär reference_number = händelsens id, så
--    upplupningen per inköpsorder kan läsas ur huvudboken i stället för
--    gissas.
--
-- Idempotent och framåtdaterad (Lovables migrationskörare hoppar tyst över en
-- migration vars tidsstämpel ligger under dess ledger-HEAD).

-- ─── 1. Roller, inte kontonummer ────────────────────────────────────────────
-- Kontoklassificering hör i kontoplanen. 2441/2641/2440 är BAS-specifika och
-- får aldrig stå i en funktionskropp; motorn frågar efter ROLLEN och paketet
-- svarar med kontot. ifrs-generic-paketet är grövre — där spelar 2200 Accrued
-- Expenses samma roll som 2441 gör i BAS.
INSERT INTO public.account_roles (locale, role, account_code, description) VALUES
  ('se-bas2024', 'inventory',                   '1460',
   'Lager av handelsvaror — kontot mottagningen debiterar'),
  ('se-bas2024', 'goods_received_not_invoiced', '2441',
   'Ej fakturerade varuleveranser (GRNI). Odoos "Stock Interim (Received)": mottagningen krediterar, leverantörsfakturan nollställer.'),
  ('se-bas2024', 'purchase_price_variance',     '4000',
   'Inköp av varor från Sverige — den del av leverantörsfakturan som ingen mottagning upplupit (Odoos Price Difference).'),
  ('ifrs-generic', 'inventory',                   '1200', 'Inventories'),
  ('ifrs-generic', 'goods_received_not_invoiced', '2200',
   'Accrued Expenses — the coarse chart''s Stock Interim (Received)'),
  ('ifrs-generic', 'purchase_price_variance',     '5000', 'Cost of Sales (purchase price difference)')
ON CONFLICT (locale, role) DO NOTHING;

-- ─── 2. Den saknade verifikationen ──────────────────────────────────────────
-- Dt GRNI (stänger mottagningens upplupning)
--   + Dt ingående moms
--   / Kr Leverantörsskuld
--
-- Tre saker som inte är självklara:
--
-- MOMSEN. tax_cents är NOT NULL DEFAULT 0, så noll kan betyda två helt olika
-- saker. Ett belopp på noll får inte skapa en tom rad i verifikationen — men
-- det får heller inte tolkas som "ingen moms angiven". Därför avgörs läget av
-- förhållandet mellan netto, moms och totalsumma:
--   • subtotal + tax = total, tax = 0        → UTTALAD nollmoms (EU-förvärv,
--     omvänd skattskyldighet). Ingen momsrad skrivs, och det är rätt.
--   • subtotal > 0, tax = 0, subtotal ≠ total → momsen härleds som total −
--     subtotal. Registreraren angav netto och brutto men inte momsen.
--   • subtotal = 0 och tax = 0, total > 0    → bara totalen angavs. Momsen är
--     OKÄND, inte noll. Vi hittar ingen avdragsgill moms på egen hand;
--     bruttot bokas och verifikationen SÄGER att momsen saknas, så den går att
--     hitta och rätta i stället för att tyst bli noll.
--
-- UPPLUPNINGEN. GRNI debiteras bara upp till vad mottagningarna faktiskt
-- upplupit för inköpsordern, läst ur huvudboken. Utan det taket skulle en
-- överfakturering (som finns på Nordbrygg: 20 640 fakturerat mot 12 900
-- mottaget) trycka 2441 över till debet — samma buggklass som den här
-- migrationen lagar. Överskjutande del går till prisdifferenskontot där den
-- SYNS, i stället för att gömmas i ett clearingkonto.
--
-- FAKTURA UTAN INKÖPSORDER. Då finns ingen upplupning att stänga. Hela nettot
-- går till expense_default — men leverantörsskulden krediteras ändå, för det
-- är krediteringen som saknades och som gjorde 2440 till en tillgång.
CREATE OR REPLACE FUNCTION public.book_vendor_invoice(
  p_vendor_invoice_id uuid,
  p_entry_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.vendor_invoices;
  v_grni text;
  v_ap text;
  v_vat text;
  v_other text;
  v_other_label text;
  v_total bigint;
  v_tax bigint;
  v_net bigint;
  v_vat_known boolean := true;
  v_open bigint := 0;
  v_to_grni bigint := 0;
  v_to_other bigint := 0;
  v_date date;
  v_je uuid;
  v_note text := '';
BEGIN
  -- Direktanrop kräver inköpsmodulen. Anrop från triggern (pg_trigger_depth>0)
  -- har redan passerat vendor_invoices egen RLS — att grinda samma skrivning
  -- två gånger skulle bara ge ett nytt sätt för verifikationen att utebli.
  IF pg_trigger_depth() = 0
     AND NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
  END IF;

  -- Idempotent: en faktura bokförs en gång. Verifikationen bär fakturans id.
  SELECT id INTO v_je FROM public.journal_entries
   WHERE source = 'vendor_invoice' AND reference_number = v_inv.id::text
   LIMIT 1;
  IF v_je IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_booked', true,
                              'vendor_invoice_id', v_inv.id, 'journal_entry_id', v_je);
  END IF;

  v_total := COALESCE(v_inv.total_cents, 0);
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice has no positive total',
                              'vendor_invoice_id', v_inv.id);
  END IF;

  v_grni  := public.account_for('goods_received_not_invoiced');
  v_ap    := public.account_for('accounts_payable');
  v_vat   := public.account_for('vat_input');

  -- Momsläget (se resonemanget ovan).
  v_tax := COALESCE(v_inv.tax_cents, 0);
  IF v_tax = 0 THEN
    IF COALESCE(v_inv.subtotal_cents, 0) = 0 THEN
      v_vat_known := false;
      v_note := 'Moms ej angiven vid registreringen — bruttot bokat utan avdrag. Rätta fakturans subtotal/tax och bokför om.';
    ELSIF v_inv.subtotal_cents <> v_total THEN
      v_tax := v_total - v_inv.subtotal_cents;
      v_note := 'Momsen härledd som total − subtotal.';
    ELSE
      v_note := 'Nollmoms enligt fakturan (t.ex. EU-förvärv eller omvänd skattskyldighet) — ingen momsrad skrivs.';
    END IF;
  END IF;

  IF v_tax < 0 OR v_tax > v_total THEN
    RAISE EXCEPTION
      'Vendor invoice % has an impossible VAT amount (subtotal %, tax %, total %) — a journal entry from these numbers would be wrong, not merely unbalanced.',
      COALESCE(v_inv.invoice_number, v_inv.id::text),
      v_inv.subtotal_cents, v_inv.tax_cents, v_total
      USING ERRCODE = 'check_violation';
  END IF;

  v_net := v_total - v_tax;
  v_date := COALESCE(p_entry_date, v_inv.invoice_date, CURRENT_DATE);

  IF v_inv.purchase_order_id IS NOT NULL THEN
    -- Öppen upplupning för ordern, läst ur huvudboken: vad mottagningarna
    -- krediterat GRNI minus vad tidigare fakturor redan debiterat bort.
    SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) INTO v_open
      FROM public.journal_entry_lines l
      JOIN public.journal_entries e ON e.id = l.journal_entry_id
     WHERE e.status = 'posted'
       AND l.account_code = v_grni
       AND (
         (e.source = 'inventory_receipt' AND e.reference_number IN (
            SELECT gr.id::text FROM public.goods_receipts gr
             WHERE gr.purchase_order_id = v_inv.purchase_order_id))
         OR
         (e.source = 'vendor_invoice' AND e.reference_number IN (
            SELECT vi.id::text FROM public.vendor_invoices vi
             WHERE vi.purchase_order_id = v_inv.purchase_order_id))
       );
    v_open := GREATEST(v_open, 0);
    v_to_grni := LEAST(v_net, v_open);
    v_to_other := v_net - v_to_grni;
    v_other := public.account_for('purchase_price_variance');
    v_other_label := 'Prisdifferens — fakturerat utöver mottaget';
  ELSE
    v_to_grni := 0;
    v_to_other := v_net;
    v_other := public.account_for('expense_default');
    v_other_label := 'Leverantörsfaktura utan inköpsorder';
  END IF;

  INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source, vendor_id)
  VALUES (v_date,
          'Leverantörsfaktura ' || COALESCE(v_inv.invoice_number, '')
            || CASE WHEN v_vat_known THEN '' ELSE ' (moms ej angiven)' END,
          v_inv.id::text, 'posted', 'vendor_invoice', v_inv.vendor_id)
  RETURNING id INTO v_je;

  -- Inga nollrader. Ett belopp på noll är inte en post — det är frånvaron av
  -- en post, och en tom rad gör bara att kontot ser rört ut i rapporterna.
  IF v_to_grni > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_grni, v_to_grni, 0, 'Stänger ej fakturerad varuleverans');
  END IF;

  IF v_to_other <> 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_other,
            GREATEST(v_to_other, 0), GREATEST(-v_to_other, 0), v_other_label);
  END IF;

  IF v_tax > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_vat, v_tax, 0, 'Debiterad ingående moms');
  END IF;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je, v_ap, 0, v_total, 'Leverantörsskuld');

  RETURN jsonb_build_object(
    'success', true,
    'vendor_invoice_id', v_inv.id,
    'journal_entry_id', v_je,
    'entry_date', v_date,
    'total_cents', v_total,
    'net_cents', v_net,
    'vat_cents', v_tax,
    'vat_specified', v_vat_known,
    'grni_account', v_grni,
    'grni_closed_cents', v_to_grni,
    'grni_open_before_cents', v_open,
    'variance_account', CASE WHEN v_to_other <> 0 THEN v_other END,
    'variance_cents', v_to_other,
    'vat_account', CASE WHEN v_tax > 0 THEN v_vat END,
    'payable_account', v_ap,
    'note', NULLIF(v_note, '')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.book_vendor_invoice(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.book_vendor_invoice(uuid, date) IS
  'Bokför en registrerad leverantörsfaktura: Dt ej fakturerade varuleveranser (GRNI) + Dt ingående moms / Kr leverantörsskuld. Kontona resolvas genom account_for(). Idempotent — verifikationen bär fakturans id i reference_number.';

-- Triggern, inte skillen. register_vendor_invoice är en db:-skill som skriver
-- rakt in i tabellen, och admin-UI:t gör detsamma. Bara en trigger fångar
-- ALLA vägar in — och en bokföringspost som beror på vilken väg registreringen
-- tog är ingen bokföring.
CREATE OR REPLACE FUNCTION public.book_vendor_invoice_on_register()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Medvetet OSKYDDAD av något EXCEPTION-block. En sväljd bokföring är exakt
  -- det fel den här migrationen lagar: fakturan registrerades, ingenting
  -- bokfördes, och ingen fick veta.
  PERFORM public.book_vendor_invoice(NEW.id, NEW.invoice_date);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_book_vendor_invoice_on_register ON public.vendor_invoices;
CREATE TRIGGER trg_book_vendor_invoice_on_register
  AFTER INSERT ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.book_vendor_invoice_on_register();

-- ─── 3. Betalningen läser samma roll som fakturan ───────────────────────────
-- pay_vendor_invoice bar '2440' i KROPPEN. Kontorollsspärren tittar bara på
-- parameterdefaulter, så literalen slank igenom — och en betalning som
-- debiterar ett annat konto än fakturan krediterade stänger ingen skuld.
-- Övrig kropp oförändrad (hämtad ur den levande definitionen).
CREATE OR REPLACE FUNCTION public.pay_vendor_invoice(p_vendor_invoice_id uuid, p_pay_date date DEFAULT CURRENT_DATE, p_bank_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.vendor_invoices;
  v_je_id uuid;
  v_ap text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  v_ap := public.account_for('accounts_payable');
  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
  END IF;
  IF v_inv.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice already paid', 'paid_at', v_inv.paid_at);
  END IF;
  IF COALESCE(v_inv.total_cents, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice has no positive total');
  END IF;

  INSERT INTO public.journal_entries (entry_date, description, status, source, vendor_id)
  VALUES (p_pay_date, 'Betalning leverantörsfaktura ' || COALESCE(v_inv.invoice_number, ''), 'posted', 'vendor_payment', v_inv.vendor_id)
  RETURNING id INTO v_je_id;

  -- account_name is auto-filled by the fill_journal_line_account_name trigger.
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
    (v_je_id, v_ap, v_inv.total_cents, 0, 'Leverantörsskuld'),
    (v_je_id, p_bank_account, 0, v_inv.total_cents, 'Utbetalning');

  UPDATE public.vendor_invoices SET status = 'paid', paid_at = p_pay_date WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'success', true, 'vendor_invoice_id', v_inv.id, 'journal_entry_id', v_je_id,
    'total_cents', v_inv.total_cents, 'paid_at', p_pay_date, 'bank_account', p_bank_account,
    'payable_account', v_ap
  );
END;
$function$;

-- ─── 4. Mottagningens verifikation följer händelsen ─────────────────────────
-- entry_date var CURRENT_DATE. Mätt på Nordbrygg: en mottagning daterad
-- 2026-08-28 fick verifikation daterad 2026-08-23, och en daterad 2026-09-27
-- likaså. En leverans som registreras i efterhand hamnar i fel period — och
-- vid årsskiftet i fel räkenskapsår, där periodspärren dessutom kan låta den
-- passera in i ett år den inte hör hemma i.
--
-- Datumet hämtas ur HÄNDELSEN: goods_receipts.received_date. Finns ingen
-- mottagningsrad faller den tillbaka på när rörelsen registrerades
-- (NEW.created_at), som en efterdaterad import kan sätta själv — CURRENT_DATE
-- är sista utvägen, inte första.
--
-- Samtidigt: kontona genom account_for(), och reference_number = mottagningens
-- id så upplupningen per inköpsorder går att LÄSA i stället för att gissas.
-- Övrig kropp oförändrad (hämtad ur den levande definitionen och återlagd, så
-- inget annat fynd i den här funktionen ändras i smyg).
CREATE OR REPLACE FUNCTION public.process_stock_move_valuation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qty numeric := abs(COALESCE(NEW.quantity,0));
  v_is_in boolean;
  v_method text;
  v_unit_cost bigint;
  v_total_cost bigint := 0;
  v_layer RECORD;
  v_take numeric;
  v_remaining numeric;
  v_avg numeric;
  v_je uuid;
  v_is_purchase boolean;
  v_event_date date;
  v_receipt_id uuid;
BEGIN
  IF v_qty = 0 THEN RETURN NEW; END IF;
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption','adjustment') THEN RETURN NEW; END IF;
  -- 'adjustment' carries its direction in the SIGN (adjust_quant), the same way
  -- 'in' does. Stock that appears on a count is stock the books must carry.
  v_is_in := (NEW.move_type IN ('in','mo_production','adjustment')) AND COALESCE(NEW.quantity,0) > 0;
  v_is_purchase := NEW.reference_type IN ('purchase_order','po','goods_receipt');

  IF v_is_in THEN
    v_unit_cost := COALESCE(NEW.unit_cost_cents,
                            resolve_inbound_unit_cost(NEW.product_id, NEW.reference_type, NEW.reference_id));

    -- Goods coming back that the warehouse already carries re-enter at what it
    -- carries them at. Only when nothing else supplied a cost — a receipt's PO
    -- price and an explicit unit_cost_cents both still win.
    IF COALESCE(v_unit_cost, 0) = 0 THEN
      SELECT CASE WHEN sum(remaining_qty) > 0
                  THEN round(sum(remaining_qty * unit_cost_cents) / sum(remaining_qty)) END
        INTO v_unit_cost
        FROM stock_valuation_layers
       WHERE product_id = NEW.product_id AND remaining_qty > 0;
      -- Still nothing on hand to average against: the product's standing cost.
      IF COALESCE(v_unit_cost, 0) = 0 THEN
        SELECT cost_cents INTO v_unit_cost FROM products WHERE id = NEW.product_id;
      END IF;
      v_unit_cost := COALESCE(v_unit_cost, 0);
    END IF;

    INSERT INTO stock_valuation_layers (product_id, variant_id, move_id, quantity, unit_cost_cents, value_cents, remaining_qty)
    VALUES (NEW.product_id, NEW.variant_id, NEW.id, v_qty, v_unit_cost, round(v_qty * v_unit_cost), v_qty);
    UPDATE stock_moves SET unit_cost_cents = v_unit_cost, value_cents = round(v_qty * v_unit_cost)
      WHERE id = NEW.id;

    -- What was paid for it is what it costs. Learned once, from the receipt
    -- that knew; never overwritten, so a standard cost an operator set stands.
    IF v_is_purchase AND v_unit_cost > 0 THEN
      UPDATE products
         SET cost_cents = v_unit_cost, updated_at = now()
       WHERE id = NEW.product_id AND cost_cents IS NULL;
    END IF;

    IF v_is_purchase AND v_unit_cost > 0 THEN
      -- Bokföringsdatumet följer händelsen, inte klockan.
      v_receipt_id := NULL;
      v_event_date := NULL;
      IF NEW.reference_type = 'goods_receipt'
         AND COALESCE(NEW.reference_id,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_receipt_id := NEW.reference_id::uuid;
        SELECT received_date INTO v_event_date FROM goods_receipts WHERE id = v_receipt_id;
      END IF;
      v_event_date := COALESCE(v_event_date, NEW.created_at::date, CURRENT_DATE);

      BEGIN
        INSERT INTO journal_entries (entry_date, description, reference_number, source, status)
        VALUES (v_event_date, 'Inventory receipt '||COALESCE(NEW.reference_id,''),
                NEW.reference_id, 'inventory_receipt', 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
        VALUES (v_je, public.account_for('inventory'), round(v_qty*v_unit_cost), 0, 'Lager av handelsvaror'),
               (v_je, public.account_for('goods_received_not_invoiced'), 0, round(v_qty*v_unit_cost), 'GRNI — ej fakturerade leveranser');
      EXCEPTION WHEN others THEN
        -- Kvar som varning (inte notis): en utebliven verifikation ska synas i
        -- loggen, inte bara i saldot tre månader senare.
        RAISE WARNING 'inventory_receipt JE skipped: %', SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(pc.costing_method,'average') INTO v_method
  FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
  WHERE p.id = NEW.product_id;
  v_method := COALESCE(v_method,'average');

  IF v_method = 'average' THEN
    SELECT CASE WHEN sum(remaining_qty) > 0
                THEN sum(remaining_qty * unit_cost_cents) / sum(remaining_qty) END
    INTO v_avg FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0;
  END IF;

  v_remaining := v_qty;
  FOR v_layer IN
    SELECT id, remaining_qty, unit_cost_cents FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_layer.remaining_qty, v_remaining);
    v_total_cost := v_total_cost + round(v_take * CASE WHEN v_method='average' THEN v_avg ELSE v_layer.unit_cost_cents END);
    UPDATE stock_valuation_layers SET remaining_qty = remaining_qty - v_take WHERE id = v_layer.id;
    v_remaining := v_remaining - v_take;
  END LOOP;
  IF v_remaining > 0 THEN
    SELECT COALESCE(v_avg, cost_cents, 0) INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_total_cost := v_total_cost + round(v_remaining * COALESCE(v_unit_cost,0));
  END IF;

  UPDATE stock_moves SET
    unit_cost_cents = CASE WHEN v_qty > 0 THEN round(v_total_cost / v_qty) ELSE NULL END,
    value_cents = v_total_cost
  WHERE id = NEW.id;

  RETURN NEW;
END $function$;

-- ─── 5. Sensorn som ser om sömmen håller ────────────────────────────────────
-- inventory_gl_reconciliation mäter lagerkontot mot värderingslagren. Den ser
-- INTE om upplupningen stängs — 2441 kan växa hur länge som helst utan att den
-- säger ett ord. Den här läser clearingkontot per inköpsorder: en order som är
-- helt mottagen och helt fakturerad ska ha noll kvar.
CREATE OR REPLACE FUNCTION public.grni_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grni text;
  v_balance bigint;
  v_open bigint;
  v_unlinked bigint;
  v_rows jsonb;
BEGIN
  v_grni := public.account_for('goods_received_not_invoiced');

  SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) INTO v_balance
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
   WHERE l.account_code = v_grni AND e.status = 'posted';

  -- Per inköpsorder: mottaget minus fakturerat, ur huvudboken.
  WITH per_po AS (
    SELECT po.id,
           po.po_number,
           COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS open_cents
      FROM public.purchase_orders po
      JOIN public.journal_entries e
        ON (e.source = 'inventory_receipt'
            AND e.reference_number IN (SELECT gr.id::text FROM public.goods_receipts gr WHERE gr.purchase_order_id = po.id))
        OR (e.source = 'vendor_invoice'
            AND e.reference_number IN (SELECT vi.id::text FROM public.vendor_invoices vi WHERE vi.purchase_order_id = po.id))
      JOIN public.journal_entry_lines l ON l.journal_entry_id = e.id AND l.account_code = v_grni
     WHERE e.status = 'posted'
     GROUP BY po.id, po.po_number
  )
  SELECT COALESCE(SUM(open_cents), 0),
         COALESCE(jsonb_agg(jsonb_build_object('po_number', po_number, 'open_cents', open_cents)
                            ORDER BY open_cents DESC) FILTER (WHERE open_cents <> 0), '[]'::jsonb)
    INTO v_open, v_rows
    FROM per_po;

  v_unlinked := v_balance - v_open;

  RETURN jsonb_build_object(
    'success', true,
    'grni_account', v_grni,
    'grni_balance_cents', v_balance,
    'open_per_purchase_order_cents', v_open,
    'unlinked_cents', v_unlinked,
    'open_orders', v_rows,
    'reconciled', v_unlinked = 0,
    'explanation', CASE
      WHEN v_unlinked = 0 AND v_balance = 0 THEN 'Upplupningen är noll — varje mottagning har mötts av en faktura.'
      WHEN v_unlinked = 0 THEN 'Hela saldot är mottaget-men-ännu-inte-fakturerat och går att härleda till öppna inköpsordrar.'
      ELSE 'Del av saldot går inte att härleda till någon inköpsorder — verifikationer utan reference_number (bokförda före 2026-08-27) eller manuella journaler.'
    END
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.grni_reconciliation() TO authenticated, service_role;

COMMENT ON FUNCTION public.grni_reconciliation() IS
  'Läser clearingkontot mellan mottagning och leverantörsfaktura (GRNI) per inköpsorder. reconciled=false betyder att saldo finns som ingen order förklarar.';

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.account_roles
   WHERE role IN ('inventory','goods_received_not_invoiced','purchase_price_variance');
  RAISE NOTICE 'account_roles: % inköpsroller mappade', v_n;
END $$;
