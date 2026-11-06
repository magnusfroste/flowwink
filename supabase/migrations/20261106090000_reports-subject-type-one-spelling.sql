-- One spelling per subject kind, for the rows that predate it (2026-11-06).
-- publish_report has lower-cased subject_type since #891 ("Company" → company,
-- "fiscal year" → fiscal_year), and the company, deal and project pages read
-- the lower-case spelling. A report published before that — Hermes' account
-- review on optic, 2026-11-03 — kept "Company" and was shown nowhere. Idempotent.
UPDATE public.reports
   SET subject_type = lower(regexp_replace(btrim(subject_type), '[\s-]+', '_', 'g'))
 WHERE subject_type IS NOT NULL
   AND subject_type <> lower(regexp_replace(btrim(subject_type), '[\s-]+', '_', 'g'));
