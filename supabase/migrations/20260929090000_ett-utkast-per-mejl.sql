-- Ett utkast per inkommande mejl — sagt i databasen, inte bara i koden.
--
-- Simuleringen på Resta (25 mejl, 2026-09-04) gav dubbla utkast på flera
-- trådar: två körningar av draft_email_reply tre sekunder isär, båda förbi
-- kodens "finns redan?"-läsning innan någon hunnit skriva. Ett partiellt
-- unikt index gör den andra insättningen omöjlig; handlern svarar
-- "already drafted" på 23505.
--
-- Framdaterad 2026-09-29 (PR #473 skrevs 09-06): en migration under en
-- hanterad instans ledger-HEAD hoppas tyst över.
--
-- Instanser som redan HAR dubbletter (Resta) skulle få CREATE UNIQUE INDEX att
-- fallera — och en fallerad migration stoppar hela deployen. Så först: det
-- äldsta utkastet per (tråd, mejl) står kvar; senare dubbletter blir
-- 'discarded' (inkorgen döljer dem, samma status som "Discard draft") med
-- spår i metadata. Ingenting raderas. Idempotent: en andra körning hittar
-- inga dubbletter och indexet finns redan.

WITH ranked AS (
  SELECT id,
         first_value(id) OVER w AS keeper,
         row_number()    OVER w AS rn
    FROM public.outbound_communications
   WHERE status = 'draft'
     AND thread_id IS NOT NULL
     AND metadata->>'draft_of' IS NOT NULL
  WINDOW w AS (PARTITION BY thread_id, metadata->>'draft_of' ORDER BY created_at, id)
)
UPDATE public.outbound_communications o
   SET status = 'discarded',
       metadata = o.metadata || jsonb_build_object(
         'superseded_by', r.keeper::text,
         'discarded_reason', 'duplicate draft — one draft per inbound message (20260929090000)')
  FROM ranked r
 WHERE o.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_communications_one_draft_per_message
  ON public.outbound_communications (thread_id, (metadata->>'draft_of'))
  WHERE status = 'draft' AND metadata->>'draft_of' IS NOT NULL;

-- Beviset: en andra utkastrad för samma (tråd, mejl) vägras; en rad för ett
-- annat mejl, eller en redan använd/kastad rad, går in. Allt rullas tillbaka.
DO $proof$
DECLARE v_thread text := gen_random_uuid()::text; v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.outbound_communications (channel, direction, status, recipient, thread_id, metadata)
    VALUES ('email', 'outbound', 'draft', 'proof@example.invalid', v_thread, '{"draft_of":"m1"}');
    BEGIN
      INSERT INTO public.outbound_communications (channel, direction, status, recipient, thread_id, metadata)
      VALUES ('email', 'outbound', 'draft', 'proof@example.invalid', v_thread, '{"draft_of":"m1"}');
    EXCEPTION WHEN unique_violation THEN v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'proof failed: a second draft for the same message was accepted'; END IF;
    INSERT INTO public.outbound_communications (channel, direction, status, recipient, thread_id, metadata)
    VALUES ('email', 'outbound', 'draft', 'proof@example.invalid', v_thread, '{"draft_of":"m2"}'),
           ('email', 'outbound', 'discarded', 'proof@example.invalid', v_thread, '{"draft_of":"m1"}');
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: one draft per (thread, message); other messages and spent drafts are unaffected.';
END
$proof$;
