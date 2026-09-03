-- Tråden kan stängas — och öppnas igen av kundens nästa mejl.
--
-- "Waiting on the customer" i FlowBox växte till en lista över allt vi
-- någonsin besvarat (17 rader på Resta första kvällen). En inkorg stänger
-- inte ärenden; det som är besvarat och tyst ska tystna. Två saker:
--   closed_at på tråden — en person kan markera den klar; ett INKOMMANDE
--   mejl nollar den (kunden öppnar den igen, aldrig vi).
--   Utkast räknas inte som meddelanden: touch_email_thread hoppar över
--   status='draft', så FlowPilots förslag inte flyttar last_message_at.
-- Policyn följer matrisen (email) i stället för en handskriven rollista
-- (den parallella ratten, rollsvepet).

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid;

CREATE OR REPLACE FUNCTION public.touch_email_thread() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  IF NEW.channel <> 'email' THEN RETURN NEW; END IF;
  v_key := normalize_thread_key(NEW.subject, NEW.thread_id);
  IF v_key IS NULL OR v_key = '' THEN RETURN NEW; END IF;
  NEW.thread_id := v_key;
  -- A draft is a proposal on the thread, not a message in it.
  IF NEW.status = 'draft' THEN
    INSERT INTO public.email_threads (thread_key, subject, last_message_at, message_count, related_entity_type, related_entity_id)
      VALUES (v_key, NEW.subject, coalesce(NEW.sent_at, now()), 0, NEW.related_entity_type, NEW.related_entity_id)
      ON CONFLICT (thread_key) DO NOTHING;
    RETURN NEW;
  END IF;
  INSERT INTO public.email_threads (thread_key, subject, last_message_at, message_count, related_entity_type, related_entity_id)
    VALUES (v_key, NEW.subject, coalesce(NEW.sent_at, now()), 1, NEW.related_entity_type, NEW.related_entity_id)
    ON CONFLICT (thread_key) DO UPDATE SET
      last_message_at = greatest(email_threads.last_message_at, coalesce(NEW.sent_at, now())),
      message_count = email_threads.message_count + 1,
      -- The customer reopens a closed thread by writing; we never do.
      closed_at = CASE WHEN NEW.direction = 'inbound' THEN NULL ELSE email_threads.closed_at END,
      closed_by = CASE WHEN NEW.direction = 'inbound' THEN NULL ELSE email_threads.closed_by END,
      updated_at = now();
  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "email_threads staff" ON public.email_threads;
CREATE POLICY "email_threads staff" ON public.email_threads
  FOR ALL TO authenticated
  USING (public.can_access_module(auth.uid(), 'email'))
  WITH CHECK (public.can_access_module(auth.uid(), 'email'));
