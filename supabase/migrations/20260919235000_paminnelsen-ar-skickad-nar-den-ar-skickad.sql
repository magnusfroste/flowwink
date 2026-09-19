-- Påminnelsen är skickad när den är skickad.
--
-- Processbatteriet 2026-09-19 (quote-to-cash, subscribe-to-renew).
-- send_dunning_reminders skrev invoice_dunning_actions med action_type 'email' och
-- status 'sent' — och ingenting annat hände: ingen kod läste tabellen, inget mejl
-- lämnades till mejlrälsen. Påminnelsetrappan såg ut att fungera i varje vy
-- medan ingen kund någonsin fick en påminnelse.
--
-- En SQL-funktion kan inte skicka mejl. Den kan säga sanningen: påminnelsen är
-- FÖRFALLEN ('pending'). Skillen send_dunning_reminders lämnar den sedan till
-- mejlrälsen (comms-send invoice_email, reminder) och skriver utfallet —
-- 'sent' eller 'failed' med orsaken. Rader som redan står som 'sent' rörs inte:
-- vi vet inte vilka av dem som nådde någon, och att skicka om dem nu vore att
-- bomba kunder med gamla påminnelser.
--
-- In place, ankare som måste finnas. Idempotent.
DO $patch$
DECLARE v_def text; MARK constant text := '20260919235000';
BEGIN
  v_def := pg_get_functiondef('public.send_dunning_reminders(boolean)'::regprocedure);
  IF position('-- due-not-sent ' || MARK in v_def) = 0 THEN
    IF position('(v_inv.id, v_step, ''email'', ''sent'', v_days, v_inv.customer_email, now(), CURRENT_DATE,' in v_def) = 0 THEN
      RAISE EXCEPTION 'paminnelsen: anchor missing in send_dunning_reminders';
    END IF;
    v_def := replace(v_def, '(v_inv.id, v_step, ''email'', ''sent'', v_days, v_inv.customer_email, now(), CURRENT_DATE,',
      '-- due-not-sent ' || MARK || ': the reminder is DUE; the skill hands it to the mail rail and writes sent/failed' || E'\n' ||
      '        (v_inv.id, v_step, ''email'', ''pending'', v_days, v_inv.customer_email, now(), CURRENT_DATE,');
    EXECUTE v_def;
  END IF;
END $patch$;

DO $proof$
BEGIN
  IF position('20260919235000' in pg_get_functiondef('public.send_dunning_reminders(boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'proof: send_dunning_reminders does not carry the 20260919235000 change';
  END IF;
  IF position('''email'', ''sent''' in pg_get_functiondef('public.send_dunning_reminders(boolean)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'proof: send_dunning_reminders still records a reminder as sent before anything is sent';
  END IF;
  RAISE NOTICE 'paminnelsen: proof passed';
END $proof$;
