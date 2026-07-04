-- Sign-and-pay (quote portal payment) — R3 parity round, 2026-07-04.
-- Odoo parity: the portal lets a customer confirm a quotation with signature AND
-- payment in one visit, optionally charging only a prepayment percentage
-- (sale.order.prepayment_percent). FlowWink mapping:
--   1) quotes.prepayment_pct (nullable 1-100): when set, the public "Pay now"
--      charges only that share of the auto-created invoice as a deposit; the
--      invoice stays partially paid via record_invoice_payment semantics.
--   2) quotes.paid_at: stamped by stripe-webhook when the quote's invoice
--      receives its (first) online payment — the "payment confirms the flow" mark.
--   3) get_quote_payment_status(p_token): token-gated payment state for the
--      public quote page (anon cannot read invoices directly).
--   4) get_quote_certificate extended with a payment object so the signature
--      certificate can show the Paid state.
-- Idempotent: safe to run multiple times.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS prepayment_pct numeric,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_prepayment_pct_range'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_prepayment_pct_range
      CHECK (prepayment_pct IS NULL OR (prepayment_pct >= 1 AND prepayment_pct <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.quotes.prepayment_pct IS
  'Optional prepayment percentage (1-100). When set, the public sign-and-pay flow charges only this share of the invoice total as a deposit (Odoo prepayment_percent parity). NULL = full amount.';
COMMENT ON COLUMN public.quotes.paid_at IS
  'When the quote''s auto-created invoice received its first online payment (stamped by stripe-webhook). For prepayment quotes this marks the deposit, not full settlement.';

-- Token-gated payment status for the public quote page. Anon has no SELECT on
-- invoices; this SECURITY DEFINER function exposes only the payment fields of
-- the invoice linked to an ACCEPTED quote identified by its accept_token.
-- pay_now_cents mirrors the charge amount quote-pay would create:
--   nothing paid yet + prepayment_pct set → the deposit share, else the remainder.
CREATE OR REPLACE FUNCTION public.get_quote_payment_status(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'invoice_number', i.invoice_number,
    'invoice_status', i.status,
    'total_cents', i.total_cents,
    'paid_amount_cents', COALESCE(i.paid_amount_cents, 0),
    'remaining_cents', GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0)),
    'pay_now_cents', CASE
      WHEN COALESCE(i.paid_amount_cents, 0) = 0 AND q.prepayment_pct IS NOT NULL
        THEN LEAST(
          GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0)),
          GREATEST(1, ROUND(i.total_cents * q.prepayment_pct / 100.0))::bigint
        )
      ELSE GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0))
    END,
    'currency', i.currency,
    'prepayment_pct', q.prepayment_pct,
    'quote_paid_at', q.paid_at
  )
  FROM public.quotes q
  JOIN public.invoices i ON i.id = q.invoice_id
  WHERE q.accept_token = p_token
    AND q.accept_token IS NOT NULL
    AND q.status::text = 'accepted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_quote_payment_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_payment_status(text) TO anon, authenticated;

-- Extend the quote certificate with payment evidence (Paid state on the
-- R2 signature certificate page). Same signature — CREATE OR REPLACE is safe.
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
    ),
    'payment', (
      SELECT jsonb_build_object(
        'invoice_number', i.invoice_number,
        'invoice_status', i.status,
        'total_cents', i.total_cents,
        'paid_amount_cents', COALESCE(i.paid_amount_cents, 0),
        'prepayment_pct', q.prepayment_pct,
        'quote_paid_at', q.paid_at
      )
      FROM public.invoices i
      WHERE i.id = q.invoice_id
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
