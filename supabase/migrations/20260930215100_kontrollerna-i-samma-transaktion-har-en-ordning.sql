-- Two quality checks recorded inside one transaction (a fail, then the pass
-- after rework) both got the same now(), and the tiebreak was a random uuid:
-- "the last check" was a coin flip. Seen as a fresh-install flake — the proof
-- in 20260920060000 passed one run and failed the next on identical input.
-- clock_timestamp() advances per statement, so the later check is later.
-- Idempotent: SET DEFAULT is safe to re-run.
ALTER TABLE public.mo_quality_checks
  ALTER COLUMN checked_at SET DEFAULT clock_timestamp();
