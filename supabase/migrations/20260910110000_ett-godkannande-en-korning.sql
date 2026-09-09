-- Ett godkännande, en körning — del 1 av 2 (enum + kolumn).
--
-- Incident nordbrygg 2026-09-08: create_purchase_order (trust_level='approve')
-- kördes TVÅ gånger på ETT godkännande. 11:56:13 körde den godkännande
-- klienten om anropet med _approved=true → PO-00018. 12:00:08 hittade
-- follow-through-svepet samma approval_requests-rad kvar i status='approved'
-- (ingen exekverare hade rört den) och körde om → PO-00019, identisk.
--
-- Roten: ett godkännande var ett TILLSTÅND (status='approved') som tre olika
-- exekverare (admin-UI, MCP-klient, follow-through) läste av oberoende av
-- varandra — inte en BILJETT som förbrukas. Den här och nästa migration gör
-- godkännandet förbrukningsbart exakt en gång:
--   * approval_status får värdet 'executed' (terminalt: beslutet är utfört)
--   * approval_requests.executed_at stämplar när
--   * claim_skill_approval() (nästa fil) är den enda dörren: UPDATE … WHERE
--     status='approved' RETURNING — atomärt, den andra anroparen får 0 rader
--
-- ALTER TYPE … ADD VALUE kan inte ANVÄNDAS i samma transaktion som lägger
-- till det (SQLSTATE 55P04) och migrationskörarna kör en fil per
-- transaktion — därför ligger enum-tillägget i sin egen fil, precis som
-- 20260710070000 → 20260710070001 för agent_activity_status 'expired'.
-- Idempotent: IF NOT EXISTS överallt.

ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'executed';

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS executed_at timestamptz;

COMMENT ON COLUMN public.approval_requests.executed_at IS
  'When the approved decision was CONSUMED by an executor (claim_skill_approval). status=executed + executed_at set = the action ran (or was handed to a handler) exactly once; a second executor is refused.';

CREATE INDEX IF NOT EXISTS idx_approval_requests_agent_skill_approved
  ON public.approval_requests ((context->>'skill_name'), resolved_at DESC)
  WHERE entity_type = 'agent_skill' AND status = 'approved';
