-- ============================================================================
-- se-bas2024: vat_output pointed at the reverse-charge account.
--
-- 20260721180000_account-roles.sql seeded:
--     ('se-bas2024', 'vat_output', '2611', 'Utgående moms 25%')
--
-- The description says ordinary output VAT — which is what the role means —
-- but 2611 is named "Utgående moms omvänd skattskyldighet" in this pack's own
-- chart of accounts. The account that IS named "Utgående moms 25%" is 2610.
-- A one-digit slip, and the seed's own description is the evidence for which
-- side of it was intended.
--
-- Two things make it certain rather than a judgement call:
--   1. Reverse charge already has its OWN roles in the same seed —
--      vat_output_reverse_25 → 2614, _12 → 2624, _6 → 2634. So `vat_output` is
--      by construction the ordinary one; it cannot also be reverse charge.
--   2. 2610 exists in the pack and is referenced by nothing.
--
-- Found on optic 2026-08-09 by booking one real subscription invoice through
-- the chain and reading the resulting entry: 12 500 kr of ordinary Swedish
-- service revenue credited 3 125 kr of VAT to an account meaning "the customer
-- accounts for the VAT, not us". On a VAT return that is a different box, and
-- against Fortnox it diverges from the very first invoice.
--
-- Only rows that still carry the wrong default are touched. An operator who
-- deliberately mapped vat_output somewhere else keeps their choice — the same
-- rule the role seed itself follows (defaults asserted, customisations survive).
-- ============================================================================

UPDATE public.account_roles
   SET account_code = '2610',
       description  = 'Utgående moms 25% (vanlig inhemsk försäljning)',
       updated_at   = now()
 WHERE locale = 'se-bas2024'
   AND role = 'vat_output'
   AND account_code = '2611';

-- Instances that never received the role seed at all get the corrected row.
INSERT INTO public.account_roles (locale, role, account_code, description)
VALUES ('se-bas2024', 'vat_output', '2610', 'Utgående moms 25% (vanlig inhemsk försäljning)')
ON CONFLICT (locale, role) DO NOTHING;

DO $$
DECLARE v_code text;
BEGIN
  SELECT account_code INTO v_code
    FROM public.account_roles WHERE locale = 'se-bas2024' AND role = 'vat_output';
  RAISE NOTICE 'se-bas2024 vat_output → %', COALESCE(v_code, '(saknas)');
END $$;
