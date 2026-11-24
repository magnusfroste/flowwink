-- A customer is not staff (2026-11-24).
--
-- Since #1087 customers get accounts in the portal, and every policy that let
-- "any signed-in user" in now lets a customer in. Read on www's pg_policies:
--
--   • approval_requests — any signed-in user could INSERT a request and chose
--     its required_role and status himself; the requester could UPDATE his own
--     request; and resolve_approval let anyone holding required_role approve —
--     the requester included. sync_vendor_invoice_on_approval and
--     sync_quote_on_approval then approved the vendor invoice or the quote. A
--     customer, or a member of staff, could approve their own payment.
--   • webmeet_rooms — the public read of an open room handed out its password
--     column, to anon too. The meeting page and the admin list never read it;
--     the password is judged server-side.
--   • agent_skills — every enabled skill, instructions included, for any
--     signed-in user. The visitor chat reads the visitor-scoped ones.
--   • sales_intelligence_profiles — the business's own sales profile for any
--     signed-in user. Only the admin's sales pages read it.
--
-- Idempotent. The proof reads definitions and privileges only.

-- ── approval_requests ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated create approval requests" ON public.approval_requests;
CREATE POLICY "Authenticated create approval requests" ON public.approval_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- The row's rules. A browser (role anon/authenticated) asks for an approval and
-- may withdraw its own; it never decides one, picks who decides, or writes the
-- decision fields. resolve_approval / advance_approval_step (definer functions,
-- the owner's role) decide — and nobody approves his own request unless he is an
-- admin (a one-person business approves its own purchases).
CREATE OR REPLACE FUNCTION public.approval_requests_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule_role public.app_role;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.requested_by IS NOT NULL AND NEW.resolved_by = NEW.requested_by
     AND NOT public.has_role(NEW.resolved_by, 'admin') THEN
    RAISE EXCEPTION 'An approval needs someone other than the person who asked for it'
      USING ERRCODE = 'P0001';
  END IF;

  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.rule_id IS NOT NULL THEN
      SELECT required_role INTO v_rule_role FROM public.approval_rules WHERE id = NEW.rule_id;
    END IF;
    NEW.required_role := COALESCE(v_rule_role, 'admin');
    NEW.status := 'pending';
    NEW.requested_by := auth.uid();
    NEW.resolved_by := NULL;
    NEW.resolved_at := NULL;
    NEW.executed_at := NULL;
    NEW.chain_id := NULL;
    NEW.current_step := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE from a browser: only withdrawing one's own pending request.
  IF OLD.status = 'pending' AND NEW.status = 'cancelled'
     AND OLD.requested_by = auth.uid()
     AND NEW.required_role = OLD.required_role
     AND NEW.entity_type = OLD.entity_type AND NEW.entity_id = OLD.entity_id
     AND NEW.requested_by IS NOT DISTINCT FROM OLD.requested_by
     AND NEW.resolved_by IS NULL AND NEW.chain_id IS NOT DISTINCT FROM OLD.chain_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'An approval is decided with resolve_approval; a request can only be withdrawn here'
    USING ERRCODE = '42501';
END
$function$;

DROP TRIGGER IF EXISTS approval_requests_guard ON public.approval_requests;
CREATE TRIGGER approval_requests_guard
  BEFORE INSERT OR UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.approval_requests_guard();

-- ── webmeet_rooms: everything but the password ───────────────────────────────
REVOKE SELECT ON public.webmeet_rooms FROM anon, authenticated;
GRANT SELECT (id, slug, name, host_user_id, max_participants, is_locked, recording_enabled,
              settings, expires_at, ended_at, created_at, updated_at, waiting_room)
  ON public.webmeet_rooms TO anon, authenticated;

-- ── agent_skills: staff, and the skills meant for visitors ───────────────────
DROP POLICY IF EXISTS "Authenticated can view enabled skills" ON public.agent_skills;
CREATE POLICY "Authenticated can view enabled skills" ON public.agent_skills
  FOR SELECT TO authenticated
  USING (enabled = true AND (public.is_staff(auth.uid()) OR scope IN ('external', 'both')));

-- ── sales_intelligence_profiles: the business's profile is staff's ──────────
DROP POLICY IF EXISTS "Authenticated can view company profiles" ON public.sales_intelligence_profiles;
CREATE POLICY "Authenticated can view company profiles" ON public.sales_intelligence_profiles
  FOR SELECT TO authenticated
  USING (type = 'company' AND public.is_staff(auth.uid()));

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.webmeet_rooms', 'password', 'SELECT')
     OR has_column_privilege('authenticated', 'public.webmeet_rooms', 'password', 'SELECT') THEN
    RAISE EXCEPTION 'the meeting password is still readable';
  END IF;
  IF NOT has_column_privilege('anon', 'public.webmeet_rooms', 'slug', 'SELECT') THEN
    RAISE EXCEPTION 'the meeting page lost its room';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'approval_requests_guard'
                 AND tgrelid = 'public.approval_requests'::regclass) THEN
    RAISE EXCEPTION 'approval_requests has no guard';
  END IF;
END $$;
