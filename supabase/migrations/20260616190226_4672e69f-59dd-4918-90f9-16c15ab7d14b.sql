
-- 1. a2a_activity: tighten delete
DROP POLICY IF EXISTS "Admins can delete activity" ON public.a2a_activity;
CREATE POLICY "Admins can delete activity"
  ON public.a2a_activity FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Drop anon-write policies on internal/system tables (service_role bypasses RLS)
DROP POLICY IF EXISTS "System can insert agent activity" ON public.agent_activity;
DROP POLICY IF EXISTS "System can insert consultant profiles" ON public.consultant_profiles;
DROP POLICY IF EXISTS "System can insert briefings" ON public.flowpilot_briefings;
DROP POLICY IF EXISTS "System can insert lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "System can insert profiles" ON public.sales_intelligence_profiles;
DROP POLICY IF EXISTS "System can update profiles" ON public.sales_intelligence_profiles;
DROP POLICY IF EXISTS "System can create webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "System can insert quotes" ON public.quotes;

-- 3. contracts: restrict update/delete to owner-or-admin; drop broad token select
DROP POLICY IF EXISTS "Authenticated users can update contracts" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated users can delete contracts" ON public.contracts;
DROP POLICY IF EXISTS "Public can view contract by token" ON public.contracts;

CREATE POLICY "Owners or admins can update contracts"
  ON public.contracts FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete contracts"
  ON public.contracts FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. quotes: drop broad token select
DROP POLICY IF EXISTS "Public can view quote by token" ON public.quotes;

-- 5. contract_signatures: drop broad insert + broad read
DROP POLICY IF EXISTS "Public can insert via valid token" ON public.contract_signatures;
DROP POLICY IF EXISTS "Authenticated can view contract signatures" ON public.contract_signatures;

CREATE POLICY "Owners or admins can view signatures"
  ON public.contract_signatures FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_signatures.contract_id
        AND c.created_by = auth.uid()
    )
  );

-- 6. Token-gated RPCs for public quote/contract signing pages
CREATE OR REPLACE FUNCTION public.get_quote_by_token(p_token text)
RETURNS SETOF public.quotes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.quotes
  WHERE accept_token = p_token
    AND accept_token IS NOT NULL
    AND status::text = ANY (ARRAY['sent','viewed','accepted','rejected'])
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_quote_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_contract_by_token(p_token text)
RETURNS SETOF public.contracts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.contracts
  WHERE accept_token = p_token
    AND accept_token IS NOT NULL
    AND status = ANY (ARRAY['pending_signature'::contract_status, 'active'::contract_status])
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_contract_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contract_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.sign_contract_by_token(
  p_token text,
  p_signer_name text,
  p_signer_email text,
  p_signature_data text DEFAULT NULL,
  p_signer_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.contract_signatures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_signature public.contract_signatures%ROWTYPE;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE accept_token = p_token
    AND accept_token IS NOT NULL
    AND status = ANY (ARRAY['pending_signature'::contract_status, 'active'::contract_status])
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired token';
  END IF;

  INSERT INTO public.contract_signatures (
    contract_id, signer_name, signer_email, signature_data, signer_ip, user_agent
  ) VALUES (
    v_contract.id, p_signer_name, p_signer_email, p_signature_data, p_signer_ip, p_user_agent
  )
  RETURNING * INTO v_signature;

  RETURN v_signature;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_contract_by_token(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_contract_by_token(text, text, text, text, text, text) TO anon, authenticated;
