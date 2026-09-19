-- Fakturan före leveransen.
--
-- Processbatteriet 2026-09-19 (procure-to-pay). book_vendor_invoice lät
-- leverantörsfakturan kvitta mot den upplupning (GRNI) som fanns ÖPPEN i
-- fakturaögonblicket, och bokade resten som prisdifferens. Kommer fakturan före
-- sista leveransen — tio fakturerade, sex mottagna — blev de fyra omottagna en
-- "prisdifferens" om 40 000, och när de fyra sedan togs emot krediterades GRNI
-- 40 000 som ingen faktura längre kunde stänga. Sluttillstånd med varor och
-- faktura matchade och betalda: GRNI −40 000, prisdifferens +40 000.
--
-- En prisdifferens är skillnaden mot ORDERNS pris, inte mot vad som hunnit komma.
-- Fakturan kvittar därför mot det ordern ännu har rum för (orderns nettovärde
-- minus vad tidigare fakturor på ordern redan debiterat GRNI); GRNI står i debet
-- medan varorna är fakturerade men inte mottagna, och mottagningen nollar det.
-- Bara det som överstiger orderns värde är prisdifferens.
--
-- In place, med ankare som måste finnas. Idempotent.
DO $patch$
DECLARE v_def text; MARK constant text := '20260919220000';
BEGIN
  v_def := pg_get_functiondef('public.book_vendor_invoice(uuid,date)'::regprocedure);
  IF position('-- order-room ' || MARK in v_def) = 0 THEN
    IF position(E'    v_open := GREATEST(v_open, 0);\n    v_to_grni := LEAST(v_net, v_open);' in v_def) = 0 THEN
      RAISE EXCEPTION 'fakturan-fore-leveransen: anchor missing in book_vendor_invoice';
    END IF;
    v_def := replace(v_def, E'    v_open := GREATEST(v_open, 0);\n    v_to_grni := LEAST(v_net, v_open);',
      '    -- order-room ' || MARK || E'\n' ||
      '    -- Rummet är ORDERNS nettovärde minus vad tidigare fakturor på ordern redan debiterat GRNI.' || E'\n' ||
      '    SELECT GREATEST(COALESCE((SELECT po.subtotal_cents FROM public.purchase_orders po WHERE po.id = v_inv.purchase_order_id), 0)' || E'\n' ||
      '             - COALESCE((SELECT SUM(l2.debit_cents - l2.credit_cents) FROM public.journal_entry_lines l2' || E'\n' ||
      '                          JOIN public.journal_entries e2 ON e2.id = l2.journal_entry_id' || E'\n' ||
      '                         WHERE e2.status = ''posted'' AND e2.source = ''vendor_invoice'' AND l2.account_code = v_grni' || E'\n' ||
      '                           AND e2.reference_number IN (SELECT vi2.id::text FROM public.vendor_invoices vi2' || E'\n' ||
      '                                                        WHERE vi2.purchase_order_id = v_inv.purchase_order_id)), 0), 0)' || E'\n' ||
      '      INTO v_open;' || E'\n' ||
      '    v_to_grni := LEAST(v_net, v_open);');
    v_def := replace(v_def, 'v_other_label := ''Prisdifferens — fakturerat utöver mottaget'';', 'v_other_label := ''Prisdifferens — fakturerat utöver orderns värde'';');
    EXECUTE v_def;
  END IF;
END $patch$;

DO $proof$
BEGIN
  IF position('20260919220000' in pg_get_functiondef('public.book_vendor_invoice(uuid,date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'proof: book_vendor_invoice does not carry the 20260919220000 change';
  END IF;
  RAISE NOTICE 'fakturan-fore-leveransen: proof passed (behaviour is asserted by the procure-to-pay scenario)';
END $proof$;
