-- E-signature hardening (quote/contract signing) — R2 parity round, 2026-07-04.
-- 1) Draw-signature capture: signature_image (data-URL PNG) on both signature tables.
-- 2) Durable evidence: content_hash (SHA-256 of the document body at signing time).
-- 3) Token-gated certificate RPCs so the public "signature certificate" page can
--    render evidence (signer, image, hash, IP/UA, timestamp) without exposing the
--    signature tables to anon (RLS on those tables stays staff-only).
-- Idempotent: safe to run multiple times.

ALTER TABLE public.quote_signatures
  ADD COLUMN IF NOT EXISTS signature_image text,
  ADD COLUMN IF NOT EXISTS content_hash text;

ALTER TABLE public.contract_signatures
  ADD COLUMN IF NOT EXISTS signature_image text,
  ADD COLUMN IF NOT EXISTS content_hash text;

COMMENT ON COLUMN public.quote_signatures.signature_image IS
  'Optional drawn signature as a data:image/png base64 data-URL (captured on the public sign page).';
COMMENT ON COLUMN public.quote_signatures.content_hash IS
  'SHA-256 hex of the canonical quote content at signing time (computed by quote-sign edge function).';
COMMENT ON COLUMN public.contract_signatures.signature_image IS
  'Optional drawn signature as a data:image/png base64 data-URL (captured on the public sign page).';
COMMENT ON COLUMN public.contract_signatures.content_hash IS
  'SHA-256 hex of the canonical contract content at signing time (computed by contract-sign edge function).';

-- Certificate lookup: quote. Only resolves once the quote reached a final state
-- (accepted/rejected) — the certificate is evidence of a decision, not a preview.
CREATE OR REPLACE FUNCTION public.get_quote_certificate(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'kind', 'quote',
    'reference', q.quote_number,
    'title', q.title,
    'status', q.status,
    'version', q.version,
    'total_cents', q.total_cents,
    'currency', q.currency,
    'valid_until', q.valid_until,
    'decided_at', COALESCE(q.accepted_at, q.rejected_at),
    'signature', (
      SELECT jsonb_build_object(
        'action', s.action,
        'signer_name', s.signer_name,
        'signer_email', s.signer_email,
        'signature_data', s.signature_data,
        'signature_image', s.signature_image,
        'content_hash', s.content_hash,
        'ip_address', s.ip_address,
        'user_agent', s.user_agent,
        'signed_at', s.created_at
      )
      FROM public.quote_signatures s
      WHERE s.quote_id = q.id
        AND s.action IN ('accept', 'reject')
      ORDER BY s.created_at DESC
      LIMIT 1
    )
  )
  FROM public.quotes q
  WHERE q.accept_token = p_token
    AND q.accept_token IS NOT NULL
    AND q.status::text = ANY (ARRAY['accepted', 'rejected'])
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_quote_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_certificate(text) TO anon, authenticated;

-- Certificate lookup: contract. Final states are active (signed) and terminated
-- (declined or later terminated).
CREATE OR REPLACE FUNCTION public.get_contract_certificate(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'kind', 'contract',
    'reference', c.title,
    'title', c.title,
    'counterparty_name', c.counterparty_name,
    'status', c.status,
    'version', c.version,
    'value_cents', c.value_cents,
    'currency', c.currency,
    'decided_at', COALESCE(c.signed_at, c.terminated_at),
    'signature', (
      SELECT jsonb_build_object(
        'action', s.action,
        'signer_name', s.signer_name,
        'signer_email', s.signer_email,
        'signature_data', s.signature_data,
        'signature_image', s.signature_image,
        'content_hash', s.content_hash,
        'ip_address', s.ip_address,
        'user_agent', s.user_agent,
        'signed_at', s.created_at
      )
      FROM public.contract_signatures s
      WHERE s.contract_id = c.id
        AND s.action IN ('accept', 'reject')
      ORDER BY s.created_at DESC
      LIMIT 1
    )
  )
  FROM public.contracts c
  WHERE c.accept_token = p_token
    AND c.accept_token IS NOT NULL
    AND c.status = ANY (ARRAY['active'::contract_status, 'terminated'::contract_status])
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_contract_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contract_certificate(text) TO anon, authenticated;
