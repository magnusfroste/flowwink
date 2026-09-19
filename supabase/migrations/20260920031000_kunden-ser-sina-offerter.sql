-- Kunden ser sina offerter i portalen.
--
-- Paritetsrunda 3, quotes › customer_portal. En inloggad kund såg order, tjänster
-- och ärenden i /account — men inte offerterna. Länken fanns bara i mejlet; den
-- som tappat mejlet fick be om ett nytt.
--
-- En funktion i stället för en radpolicy: quotes bär interna kolumner (notes,
-- approval_request_id, owner_id, rabattunderlag) som en SELECT-policy skulle
-- öppna allihop. my_quotes() svarar bara med det kunden redan fått i sitt mejl
-- — inklusive accept_token, som skickades till exakt den adressen — och bara
-- offerter som faktiskt har skickats. Utkast och offerter under attest syns inte.

CREATE INDEX IF NOT EXISTS quotes_customer_email_lower_idx ON public.quotes (lower(customer_email));

CREATE OR REPLACE FUNCTION public.my_quotes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(NULLIF(btrim(COALESCE(auth.jwt() ->> 'email', '')), ''));
BEGIN
  IF auth.uid() IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Sign in to see your quotes' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true,
    'quotes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', q.id, 'quote_number', q.quote_number, 'title', q.title,
               'status', CASE WHEN q.status::text IN ('sent', 'viewed') AND q.valid_until IS NOT NULL AND q.valid_until < CURRENT_DATE
                              THEN 'expired' ELSE q.status::text END,
               'total_cents', q.total_cents, 'currency', q.currency,
               'valid_until', q.valid_until, 'sent_at', q.sent_at,
               'accepted_at', q.accepted_at, 'rejected_at', q.rejected_at, 'paid_at', q.paid_at,
               'accept_token', q.accept_token)
             ORDER BY COALESCE(q.sent_at, q.created_at) DESC)
        FROM public.quotes q
       WHERE lower(q.customer_email) = v_email
         AND q.status::text IN ('sent', 'viewed', 'accepted', 'rejected', 'expired')
         AND q.accept_token IS NOT NULL), '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.my_quotes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_quotes() TO authenticated;

DO $proof$
DECLARE v_r jsonb; v_uid uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.quotes (quote_number, title, customer_name, customer_email, status, total_cents, currency, accept_token, sent_at)
    VALUES ('PROOF-031000-A', 'Sent', 'Proof', 'Proof-031000@Example.test', 'sent', 100000, 'SEK', 'proof-token-031000-a', now()),
           ('PROOF-031000-B', 'Draft', 'Proof', 'proof-031000@example.test', 'draft', 100000, 'SEK', NULL, NULL),
           ('PROOF-031000-C', 'Someone else', 'Other', 'other-031000@example.test', 'sent', 100000, 'SEK', 'proof-token-031000-c', now());

    PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_uid, 'email', 'proof-031000@example.test')::text, true);
    v_r := public.my_quotes();
    IF jsonb_array_length(v_r->'quotes') <> 1 OR v_r->'quotes'->0->>'quote_number' <> 'PROOF-031000-A' THEN
      RAISE EXCEPTION 'proof failed: the customer should see exactly their one sent quote → %', v_r;
    END IF;

    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    BEGIN
      PERFORM public.my_quotes();
      RAISE EXCEPTION 'proof failed: an anonymous caller read quotes';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: a customer sees their sent quotes in any letter case, never drafts, never another customer''s; anonymous is refused.';
END
$proof$;
