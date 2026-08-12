-- An extraction that is under way needs a name.
--
-- The sweeper (knowledge-indexer → sweepPendingExtractions) claims a document
-- before handing it to extract-pdf-text, so a 5-minute cron does not pay for
-- the same PDF on every tick while the first extraction is still running. The
-- claim writes 'processing' — a value documents_extraction_status_check did not
-- allow, so every claim failed and the sweeper reported `failed: 1` against a
-- document that stayed pending. Found the first time the sweeper ran live
-- (optic, 2026-08-12).
--
-- 'processing' is not a synonym for any existing value: 'pending' means nobody
-- has come for it (and the sweeper reclaims a 'processing' row after 15 minutes
-- precisely by putting it back there), and 'failed' means it was read and could
-- not be parsed.
--
-- Idempotent: the constraint is dropped and re-added, so a re-run and a fresh
-- install converge on the same definition.

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_extraction_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_extraction_status_check
  CHECK (extraction_status = ANY (ARRAY[
    'pending'::text,        -- uploaded, waiting for the sweeper
    'processing'::text,     -- claimed by a sweeper, extractor running
    'success'::text,
    'failed'::text,         -- read but unparseable; never retried on a loop
    'unsupported'::text,    -- seen, and this platform cannot read this type
    'not_applicable'::text
  ]));

-- A row stranded in 'processing' by a deploy that predates this constraint
-- cannot exist (the write was rejected), so there is nothing to backfill.
