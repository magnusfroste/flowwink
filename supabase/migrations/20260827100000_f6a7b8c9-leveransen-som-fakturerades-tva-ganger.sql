-- ─────────────────────────────────────────────────────────────────────────────
-- Leveransen som fakturerades två gånger — och betalningen som inte frågade
-- ─────────────────────────────────────────────────────────────────────────────
--
-- MÄTT PÅ NORDBRYGG 2026-08-23 (raderna ligger kvar i instansen):
--
--   PO-00004, en (1) godsmottagning: 60 kg à 224,00 = 13 440,00 mottaget värde.
--   SR-2026-0518        subtotal 13 440,00 → match_invoice_to_receipt svarade
--                       "matched, 0 % avvikelse" → auto-godkänd → betald.
--   SR-2026-0518-KOPIA  samma belopp, samma PO, registrerad EN GÅNG TILL.
--                       Matchningen svarade "matched, 0 % avvikelse" igen och
--                       auto_approve_vendor_invoice godkände.
--   Summa godkänt: 30 105,60 mot en leverans på 13 440,00.
--
-- Orsaken är inte att matchningen räknade fel. Den räknade RÄTT SAK FEL GÅNG:
-- varje faktura jämfördes mot inköpsorderns HELA mottagna värde, och ingen
-- frågade vad som redan tagits i anspråk. Två fakturor mot samma leverans får
-- därför båda svaret "0 % avvikelse", och en tredje skulle också få det.
-- Odoo för `qty_invoiced` per orderrad just för detta: en andra faktura mot
-- samma mottagning ser noll kvar att fakturera.
--
--   NPD-2026-11907      match_status = over_invoiced, 60 % över mottaget värde,
--                       approved_at = NULL. pay_vendor_invoice BETALADE den.
--                       Status gick received → paid och hoppade över approved
--                       helt. Funktionen kollade bara paid_at och att beloppet
--                       var positivt — matchningen och godkännandet var
--                       parallella etiketter ingen läste.
--   flag_invoice_variance listade mycket riktigt fakturan — som redan betald.
--   Kön var en obduktion.
--
-- Den verkliga risken är inte att en människa missar. Det är att en autonom
-- operatör som ombeds "betala förfallna leverantörsfakturor" betalar
-- dubbletten utan friktion, för att ingenting i kedjan säger nej.
--
-- ── VAL: HÄRLETT, INTE LAGRAT ───────────────────────────────────────────────
-- Odoo lagrar qty_invoiced PÅ orderraden. Odoo kan det: deras leverantörs-
-- faktura har rader som pekar på orderraden (account.move.line.purchase_line_id),
-- så det lagrade talet är en cache av något som redan finns radvis.
--
-- FlowWinks vendor_invoices har INGA rader. Det finns ingen vendor_invoice_lines
-- (kontrollerat i schemat: bara vendor_invoices, vendor_invoice_disputes,
-- vendor_credit_memos). Att skriva invoiced_quantity på purchase_order_lines
-- skulle alltså kräva att vi FÖRDELAR ett fakturahuvuds belopp över raderna
-- efter en påhittad nyckel — och sedan låta matchningen lita på det påhittet.
-- Det vore en andra skrivare av en sanning som redan finns (fakturaraderna i
-- liggaren), och husregeln är en skrivare per sanning.
--
-- Därför HÄRLEDS anspråket, med EN namngiven läsare —
-- po_invoiced_value_cents(po_id, exclude_invoice_id) — som matchningen,
-- betalningsgrinden och UI:t alla läser. Ingen kolumn kan driva isär från
-- verkligheten, för det finns ingen kolumn. Priset är en summering per anrop;
-- det är en handfull rader per inköpsorder.
--
-- Fidelity-noteringen som följer med valet: vi kan bara räkna VÄRDE, inte
-- kvantitet per rad, eftersom fakturan saknar rader. Det räcker för att stoppa
-- dubbletten och över-anspråket, vilket är hela fyndet. Den dag
-- vendor_invoice_lines finns byter po_invoiced_value_cents kropp och inget
-- annat behöver röras.
--
-- ── ODOOS BILL CONTROL POLICY ───────────────────────────────────────────────
-- Odoo väljer per produkt (med default i Purchase-inställningarna) om fakturan
-- ska mätas mot ORDERED quantities eller RECEIVED quantities. Vi lägger dialen
-- där Odoo har sin default: site_settings-nyckeln 'purchasing',
-- value->>'bill_control_policy' ∈ {'received','ordered'}. Utelämnad ⇒
-- 'received', vilket är beteendet före den här migrationen. Per-produkt-
-- override finns medvetet INTE: en kolumn på products som ingen yta kan sätta
-- är död data.
--
-- ── VAR GRINDEN BOR, OCH VARFÖR INTE I pay_vendor_invoice ───────────────────
-- Grinden skulle kunna ligga i pay_vendor_invoice. Den ligger i stället i en
-- BEFORE UPDATE-trigger på vendor_invoices, av samma skäl som
-- guard_invoice_cancel_with_payments (20260710030000): DB-nivå är
-- vägoberoende. Betalningen kan komma från skillen, admin-UI:t, en automation
-- eller rå SQL, och pay_vendor_invoice skrivs om av andra spår i kedjan — en
-- grind som bor i en funktionskropp försvinner nästa gång någon återutger den
-- funktionen. Statusraden 'paid' är den enda dörren pengarna kan gå ut genom,
-- och det är den vi låser. Verifikationen som redan hunnit postas i samma
-- transaktion rullas tillbaka med undantaget.
--
-- Odoos motsvarighet är fältet "Should Be Paid" på leverantörsfakturan: när
-- trevägsmatchningen är i Exception blockeras betalningen. Skillnaden är att
-- vår version inte är ett fält någon kan skriva om — den räknas om ur
-- underlaget vid varje betalningsförsök.
--
-- ── ÖVERTRUMFNINGEN ─────────────────────────────────────────────────────────
-- Ingen ny flagga. Huset har redan en rail för "en människa överprövar en
-- grind": approval_requests + request_entity_approval() +
-- advance_approval_step(), precis som guard_po_chain_approval och
-- guard_expense_chain_approval. Och entity_type 'vendor_invoice' fanns redan
-- där — trg_sync_vendor_invoice_approval stämplar fakturan godkänd när kedjan
-- säger ja. Grinden läser samma rad.
--
-- Två skillnader mot chain_approval_satisfied(), medvetna:
--   • chain_approval_satisfied() svarar TRUE när ingen kedja är konfigurerad
--     (fail open — rätt för "tillåter den konfigurerade kedjan detta?").
--     Grinden här ställer motsatt fråga — "har en människa uttryckligen
--     överprövat?" — och måste därför fail:a closed. Den kräver en EXISTERANDE
--     approved-rad, inte frånvaron av en kedja.
--   • Konsekvens: på en instans utan kedja för 'vendor_invoice' finns ingen
--     övertrumfning alls, och en över-fakturerad faktura måste rättas
--     (kreditnota/tvist) i stället för att betalas. Det är avsiktligt.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Den härledda anspråksläsaren ─────────────────────────────────────────
-- Summan av alla LEVANDE fakturors subtotal på inköpsordern, valfritt utom en.
-- Rejected/cancelled räknas inte: de är återkallade anspråk.
-- Att en syskonfaktura ännu inte är matchad gör den INTE ofarlig — den är ett
-- anspråk i liggaren, och det var precis dubbletten. Konservativt håll.
CREATE OR REPLACE FUNCTION public.po_invoiced_value_cents(
  p_purchase_order_id uuid,
  p_exclude_invoice_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(vi.subtotal_cents), 0)::bigint
    FROM public.vendor_invoices vi
   WHERE vi.purchase_order_id = p_purchase_order_id
     AND (p_exclude_invoice_id IS NULL OR vi.id <> p_exclude_invoice_id)
     AND vi.status NOT IN ('rejected', 'cancelled');
$function$;

-- Ny SECURITY DEFINER-funktion ⇒ ren läsare utan sidoeffekt, men PUBLIC/anon
-- revokas från start enligt husregeln.
REVOKE EXECUTE ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) IS
  'Redan anspråkat fakturavärde på en inköpsorder (Odoos qty_invoiced, härlett ur fakturaliggaren i stället för lagrat, eftersom vendor_invoices saknar rader). Exkludera fakturan som matchas för att få vad ÖVRIGA redan tagit.';

-- ── 2. Räknaren: EN kalkyl, tre konsumenter ─────────────────────────────────
-- Matchningen SKRIVER resultatet, grinden LÄSER det färskt vid varje
-- betalningsförsök, och godkännandet läser om innan det beslutar. Alla tre
-- måste räkna likadant, alltså räknar bara en av dem. Ren läsare: den rör
-- ingen rad och kan därför anropas från en BEFORE UPDATE-trigger på samma rad.
CREATE OR REPLACE FUNCTION public.vendor_invoice_match_eval(
  p_invoice_id uuid,
  p_tolerance_pct numeric DEFAULT 2.0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_po_total bigint;
  v_po_number text;
  v_policy text;
  v_baseline bigint;
  v_claimed bigint;
  v_billable bigint;
  v_variance bigint;
  v_variance_pct numeric;
  v_match_status text;
  v_notes text;
  v_siblings text;
BEGIN
  SELECT * INTO v_inv FROM vendor_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;

  IF v_inv.purchase_order_id IS NULL THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id, 'match_status', 'no_po', 'variance_cents', 0,
      'variance_pct', 0, 'notes', 'Invoice not linked to any PO');
  END IF;

  SELECT po.total_cents, po.po_number INTO v_po_total, v_po_number
    FROM purchase_orders po WHERE po.id = v_inv.purchase_order_id;

  -- Bill control policy (Odoo): mot mottaget eller mot beställt.
  SELECT COALESCE(NULLIF(value->>'bill_control_policy', ''), 'received')
    INTO v_policy FROM site_settings WHERE key = 'purchasing';
  v_policy := COALESCE(v_policy, 'received');
  IF v_policy NOT IN ('received', 'ordered') THEN v_policy := 'received'; END IF;

  IF v_policy = 'ordered' THEN
    SELECT COALESCE(SUM(pol.quantity * pol.unit_price_cents), 0)::bigint
      INTO v_baseline
      FROM purchase_order_lines pol
     WHERE pol.purchase_order_id = v_inv.purchase_order_id;
  ELSE
    SELECT COALESCE(SUM(grl.quantity_received * pol.unit_price_cents), 0)::bigint
      INTO v_baseline
      FROM goods_receipt_lines grl
      JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
      JOIN purchase_order_lines pol ON pol.id = grl.po_line_id
     WHERE gr.purchase_order_id = v_inv.purchase_order_id;
  END IF;

  -- HÄR ÄR FYNDET: vad har ÖVRIGA fakturor redan tagit i anspråk?
  v_claimed  := public.po_invoiced_value_cents(v_inv.purchase_order_id, p_invoice_id);
  v_billable := v_baseline - v_claimed;

  SELECT string_agg(format('%s (%s, %s cents)', vi.invoice_number, vi.status, vi.subtotal_cents), ', '
                    ORDER BY vi.created_at)
    INTO v_siblings
    FROM vendor_invoices vi
   WHERE vi.purchase_order_id = v_inv.purchase_order_id
     AND vi.id <> p_invoice_id
     AND vi.status NOT IN ('rejected', 'cancelled');

  v_variance := v_inv.subtotal_cents - v_billable;
  v_variance_pct := CASE WHEN v_billable > 0
                         THEN abs(v_variance)::numeric / v_billable * 100
                         ELSE 100 END;

  IF v_baseline = 0 THEN
    v_match_status := 'no_receipt';
    v_notes := CASE WHEN v_policy = 'ordered'
                    THEN 'Purchase order has no ordered value to bill against'
                    ELSE 'No goods received yet against this PO' END;
  ELSIF v_billable <= 0 THEN
    -- Odoos "fully billed": ingenting kvar att fakturera. Detta är dubbletten.
    v_match_status := 'over_invoiced';
    v_notes := format(
      'Nothing left to invoice on %s: %s cents %s value is already claimed in full by %s. This invoice claims a further %s cents.',
      COALESCE(v_po_number, v_inv.purchase_order_id::text), v_baseline, v_policy,
      COALESCE(v_siblings, 'earlier invoices'), v_inv.subtotal_cents);
  ELSIF v_variance_pct <= p_tolerance_pct THEN
    v_match_status := 'matched';
    v_notes := format('Within %s%% tolerance (%s cents billable of %s cents %s, %s cents already invoiced)',
      round(p_tolerance_pct, 2), v_billable, v_baseline, v_policy, v_claimed);
  ELSIF v_variance > 0 THEN
    v_match_status := 'over_invoiced';
    v_notes := format('Invoice %s cents > %s cents still billable (%s cents %s value less %s cents already invoiced; %s%% variance)',
      v_inv.subtotal_cents, v_billable, v_baseline, v_policy, v_claimed, round(v_variance_pct, 2));
  ELSE
    v_match_status := 'under_invoiced';
    v_notes := format('Invoice %s cents < %s cents still billable (%s cents %s value less %s cents already invoiced; %s%% variance)',
      v_inv.subtotal_cents, v_billable, v_baseline, v_policy, v_claimed, round(v_variance_pct, 2));
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_number', v_inv.invoice_number,
    'purchase_order_id', v_inv.purchase_order_id,
    'po_number', v_po_number,
    'match_status', v_match_status,
    'variance_cents', v_variance,
    'variance_pct', round(v_variance_pct, 2),
    -- received_value_cents behålls som namn för befintliga läsare; det ÄR
    -- baslinjen, som under policy 'ordered' är beställt i stället för mottaget.
    'received_value_cents', v_baseline,
    'baseline_value_cents', v_baseline,
    'control_policy', v_policy,
    'already_invoiced_cents', v_claimed,
    'billable_value_cents', v_billable,
    'other_invoices', v_siblings,
    'po_total_cents', v_po_total,
    'notes', v_notes
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.vendor_invoice_match_eval(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vendor_invoice_match_eval(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.vendor_invoice_match_eval(uuid, numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.vendor_invoice_match_eval(uuid, numeric) IS
  'Trevägsmatchningens kalkyl, utan sidoeffekt. match_invoice_to_receipt skriver resultatet, guard_vendor_invoice_status_flow läser det färskt vid varje betalningsförsök.';

-- ── 3. Matchningen frågar vad som är KVAR, inte vad som kommit in ───────────
-- Samma signatur som förut (CREATE OR REPLACE, inga överlagringar, inga
-- borttappade grants). Returen är bakåtkompatibel och utökad.
CREATE OR REPLACE FUNCTION public.match_invoice_to_receipt(p_invoice_id uuid, p_tolerance_pct numeric DEFAULT 2.0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eval jsonb;
BEGIN
  v_eval := public.vendor_invoice_match_eval(p_invoice_id, p_tolerance_pct);

  UPDATE vendor_invoices
     SET match_status  = v_eval->>'match_status',
         variance_cents = COALESCE((v_eval->>'variance_cents')::bigint, 0),
         variance_notes = v_eval->>'notes',
         updated_at = now()
   WHERE id = p_invoice_id;

  PERFORM public.emit_platform_event(
    'invoice.matched',
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_eval->'purchase_order_id',
      'match_status', v_eval->>'match_status',
      'variance_cents', v_eval->'variance_cents',
      'variance_pct', v_eval->'variance_pct',
      'already_invoiced_cents', v_eval->'already_invoiced_cents',
      'billable_value_cents', v_eval->'billable_value_cents',
      'control_policy', v_eval->>'control_policy'
    ),
    'match_invoice_to_receipt'
  );

  RETURN jsonb_build_object('success', true) || v_eval;
END;
$function$;

-- ── 4. Tillståndsmaskinen OCH grinden, i samma vägoberoende vakt ────────────
CREATE OR REPLACE FUNCTION public.guard_vendor_invoice_status_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[];
  v_eval jsonb;
  v_override record;
  v_id_text text := NEW.id::text;
  v_label text := COALESCE(NEW.invoice_number, NEW.id::text);
  v_next text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- (a) Stegen. Ingen väg får hoppa över ett steg.
  v_allowed := CASE OLD.status
    WHEN 'received' THEN ARRAY['matched','variance','approved','rejected']
    WHEN 'matched'  THEN ARRAY['received','variance','approved','rejected']
    WHEN 'variance' THEN ARRAY['received','matched','approved','rejected']
    WHEN 'approved' THEN ARRAY['paid','matched','variance','rejected']
    WHEN 'rejected' THEN ARRAY['received','matched','variance']
    WHEN 'paid'     THEN ARRAY[]::text[]
    ELSE ARRAY['received','matched','variance','approved','rejected']
  END;

  IF NOT (NEW.status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Vendor invoice %: status % -> % is not a legal step. From % the only legal next states are: %. Paid is reachable only from approved — an invoice cannot be paid before it has been approved (auto_approve_vendor_invoice, or an approved request_entity_approval(''vendor_invoice'', ...) chain).',
      v_label, OLD.status, NEW.status, OLD.status,
      COALESCE(NULLIF(array_to_string(v_allowed, ', '), ''), 'none — paid is terminal')
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;

  -- (b) Betalningsgrinden. Odoos "Should Be Paid", räknat om ur underlaget i
  --     stället för läst ur ett fält någon kan skriva över.
  IF NEW.approved_at IS NULL THEN
    RAISE EXCEPTION 'Refusing to pay vendor invoice %: approved_at is null. Approval is the step that authorises the money, not the status label. Run auto_approve_vendor_invoice({"p_invoice_id":"%"}) — it approves only while the three-way match is clean.',
      v_label, v_id_text
      USING ERRCODE = 'P0001';
  END IF;

  -- Har en människa uttryckligen överprövat via husets attestkedja?
  SELECT ar.id, ar.resolved_by, ar.resolved_at
    INTO v_override
    FROM public.approval_requests ar
   WHERE ar.entity_type = 'vendor_invoice'
     AND ar.entity_id = v_id_text
     AND ar.status = 'approved'
   ORDER BY ar.resolved_at DESC NULLS LAST, ar.created_at DESC
   LIMIT 1;

  IF v_override.id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Färsk matchning, inte etiketten på raden: etiketten kan ha varit sann när
  -- den skrevs och falsk när den läses (en syskonfaktura kom emellan — det var
  -- precis vad som hände med SR-2026-0518-KOPIA).
  v_eval := public.vendor_invoice_match_eval(NEW.id);

  IF (v_eval->>'match_status') <> 'matched' THEN
    v_next := CASE v_eval->>'match_status'
      WHEN 'no_po' THEN
        'link the bill to its order (set vendor_invoices.purchase_order_id), then match_invoice_to_receipt'
      WHEN 'no_receipt' THEN
        'record the delivery first with receive_purchase_order, then match_invoice_to_receipt'
      WHEN 'over_invoiced' THEN
        'the bill claims more than is still billable on the order — correct the bill, register a vendor credit memo, or open a vendor_invoice_dispute'
      WHEN 'under_invoiced' THEN
        'the bill claims less than was received — bill the rest or correct the receipt, then re-match'
      ELSE
        'run match_invoice_to_receipt to see why'
    END;

    RAISE EXCEPTION 'Refusing to pay vendor invoice % (%): the three-way match is %, not matched. %. Do this next: %. To pay it anyway a human must overrule the gate on the record: request_entity_approval({"p_entity_type":"vendor_invoice","p_entity_id":"%","p_amount_cents":%,"p_reason":"<why>"}) then advance_approval_step — an approved chain request is the only thing that lets this payment through.',
      v_label, v_id_text, v_eval->>'match_status', v_eval->>'notes', v_next,
      v_id_text, COALESCE(NEW.total_cents, 0)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_vendor_invoice_status_flow ON public.vendor_invoices;
CREATE TRIGGER trg_guard_vendor_invoice_status_flow
  BEFORE UPDATE OF status ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_invoice_status_flow();

-- ── 5. Övertrumfningsrailen fungerar faktiskt ───────────────────────────────
-- trg_sync_vendor_invoice_approval jämförde vendor_invoices.id (uuid) med
-- approval_requests.entity_id (text) — utan cast, alltså
-- "operator does not exist: uuid = text" så fort någon godkände en
-- vendor_invoice via kedjan. Övertrumfningen har aldrig kunnat gå igenom.
-- Castas nu, med uuid-kontroll (entity_id är fri text för andra entiteter) och
-- utan att röra en redan betald faktura (den övergången är nu förbjuden och
-- skulle annars få advance_approval_step att kasta).
CREATE OR REPLACE FUNCTION public.sync_vendor_invoice_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.entity_type = 'vendor_invoice'
     AND NEW.status IN ('approved','rejected')
     AND OLD.status = 'pending'
     AND NEW.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    UPDATE public.vendor_invoices
       SET status = NEW.status::text,
           approved_by = COALESCE(NEW.resolved_by, approved_by),
           approved_at = COALESCE(NEW.resolved_at, now()),
           updated_at = now()
     WHERE id = NEW.entity_id::uuid
       AND status <> 'paid';
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 6. Godkännandet läser färsk matchning, inte en gammal etikett ───────────
-- auto_approve_vendor_invoice litade på match_status som den låg. På Nordbrygg
-- var etiketten sann när den skrevs och falsk när den lästes — dubbletten kom
-- efteråt. Verifiera, lita inte.
CREATE OR REPLACE FUNCTION public.auto_approve_vendor_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv FROM vendor_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;

  IF v_inv.approved_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true, 'invoice_id', p_invoice_id);
  END IF;

  -- Färsk matchning innan beslutet, när det finns en order att matcha mot.
  IF v_inv.purchase_order_id IS NOT NULL THEN
    PERFORM public.match_invoice_to_receipt(p_invoice_id);
    SELECT * INTO v_inv FROM vendor_invoices WHERE id = p_invoice_id;
  END IF;

  IF v_inv.match_status <> 'matched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'invoice_id', p_invoice_id,
      'match_status', v_inv.match_status,
      'variance_cents', v_inv.variance_cents,
      'reason', format('Invoice match_status=%s after a fresh three-way match, only "matched" can auto-approve. %s',
                       v_inv.match_status, COALESCE(v_inv.variance_notes, '')),
      'next', 'Correct the bill, register a vendor credit memo, or overrule deliberately with request_entity_approval(''vendor_invoice'', <invoice_id>, <total_cents>) followed by advance_approval_step.'
    );
  END IF;

  UPDATE vendor_invoices
     SET status = 'approved',
         approved_at = now(),
         approved_by = auth.uid(),
         updated_at = now()
   WHERE id = p_invoice_id;

  PERFORM public.emit_platform_event(
    'invoice.approved',
    jsonb_build_object('invoice_id', p_invoice_id, 'auto', true),
    'auto_approve_vendor_invoice'
  );

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'status', 'approved');
END;
$function$;
