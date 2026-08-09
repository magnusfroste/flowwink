-- ============================================================================
-- se-bas2024: two accounts carry the wrong NAME, and the name misled a fix.
--
-- 2611 was named "Utgående moms omvänd skattskyldighet". Per BAS 2024 that is
-- 2614's name; 2611 is "Utgående moms på försäljning inom Sverige, 25 %".
--
-- 3041 was named "Försäljning tjänster inom EU". Per BAS 2024, 3041 is
-- "Försäljning tjänster inom Sverige, 25 % moms" — the standard revenue account
-- for a domestic service business, and the canonical service posting is
-- 3041 / 2611 / 1510.
--
-- WHY THIS MATTERS MORE THAN COSMETICS. Earlier today I read these names,
-- concluded the account_roles mapping was wrong, and moved vat_output from 2611
-- to 2610. That was the mistake: the mapping was right, the label was not, and I
-- had reasoned from the derived artifact instead of the standard. Two things in
-- this repo already agreed with BAS and would have caught it:
--
--   * the role seed's own description said "Utgående moms 25%" while pointing at
--     2611 — intent and account agreed, only the chart's label dissented;
--   * the VAT box map in 20260726090000_reverse-charge-vat.sql puts 2611 in
--     Box 10 (ordinary output VAT) and 2614 in Boxes 30/31/32 (reverse charge).
--
-- So the engine was correct throughout. Only the human-readable name lied — and
-- a name that lies is not cosmetic when it is what an operator, an auditor, or
-- an agent reads to decide where something belongs.
--
-- The vat_output role is restored to 2611 here for any instance that received
-- the withdrawn 20260809140000 migration.
--
-- Deliberately NOT renamed: 2614/2624/2634 ("Beräknad utgående moms på
-- tjänsteförvärv från utlandet"). BAS calls them "omvänd skattskyldighet"; the
-- FlowWink names describe one use of the same account rather than contradicting
-- it, and the VAT box map is built on them. Narrow, not wrong — left alone.
-- 3010 ("Försäljning av tjänster" vs BAS "Försäljning inom Sverige") is also
-- left as-is: worth checking against the printed standard, not worth changing
-- on a secondary source.
--
-- Only rows still carrying the wrong text are touched, so an instance whose
-- operator renamed an account keeps their wording.
-- ============================================================================

UPDATE public.chart_of_accounts
   SET account_name = 'Utgående moms på försäljning inom Sverige, 25%', updated_at = now()
 WHERE locale = 'se-bas2024' AND account_code = '2611'
   AND account_name = 'Utgående moms omvänd skattskyldighet';

UPDATE public.chart_of_accounts
   SET account_name = 'Försäljning tjänster inom Sverige, 25% moms', updated_at = now()
 WHERE locale = 'se-bas2024' AND account_code = '3041'
   AND account_name = 'Försäljning tjänster inom EU';

-- Restore the role. 2610 is the summary account; 2611 is the specific one BAS
-- prescribes for a domestic sale, and it is what the box map expects.
UPDATE public.account_roles
   SET account_code = '2611',
       description  = 'Utgående moms på försäljning inom Sverige, 25%',
       updated_at   = now()
 WHERE locale = 'se-bas2024' AND role = 'vat_output' AND account_code = '2610';

DO $$
DECLARE v_role text; v_2611 text; v_3041 text;
BEGIN
  SELECT account_code INTO v_role FROM public.account_roles
    WHERE locale = 'se-bas2024' AND role = 'vat_output';
  SELECT account_name INTO v_2611 FROM public.chart_of_accounts
    WHERE locale = 'se-bas2024' AND account_code = '2611';
  SELECT account_name INTO v_3041 FROM public.chart_of_accounts
    WHERE locale = 'se-bas2024' AND account_code = '3041';
  RAISE NOTICE 'vat_output → % | 2611 = % | 3041 = %',
    COALESCE(v_role,'(saknas)'), COALESCE(v_2611,'(saknas)'), COALESCE(v_3041,'(saknas)');
END $$;