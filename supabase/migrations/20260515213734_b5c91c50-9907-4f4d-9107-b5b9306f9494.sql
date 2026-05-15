
-- =========================================================
-- a2a_peers — restrict public SELECT
-- =========================================================
DROP POLICY IF EXISTS "System can read peers for token validation" ON public.a2a_peers;
CREATE POLICY "Admins can read peers" ON public.a2a_peers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- peer_invitations — restrict public SELECT
-- =========================================================
DROP POLICY IF EXISTS "System reads peer invitations" ON public.peer_invitations;
CREATE POLICY "Admins read peer invitations" ON public.peer_invitations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- federation_connections — restrict public SELECT
-- =========================================================
DROP POLICY IF EXISTS "System reads connections" ON public.federation_connections;
CREATE POLICY "Admins read federation connections" ON public.federation_connections
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- invoices — remove public token RLS, expose via RPC
-- =========================================================
DROP POLICY IF EXISTS "Public can view invoice via token" ON public.invoices;

CREATE OR REPLACE FUNCTION public.get_invoice_by_token(p_token text)
RETURNS SETOF public.invoices
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.invoices
  WHERE public_token IS NOT NULL
    AND public_token = p_token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_invoice_viewed_by_token(p_token text)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.invoices
  SET viewed_at = now()
  WHERE public_token = p_token AND viewed_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.mark_invoice_viewed_by_token(text) TO anon, authenticated;

-- =========================================================
-- orders — remove public UPDATE
-- =========================================================
DROP POLICY IF EXISTS "System can update orders" ON public.orders;
CREATE POLICY "Admins can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- quotes — remove public UPDATE
-- =========================================================
DROP POLICY IF EXISTS "System can update quotes" ON public.quotes;
CREATE POLICY "Admins can update quotes" ON public.quotes
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- agent_locks — admins only (service_role bypasses RLS)
-- =========================================================
DROP POLICY IF EXISTS "System can manage locks" ON public.agent_locks;
CREATE POLICY "Admins manage agent locks" ON public.agent_locks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- agent_workflows — admins only
-- =========================================================
DROP POLICY IF EXISTS "System can manage workflows" ON public.agent_workflows;
CREATE POLICY "Admins manage agent workflows" ON public.agent_workflows
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- agent_skill_packs — admins only
-- =========================================================
DROP POLICY IF EXISTS "System can manage skill packs" ON public.agent_skill_packs;
CREATE POLICY "Admins manage agent skill packs" ON public.agent_skill_packs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- agent_memory — admins only for writes
-- =========================================================
DROP POLICY IF EXISTS "System can insert agent memory" ON public.agent_memory;
DROP POLICY IF EXISTS "System can update agent memory" ON public.agent_memory;
CREATE POLICY "Admins insert agent memory" ON public.agent_memory
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update agent memory" ON public.agent_memory
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- agent_objectives — admins only for writes
-- =========================================================
DROP POLICY IF EXISTS "System can insert objectives" ON public.agent_objectives;
DROP POLICY IF EXISTS "System can update objectives" ON public.agent_objectives;
CREATE POLICY "Admins insert objectives" ON public.agent_objectives
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update objectives" ON public.agent_objectives
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- agent_objective_activities — admins only for writes
-- =========================================================
DROP POLICY IF EXISTS "System can insert objective activities" ON public.agent_objective_activities;
DROP POLICY IF EXISTS "System can update objective activities" ON public.agent_objective_activities;
CREATE POLICY "Admins insert objective activities" ON public.agent_objective_activities
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update objective activities" ON public.agent_objective_activities
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- a2a_activity — admins only for writes
-- =========================================================
DROP POLICY IF EXISTS "System can insert activity" ON public.a2a_activity;
DROP POLICY IF EXISTS "System can update activity" ON public.a2a_activity;
CREATE POLICY "Admins insert a2a activity" ON public.a2a_activity
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update a2a activity" ON public.a2a_activity
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- ad_campaigns / ad_creatives — admins only for writes
-- =========================================================
DROP POLICY IF EXISTS "System can insert ad campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "System can update ad campaigns" ON public.ad_campaigns;
CREATE POLICY "Admins insert ad campaigns" ON public.ad_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update ad campaigns" ON public.ad_campaigns
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "System can insert ad creatives" ON public.ad_creatives;
DROP POLICY IF EXISTS "System can update ad creatives" ON public.ad_creatives;
CREATE POLICY "Admins insert ad creatives" ON public.ad_creatives
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update ad creatives" ON public.ad_creatives
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- newsletter_subscribers — replace public UPDATE with token RPCs
-- =========================================================
DROP POLICY IF EXISTS "Public can update own subscription" ON public.newsletter_subscribers;

CREATE OR REPLACE FUNCTION public.confirm_newsletter_subscription(p_token text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.newsletter_subscribers
  SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now())
  WHERE confirmation_token = p_token AND p_token IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_newsletter_subscription(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.unsubscribe_newsletter(p_token text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.newsletter_subscribers
  SET status = 'unsubscribed', unsubscribed_at = now()
  WHERE (confirmation_token = p_token OR unsubscribe_token = p_token) AND p_token IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END $$;
GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter(text) TO anon, authenticated;

-- =========================================================
-- support_agents — drop public read, add lookup RPC
-- =========================================================
DROP POLICY IF EXISTS "Public can view agent user_id for chat display" ON public.support_agents;

CREATE OR REPLACE FUNCTION public.get_support_agent_user_id(p_agent_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id FROM public.support_agents WHERE id = p_agent_id LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_support_agent_user_id(uuid) TO anon, authenticated;
