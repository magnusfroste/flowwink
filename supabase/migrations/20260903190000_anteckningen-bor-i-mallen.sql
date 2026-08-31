-- Anteckningen bor i mallen.
--
-- Bokningsbekräftelsens mall gick genom mallrälsen (20260828170000) — men EN
-- rad språktext blev kvar i koden: {{notes_block}} prerendrade hela
-- anteckningsrutan i booking_confirmation.ts, engelsk etikett ("Your note:")
-- inklusive. En svensk mottagare med svensk mall fick en engelsk etikettrad
-- mitt i mejlet, och ingenting en operatör kunde redigera. Brott mot regeln i
-- docs/architecture/language.md §Email templates: ALL språktext bor i mallen,
-- koden prerendrar bara DATA.
--
-- Fixen är i render(): comms-send förstår nu {{#notes}}…{{/notes}} — sektionen
-- behålls när variabeln är ifylld och stryks när den är tom. Rutan OCH dess
-- etikett flyttar in i mallens HTML; koden skickar bara {{notes}} (data).
--
-- Bytet nedan är OUTPUT-IDENTISKT: sektionen renderar exakt den div koden
-- byggde, tecken för tecken. Därför får den röra även en operatörs omskrivna
-- mall — mottagaren ser ingen skillnad, men etiketten blir redigerbar. Svenska
-- rader (locale sv*) får svensk etikett direkt; det är ju hela ärendet.
--
-- Bakåtkompatibilitet: koden fortsätter skicka {{notes_block}} (legacy), så en
-- mall som återinför variabeln — eller en instans där den här migrationen
-- aldrig körs — renderar som förr. Framåtvägen är sektionen.

UPDATE public.email_templates
   SET html = replace(
         html,
         '{{notes_block}}',
         '{{#notes}}<div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:16px 0;"><p style="margin:0;"><strong>'
           || CASE WHEN locale LIKE 'sv%' THEN 'Din anteckning:' ELSE 'Your note:' END
           || '</strong> {{notes}}</p></div>{{/notes}}'
       ),
       variables = (coalesce(variables, '[]'::jsonb) - 'notes_block')
                   || CASE WHEN coalesce(variables, '[]'::jsonb) ? 'notes'
                           THEN '[]'::jsonb ELSE '["notes"]'::jsonb END,
       updated_at = now()
 WHERE name = 'booking_confirmation'
   AND html LIKE '%{{notes_block}}%';

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v jsonb; v_html text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Ingen rad får längre bära den kodrendrade rutan.
  IF EXISTS (
    SELECT 1 FROM public.email_templates
     WHERE name = 'booking_confirmation' AND html LIKE '%{{notes_block}}%'
  ) THEN
    RAISE EXCEPTION 'booking_confirmation: {{notes_block}} survived the move into the template';
  END IF;

  -- Mallen måste fortfarande gå att lösa ut och sektionen vara balanserad —
  -- men bara om en aktiv mall alls finns: en operatör som raderat eller
  -- inaktiverat sin (koden har ju en inbyggd fallback) ska inte fälla
  -- migrationskörningen.
  IF EXISTS (
    SELECT 1 FROM public.email_templates
     WHERE name = 'booking_confirmation' AND active
  ) THEN
    v := public.resolve_email_template('booking_confirmation', NULL);
    IF NOT coalesce((v ->> 'ok')::boolean, false) THEN
      RAISE EXCEPTION 'booking_confirmation: an active template exists but does not resolve';
    END IF;
    v_html := v ->> 'html';
    IF v_html LIKE '%{{#notes}}%' AND v_html NOT LIKE '%{{/notes}}%' THEN
      RAISE EXCEPTION 'booking_confirmation: unbalanced {{#notes}} section';
    END IF;
  END IF;

  RAISE NOTICE 'booking_confirmation: the note box (label included) lives in the template';
END $$;
