-- Cleanup after the 2026-08-10 dev verification of "posting activates a dormant
-- account". Removes the test verification and its reversal entirely so dev's
-- books carry no test data, drops one unused legacy chart row (4534) that is not
-- part of the se-bas2024 artifact, and removes the temporary verification API key.
DELETE FROM public.journal_entry_lines
 WHERE journal_entry_id IN ('f17a0580-04bc-43eb-8b81-f2fff1f50e6b','e77f0211-983e-418e-9cb3-f65494febed1');
DELETE FROM public.journal_entries
 WHERE id IN ('f17a0580-04bc-43eb-8b81-f2fff1f50e6b','e77f0211-983e-418e-9cb3-f65494febed1');

DELETE FROM public.chart_of_accounts c
 WHERE c.locale = 'se-bas2024' AND c.account_code = '4534'
   AND NOT EXISTS (SELECT 1 FROM public.journal_entry_lines l WHERE l.account_code = c.account_code);

DELETE FROM public.api_keys WHERE name = 'tmp-verify-1012';