-- ============================================================================
-- Voiding an entry made every report wrong by the NEGATIVE of its amount.
--
-- `manage_journal_entry action=void` did two things: marked the original
-- status='voided' AND wrote a reversal with status='posted'. Every report in the
-- platform filters status='posted' — P&L, balance sheet, VAT return, the trial
-- balance, the role RPCs. So the original dropped out and the reversal counted
-- alone. Proven live on dev 2026-08-09: book 12 500 kr incl. 25 % VAT, void it,
-- and the VAT return reports boxes 05/10/49 as MINUS. A voided sale became a VAT
-- refund. No error anywhere — the reports simply agreed with each other on a
-- number that was the opposite of the truth.
--
-- Nothing on the fleet had ever been voided (0 rows on all six instances), so
-- this was latent rather than an incident. It would have fired the first time
-- someone corrected a real invoice.
--
-- ── The model, chosen deliberately ──────────────────────────────────────────
-- A booked verification is never unbooked. Swedish bookkeeping law is explicit
-- about it and it is also simply the honest thing: the entry HAPPENED, and what
-- follows is a correction, not an erasure. So:
--
--   * the original stays status='posted' and keeps counting
--   * the reversal is posted too, and cancels it
--   * the link is data, not status: reversed_by on the original, reverses on
--     the reversal
--
-- The reports need no change at all — two posted entries that mirror each other
-- sum to zero on their own. That is the tell that this model is the right one:
-- correctness stops depending on every reader remembering to exclude something.
--
-- A consequence worth stating, because it is a feature: the reversal carries
-- TODAY's date, so voiding a June entry in August leaves June's return as filed
-- and puts the correction in August's. You do not retroactively rewrite a period
-- you have already declared. That is what a correcting entry is for.
-- ============================================================================

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reverses    uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.journal_entries.reversed_by IS
  'The entry that reverses this one. Set on the ORIGINAL. The original stays status=posted and keeps counting in every report — its reversal cancels it. Never use status to hide a booked entry.';
COMMENT ON COLUMN public.journal_entries.reverses IS
  'The entry this one reverses. Set on the REVERSAL. Both are posted; together they net to zero.';

CREATE INDEX IF NOT EXISTS idx_journal_entries_reversed_by ON public.journal_entries (reversed_by) WHERE reversed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_reverses    ON public.journal_entries (reverses)    WHERE reverses    IS NOT NULL;

-- ── Repair anything already voided ─────────────────────────────────────────
-- Match a legacy pair by the two markers the old handler wrote: the reference
-- 'REV-<first 8 of the original id>' (or 'REV-<original reference>') and the
-- 'Reversal: <description>' prefix. Only an original that HAS such a reversal is
-- restored to posted — an entry voided with no reversal was genuinely removed
-- from the books by whoever did it, and inventing a correction for it would be
-- worse than leaving it out.
DO $$
DECLARE
  v_linked int := 0;
  v_orphan int := 0;
BEGIN
  WITH pairs AS (
    SELECT o.id AS original_id, r.id AS reversal_id
      FROM public.journal_entries o
      JOIN public.journal_entries r
        ON r.status = 'posted'
       AND r.reverses IS NULL
       AND r.description = 'Reversal: ' || o.description
       AND (r.reference_number = 'REV-' || left(o.id::text, 8)
         OR r.reference_number = 'REV-' || o.reference_number)
     WHERE o.status = 'voided'
       AND o.reversed_by IS NULL
  ), link_rev AS (
    UPDATE public.journal_entries r SET reverses = p.original_id
      FROM pairs p WHERE r.id = p.reversal_id
    RETURNING 1
  ), link_orig AS (
    UPDATE public.journal_entries o
       SET reversed_by = p.reversal_id, status = 'posted'
      FROM pairs p WHERE o.id = p.original_id
    RETURNING 1
  )
  SELECT count(*) INTO v_linked FROM link_orig;

  SELECT count(*) INTO v_orphan
    FROM public.journal_entries WHERE status = 'voided' AND reversed_by IS NULL;

  RAISE NOTICE 'Reversal model: % voided entry/entries restored to posted and linked to their reversal.', v_linked;
  IF v_orphan > 0 THEN
    RAISE WARNING 'Reversal model: % entry/entries are still status=voided with no matching reversal. They are excluded from every report. Review them by hand — either they were meant to be corrected (book a reversal) or they were a draft that should never have been posted.', v_orphan;
  END IF;
END $$;
