-- ============================================================================
-- THE HASH THAT DID NOT COVER THE PRICE
-- ============================================================================
--
-- `quote_signatures.content_hash` has, since it was introduced in
-- 20260704100000_esign-hardening.sql, been documented as
--
--     'SHA-256 hex of the canonical quote content at signing time'
--
-- and the certificate page told the reader, in so many words, that a matching
-- hash proves the document has not been altered. Both statements were false for
-- a whole class of quotes.
--
-- quote-sign computed the digest over `quote.line_items ?? []`. Quote lines
-- live in TWO stores (the convergence on `quote_items` is in progress):
--   * `quote_items` — the agent/MCP path (`manage_quote`), quotes created from
--     a template or a deal (`src/lib/modules/quotes-module.ts`), and
--     `comms-send/quote_email.ts`;
--   * `quotes.line_items` (jsonb) — the admin panel and CreateQuoteDialog.
-- For every quote in the first group the jsonb column is EMPTY, so the stored
-- hash was — reproduced bit for bit — the digest of the quote document with an
-- empty line list. The prices the customer signed were not in the evidence.
-- Someone could rewrite every line and the hash would still match.
--
-- A legal artifact that lies is worse than a missing one. Fixed in
-- supabase/functions/quote-sign/index.ts: the lines are resolved with the same
-- rule `get_public_quote` renders the customer's page with (table wins, jsonb
-- is the fallback) and the signing REFUSES — 409, code quote_lines_unreadable /
-- quote_lines_missing — rather than hash an empty list it cannot account for.
--
-- ── WHY THIS MIGRATION EXISTS ───────────────────────────────────────────────
-- No data changes here, and deliberately so. EXISTING SIGNATURES ARE NOT
-- RECOMPUTED: their hashes are what they are, and rewriting them to cover lines
-- they never covered would be forging history. What changes is that the column
-- now carries an ALGORITHM STAMP inside the value:
--
--     new rows   'sha256-quote-v2:<64 hex>'   digest covers the line items
--     old rows   '<64 hex>'                   digest does NOT cover them
--
-- The stamp lives in the value rather than in a column of its own on purpose.
-- It describes the digest; stored apart the two can be separated — by a schema
-- squash, by a row copy, by an edge deploy landing before its migration — and a
-- v2 hash would then be read as a v1 one, or worse, the reverse. Same reasoning
-- as `sha256:` in OCI digests and `$2b$` in bcrypt. It also means the fix works
-- on an instance where this migration has not landed yet, which is exactly the
-- property the four-layer drift keeps punishing us for not having.
--
-- src/pages/SignatureCertificatePage.tsx reads the stamp and states, per
-- signature, what the hash covers — a bare-hex quote signature is shown for
-- what it is instead of being presented as proof of a price it never saw.
--
-- The column COMMENT is the schema-level documentation an operator or an agent
-- reads via \d+ or pg_description. Leaving it saying "canonical quote content"
-- would leave the lie in the one place nobody diffs.
--
-- `contract_signatures.content_hash` gets the same treatment for a different
-- reason: it is CORRECT (contract-sign has covered body AND appendices since
-- 20260808400000) but its comment never said so, and a reader comparing the two
-- tables would otherwise assume the quote's problem applies there too.
--
-- Verify (nothing to roll back — comments only):
--   SELECT col_description('public.quote_signatures'::regclass,
--          (SELECT attnum FROM pg_attribute
--            WHERE attrelid='public.quote_signatures'::regclass
--              AND attname='content_hash'));
--
-- Forward-dated past the ledger HEAD (20260823120000) — a managed instance's
-- migrate runner silently skips anything timestamped below its own HEAD.
-- ============================================================================

COMMENT ON COLUMN public.quote_signatures.content_hash IS
  'Tamper-evidence digest of the quote document at signing time, computed by the '
  'quote-sign edge function. Format is ''<alg>:<hex>''. alg=sha256-quote-v2: the '
  'digest covers quote number, title, intro/terms text, THE LINE ITEMS as the '
  'customer saw them (resolved quote_items-first, exactly like get_public_quote), '
  'totals, currency, validity and version. A BARE 64-char hex with no prefix is a '
  'pre-2026-08-23 signature whose digest was computed over quotes.line_items only '
  '— empty, and therefore line-blind, for every quote written through quote_items. '
  'Such rows are never recomputed (that would forge history); the certificate page '
  'reports their narrower coverage instead. See migration 20260823130000.';

COMMENT ON COLUMN public.contract_signatures.content_hash IS
  'Tamper-evidence digest of the agreement at signing time, computed by the '
  'contract-sign edge function as a bare SHA-256 hex. Covers title, counterparty, '
  'body_markdown, value, currency, version AND every contract_documents appendix '
  '(label, title, kind, body_markdown, file_url) in sort order — the appendices '
  'are part of what was signed and the signing page renders them inline.';
