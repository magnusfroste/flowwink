-- The public contract page marks "viewed" through a token, not a table.
--
-- View sweep 2026-10-01, anonymous on /contract/:token: POST contract_signatures
-- → 401, PATCH contracts (viewed_at) → 401. markContractViewed() wrote both
-- straight from the browser with the anon key, which the 2026-08 hardening
-- (rightly) stopped — so "the customer opened the agreement" has been silently
-- lost on every public view since. Same repair the quote flow got: a token-
-- scoped SECURITY DEFINER RPC that stamps viewed_at once and records the view,
-- and returns nothing but the timestamp. Guarded by token_is_plausible like
-- every other *_by_token reader. Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.mark_contract_viewed_by_token(
  p_token text,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_viewed_at timestamptz;
BEGIN
  IF NOT public.token_is_plausible(p_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid token');
  END IF;

  SELECT id, viewed_at INTO v_id, v_viewed_at
    FROM public.contracts
   WHERE accept_token = p_token
     AND accept_token IS NOT NULL
     AND status = ANY (ARRAY['pending_signature'::contract_status, 'active'::contract_status])
   LIMIT 1;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  INSERT INTO public.contract_signatures (contract_id, action, user_agent)
  VALUES (v_id, 'view', left(COALESCE(p_user_agent, ''), 512));

  IF v_viewed_at IS NULL THEN
    UPDATE public.contracts SET viewed_at = now() WHERE id = v_id AND viewed_at IS NULL
      RETURNING viewed_at INTO v_viewed_at;
  END IF;

  RETURN jsonb_build_object('success', true, 'viewed_at', v_viewed_at);
END; $fn$;

REVOKE ALL ON FUNCTION public.mark_contract_viewed_by_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_contract_viewed_by_token(text, text) TO anon, authenticated, service_role;
