-- En mätning är inget samtalsdrag.
--
-- FÖRLOPPET. Ägaren öppnade FlowChat och såg en varning ligga kvar längst ned,
-- som om chatten hängde:
--
--     ⚠️ 2 integrations failing: • local_llm: no url configured
--                               • resend: cannot verify from here …
--
-- Uppmätt på optic: en rad i `chat_messages` med `role: 'assistant'` och tom
-- `metadata`, skriven av automationen "Integration Health Check" (cron
-- `30 6 * * *`, skill `check_integrations`). Fyra ordagrant identiska kopior
-- sedan 2026-08-20 — och nio totalt sedan 2026-08-07, var och en i en EGEN
-- konversation med titeln "Integration health — ÅÅÅÅ-MM-DD", så FlowChats
-- historik fylldes med återvändsgränder.
--
-- Två fel, och det andra är det djupa:
--   1. Ett övervakningsresultat maskerade sig som ett SAMTALSDRAG. Ingenting i
--      raden sade annat, så den läste som assistentens sista ord och ytan såg
--      ut att vänta på användaren.
--   2. Ett chattmeddelande är oföränderligt och permanent. Ett tillstånd är
--      rörligt och upphör. Lägger man det rörliga i det oföränderliga kan det
--      aldrig lösas — bara begravas. Därför låg nio rader kvar och ingen gick
--      att kvittera.
--
-- Och det gjorde larmet värdelöst: samma text fyra dagar i rad blir tapet.
--
-- ÅTGÄRDEN (kod: supabase/functions/_shared/handlers/integration-health-state.ts)
-- Svepet skriver inte längre i chatten. Det uppdaterar TILLSTÅNDET i
-- `site_settings.integration_health` — en rad som skriver över sig själv, läst
-- av Observability — och lägger BARA VID ÖVERGÅNG en kvitterbar notis i
-- `value->'notices'`. Tre övergångar: friskt→felande, ett NYTT fel, och
-- felande→friskt. "Fortfarande felande, tredje dagen" är ingen övergång och är
-- tyst.
--
-- Den här migrationen bär bara kvitteringen. Att en notis går att kvittera är
-- hela skillnaden mot ett chattmeddelande, och kvitteringen måste vara ATOMISK:
-- svepet skriver samma jsonb-rad. En läs–ändra–skriv från klienten skulle kunna
-- skriva över en mätning som hann emellan.
--
-- Ingen ny tabell. `site_settings` är plattformens nyckel/värde-lager och
-- nyckeln står medvetet UTANFÖR anon-tillåtlistan i 20260823120000_c6d7e8f9 —
-- proberna namnger saknade secrets och interna URL:er. Personal läser via
-- `is_staff`-policyn, admin kvitterar via funktionen nedan.

CREATE OR REPLACE FUNCTION public.acknowledge_integration_health(
  p_notice_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value      jsonb;
  v_notices    jsonb;
  v_now        timestamptz := now();
  v_acked      integer;
BEGIN
  -- service_role-flykten: MCP-gatewayn och agent-execute kör med servicenyckeln,
  -- och då är auth.uid() NULL. Utan den här grenen får en agent "Only admins…".
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can acknowledge integration health notices';
  END IF;

  SELECT value INTO v_value
  FROM public.site_settings
  WHERE key = 'integration_health'
  FOR UPDATE;

  -- Ingen rad = ingen mätning har körts än. Att kvittera ingenting är inte ett
  -- fel; det är noll kvitteringar.
  IF v_value IS NULL THEN
    RETURN jsonb_build_object('acknowledged', 0, 'remaining', 0);
  END IF;

  SELECT count(*) INTO v_acked
  FROM jsonb_array_elements(coalesce(v_value->'notices', '[]'::jsonb)) AS n
  WHERE n->>'acknowledged_at' IS NULL
    AND (p_notice_id IS NULL OR n->>'id' = p_notice_id::text);

  SELECT coalesce(jsonb_agg(
           CASE
             WHEN n->>'acknowledged_at' IS NULL
              AND (p_notice_id IS NULL OR n->>'id' = p_notice_id::text)
             THEN jsonb_set(n, '{acknowledged_at}', to_jsonb(v_now))
             ELSE n
           END
           ORDER BY ord
         ), '[]'::jsonb)
    INTO v_notices
  FROM jsonb_array_elements(coalesce(v_value->'notices', '[]'::jsonb))
       WITH ORDINALITY AS t(n, ord);

  UPDATE public.site_settings
     SET value = jsonb_set(v_value, '{notices}', v_notices)
   WHERE key = 'integration_health';

  RETURN jsonb_build_object(
    'acknowledged', v_acked,
    'remaining', (
      SELECT count(*)
      FROM jsonb_array_elements(v_notices) AS n
      WHERE n->>'acknowledged_at' IS NULL
    )
  );
END;
$$;

COMMENT ON FUNCTION public.acknowledge_integration_health(uuid) IS
  'Kvitterar integrationshälsa-notiser i site_settings.integration_health. '
  'NULL = kvittera alla okvitterade. Atomisk (FOR UPDATE) eftersom det dagliga '
  'svepet skriver samma jsonb-rad. Att en notis GÅR att kvittera är hela '
  'skillnaden mot chattmeddelandet den ersätter — nio sådana låg kvar på optic '
  'utan någon väg att stänga dem.';

-- Intern vakt finns i kroppen; REVOKE FROM PUBLIC ändå så att grants är
-- uttryckliga och listbara — regeln från anon-svepet 20260822040000.
REVOKE ALL ON FUNCTION public.acknowledge_integration_health(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_integration_health(uuid)
  TO authenticated, service_role;
