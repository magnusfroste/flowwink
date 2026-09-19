-- Tillverkningens arbete når böckerna — och det som köps för en order hålls åt den.
--
-- Processbatteriet 2026-09-19 (plan-to-produce):
--
--   ARBETET     complete_mo lägger arbetskostnaden i lagervärdet (värdelagret blev
--               25 000 = 10 000 material + 15 000 arbete) men bokför ingenting:
--               material flyttas lager → lager och behöver ingen verifikation, men
--               arbetet HÖJDE lagrets värde. inventory_gl_reconciliation drev isär
--               med arbetskostnaden för varje färdig tillverkningsorder.
--   INKÖPET     Komponenter som köptes in för en bekräftad MO reserverades aldrig
--               åt den: confirm_mo på en redan bekräftad order kontrollerar bara
--               tillgång, så en annan order kunde ta varorna efter inleveransen.
--
-- Arbetet bokas Dt lager / Kr "förändring av lager av färdiga varor" (roll
-- production_absorption → 4950 i BAS; saknas rollen används lagerförändringens
-- konto). Aldrig ett kontonummer i koden.
--
-- Idempotent: ON CONFLICT DO NOTHING, CREATE OR REPLACE, markerade in place-ändringar.
INSERT INTO public.account_roles (locale, role, account_code, description) VALUES
  ('se-bas2024', 'production_absorption', '4950', 'Förändring av lager av färdiga varor — arbete och omkostnader som aktiveras i tillverkade varor')
ON CONFLICT (locale, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.book_mo_labor(p_mo_id uuid, p_labor_cents bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_je uuid; v_number text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Booking manufacturing labor requires the manufacturing module' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_labor_cents, 0) <= 0 THEN RETURN NULL; END IF;
  SELECT id INTO v_je FROM journal_entries WHERE source = 'mo_labor' AND reference_number = p_mo_id::text LIMIT 1;
  IF v_je IS NOT NULL THEN RETURN v_je; END IF;
  SELECT mo_number INTO v_number FROM manufacturing_orders WHERE id = p_mo_id;

  INSERT INTO journal_entries (entry_date, description, reference_number, source, status)
  VALUES (CURRENT_DATE, 'Labor capitalised in finished goods — ' || COALESCE(v_number, p_mo_id::text), p_mo_id::text, 'mo_labor', 'posted')
  RETURNING id INTO v_je;
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je, public.account_for('inventory'), p_labor_cents, 0, 'Lager — aktiverat arbete i tillverkade varor'),
         (v_je, public.account_for_or('production_absorption', 'cogs'), 0, p_labor_cents, 'Förändring av lager av färdiga varor');
  RETURN v_je;
END $fn$;

REVOKE ALL ON FUNCTION public.book_mo_labor(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_mo_labor(uuid, bigint) TO authenticated, service_role;

-- Reservera det en bekräftad MO ännu inte har reserverat — det som confirm_mo gör, men
-- anropbart i efterhand: när de inköpta komponenterna väl kommit in.
CREATE OR REPLACE FUNCTION public.mo_reserve_missing(p_mo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_mo record; v_c record; v_loc uuid; v_n integer := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing') OR public.can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Reserving for a manufacturing order requires the manufacturing or purchasing module' USING ERRCODE = '42501';
  END IF;
  SELECT id, mo_number, status INTO v_mo FROM public.manufacturing_orders WHERE id = p_mo_id;
  IF NOT FOUND OR v_mo.status NOT IN ('confirmed', 'in_progress') THEN RETURN 0; END IF;
  v_loc := public.default_internal_location();
  IF v_loc IS NULL THEN RETURN 0; END IF;
  FOR v_c IN
    SELECT mc.component_product_id, mc.qty_required
      FROM public.mo_components mc JOIN public.products p ON p.id = mc.component_product_id
     WHERE mc.mo_id = p_mo_id AND p.track_inventory = true
       AND NOT EXISTS (SELECT 1 FROM public.stock_reservations r
                        WHERE r.product_id = mc.component_product_id AND r.state = 'reserved'
                          AND r.reference_type = 'manufacturing_order' AND r.reference_id = p_mo_id::text)
  LOOP
    BEGIN
      PERFORM public.reserve_stock(v_c.component_product_id, v_loc, v_c.qty_required, 'manufacturing_order', p_mo_id::text, NULL, 'MO ' || v_mo.mo_number);
      UPDATE public.mo_components SET availability = 'ok' WHERE mo_id = p_mo_id AND component_product_id = v_c.component_product_id;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; -- still short: availability keeps saying so
    END;
  END LOOP;
  RETURN v_n;
END $fn$;

REVOKE ALL ON FUNCTION public.mo_reserve_missing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_reserve_missing(uuid) TO authenticated, service_role;

DO $patch$
DECLARE v_def text; v_sig text; MARK constant text := '20260919230000';
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig FROM pg_proc p WHERE p.proname = 'complete_mo' AND p.pronamespace = 'public'::regnamespace
   ORDER BY p.pronargs DESC LIMIT 1;
  v_def := pg_get_functiondef(v_sig::regprocedure);
  IF position('-- labor-to-ledger ' || MARK in v_def) = 0 THEN
    IF position('  RETURN jsonb_build_object(''success'', true, ''mo_id'', p_mo_id, ''qty_produced'', v_qty, ''components_consumed'', v_consumed,' in v_def) = 0 THEN
      RAISE EXCEPTION 'tillverkningens-arbete: anchor missing in complete_mo';
    END IF;
    v_def := replace(v_def, '  RETURN jsonb_build_object(''success'', true, ''mo_id'', p_mo_id, ''qty_produced'', v_qty, ''components_consumed'', v_consumed,',
      '  -- labor-to-ledger ' || MARK || E'\n' ||
      '  -- Får aldrig fälla färdigställandet: en instans utan vald kontoplan tillverkar ändå.' || E'\n' ||
      '  BEGIN' || E'\n' ||
      '    PERFORM public.book_mo_labor(p_mo_id, v_labor);' || E'\n' ||
      '  EXCEPTION WHEN OTHERS THEN' || E'\n' ||
      '    RAISE WARNING ''MO % completed but its labor (% cents) was not booked: % — run book_mo_labor once accounting is configured'', p_mo_id, v_labor, SQLERRM;' || E'\n' ||
      '  END;' || E'\n' ||
      '  RETURN jsonb_build_object(''success'', true, ''mo_id'', p_mo_id, ''qty_produced'', v_qty, ''components_consumed'', v_consumed,');
    EXECUTE v_def;
  END IF;

  -- receive_purchase_order: det som köptes FÖR en tillverkningsorder hålls åt den.
  v_def := pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,uuid,date,text)'::regprocedure);
  IF position('-- reserve-for-the-mo ' || MARK in v_def) = 0 THEN
    IF position(E'  RETURN jsonb_build_object(\n    \'success\', true,\n    \'receipt_id\', v_receipt_id,' in v_def) = 0 THEN
      RAISE EXCEPTION 'tillverkningens-arbete: anchor missing in receive_purchase_order';
    END IF;
    v_def := replace(v_def, E'  RETURN jsonb_build_object(\n    \'success\', true,\n    \'receipt_id\', v_receipt_id,',
      '  -- reserve-for-the-mo ' || MARK || E'\n' ||
      '  IF v_po.source_type IN (''manufacturing'', ''manufacturing_order'') AND v_po.source_id IS NOT NULL THEN' || E'\n' ||
      '    BEGIN PERFORM public.mo_reserve_missing(v_po.source_id::uuid);' || E'\n' ||
      '    EXCEPTION WHEN OTHERS THEN RAISE WARNING ''receipt for PO % landed but reserving for MO % failed: %'', p_purchase_order_id, v_po.source_id, SQLERRM; END;' || E'\n' ||
      '  END IF;' || E'\n' ||
      E'  RETURN jsonb_build_object(\n    \'success\', true,\n    \'receipt_id\', v_receipt_id,');
    EXECUTE v_def;
  END IF;
END $patch$;

DO $proof$
DECLARE v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig FROM pg_proc p WHERE p.proname = 'complete_mo' AND p.pronamespace = 'public'::regnamespace ORDER BY p.pronargs DESC LIMIT 1;
  IF position('20260919230000' in pg_get_functiondef(v_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'proof: complete_mo does not carry the 20260919230000 change';
  END IF;
  IF position('20260919230000' in pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,uuid,date,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'proof: receive_purchase_order does not carry the 20260919230000 change';
  END IF;
  RAISE NOTICE 'tillverkningens-arbete: proof passed (behaviour is asserted by the plan-to-produce scenario)';
END $proof$;
