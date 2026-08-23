-- A send with no ledger of who got it.
--
-- newsletter/send.ts read its recipients with
--
--     .from('newsletter_subscribers').select('email, name').eq('status','confirmed')
--
-- and then stamped the newsletter `sent`. PostgREST caps an unbounded select at
-- 1000 rows without saying so, so a list of 1400 confirmed subscribers produced
-- 1000 deliveries and a status that claims the whole list was reached. Nothing
-- downstream could tell the difference: sent_count said 1000 and there was no
-- record anywhere of WHICH 1000.
--
-- Pagination alone does not fix this. The moment a send can stop halfway — a
-- worker timeout, a provider outage, an operator hitting the button twice — the
-- only safe retry is one that knows who already has the mail in their inbox.
-- An email is the one thing in the platform that cannot be un-done, so the
-- ledger is not an optimisation, it is the precondition for ever retrying.
--
-- The unique index IS the idempotency mechanism (cure 1: write through the
-- constraint, do not read to decide). The sender claims a recipient with
--
--     upsert({...}, { onConflict: 'newsletter_id,recipient_email',
--                     ignoreDuplicates: true }).select('id')
--
-- and an empty result means "someone already owns this address for this
-- newsletter" — skip it. No read can be truncated, and there is no window
-- between deciding and sending.
--
-- Deliberate asymmetry between the two non-terminal states:
--   * 'failed'  — the provider answered with an error. Nothing was delivered,
--                 so a retry MAY re-claim it (the sender deletes failed rows
--                 for the newsletter before it starts, server-side, no read).
--   * 'pending' — claimed, and then the run died before we learned the outcome.
--                 We do not know whether the mail went out. It stays claimed
--                 forever and is never retried automatically. Reaching one
--                 subscriber late is a nuisance; mailing them twice is not
--                 retractable, so the ambiguous case resolves toward silence.
--                 The row is visible to an operator who wants to decide.

CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id   uuid NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  -- pending = claimed, outcome unknown. sent = the provider accepted it.
  -- failed = the provider rejected it and nothing was delivered.
  status          text NOT NULL DEFAULT 'pending',
  error_message   text,
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  CONSTRAINT newsletter_deliveries_status_check
    CHECK (status IN ('pending', 'sent', 'failed'))
);

COMMENT ON TABLE public.newsletter_deliveries IS
  'One row per (newsletter, recipient) claimed by a send run. The unique index is the idempotency key: a resumed or repeated send re-claims nothing that is already pending or sent, so no subscriber is mailed twice.';

-- The idempotency key. Named for what it prevents, not for the table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_newsletter_deliveries_one_per_recipient
  ON public.newsletter_deliveries (newsletter_id, recipient_email);

-- Drives both the "who is still outstanding" question and the sent_count
-- recount at the end of a run.
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_newsletter_status
  ON public.newsletter_deliveries (newsletter_id, status);

ALTER TABLE public.newsletter_deliveries ENABLE ROW LEVEL SECURITY;

-- Reading this table is reading a subscriber list: same boundary as the
-- newsletter module itself, not a broader one.
DROP POLICY IF EXISTS "Newsletter module can read deliveries" ON public.newsletter_deliveries;
CREATE POLICY "Newsletter module can read deliveries"
  ON public.newsletter_deliveries FOR SELECT
  USING (public.can_access_module(auth.uid(), 'newsletter'));

DROP POLICY IF EXISTS "Service role full access on newsletter_deliveries" ON public.newsletter_deliveries;
CREATE POLICY "Service role full access on newsletter_deliveries"
  ON public.newsletter_deliveries FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Only the sender writes here, and the sender runs as service_role. An
-- authenticated admin may look, never edit: a hand-edited delivery ledger is a
-- licence to double-send.
REVOKE ALL ON public.newsletter_deliveries FROM PUBLIC;
GRANT SELECT ON public.newsletter_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_deliveries TO service_role;

-- ── 'partial' is a real outcome and needs a name ─────────────────────────────
--
-- The status CHECK allowed draft/scheduled/sending/sent/failed. A run that
-- reached 900 of 1400 had to pick one of those, and 'sent' is what it picked —
-- the stamp that made the truncation invisible. 'failed' would be the opposite
-- lie: 900 people did receive it. A send that stopped short gets its own value,
-- and it is retryable (the ledger makes the retry safe).
DO $status$
BEGIN
  ALTER TABLE public.newsletters DROP CONSTRAINT IF EXISTS newsletters_status_check;
  ALTER TABLE public.newsletters ADD CONSTRAINT newsletters_status_check
    CHECK (status = ANY (ARRAY['draft', 'scheduled', 'sending', 'sent', 'partial', 'failed']));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $status$;

COMMENT ON COLUMN public.newsletters.status IS
  'draft | scheduled | sending | sent | partial | failed. "partial" means the run ended with recipients still outstanding (provider failures, or a subscriber list that could not be read to the end) — re-running is safe, newsletter_deliveries stops anyone already reached from being mailed again.';

COMMENT ON COLUMN public.newsletters.sent_count IS
  'Deliveries the provider accepted for this newsletter, recounted from newsletter_deliveries at the end of every run — cumulative across retries, not the count of one pass.';
