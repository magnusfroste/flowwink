-- Realized FX smoke — book_invoice_paid v2 on foreign-currency invoices.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/smoke/realized-fx.sql
-- Self-cleaning (rolled-back transaction). Expect: all PASS.

\set QUIET on
\pset pager off

BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}', false);

-- Rates: EUR booked at 11.00, paid-date rate 11.50 → gain; second case 10.40 → loss
INSERT INTO currencies (code, name, is_base) VALUES ('SEK','Krona',true)
  ON CONFLICT (code) DO UPDATE SET is_base = true;
INSERT INTO currencies (code, name, is_base) VALUES ('EUR','Euro',false)
  ON CONFLICT (code) DO NOTHING;
INSERT INTO exchange_rates (base_currency, quote_currency, rate, rate_date, source)
VALUES ('EUR','SEK', 11.50, CURRENT_DATE, 'manual')
ON CONFLICT DO NOTHING;

-- GAIN case: 100 EUR (10000 cents) booked at 11.00, paid today at 11.50 → fx = 10000×0.5 = 5000
INSERT INTO invoices (invoice_number, customer_email, status, line_items,
  subtotal_cents, tax_rate, tax_cents, total_cents, paid_amount_cents, currency, exchange_rate, paid_at, due_date)
VALUES ('SMOKE-FX-GAIN', 'fx@test.dev', 'sent'::invoice_status, '[]'::jsonb,
  10000, 0, 0, 10000, 10000, 'EUR', 11.00, now(), CURRENT_DATE)
RETURNING id AS inv_gain \gset

SELECT (book_invoice_paid(:'inv_gain', '1930', '1510')) AS r1 \gset
SELECT CASE WHEN (:'r1'::jsonb->>'realized_fx_cents')::bigint = 5000
       THEN 'PASS FX.1 gain = 5000' ELSE 'FAIL FX.1 (got '||(:'r1'::jsonb->>'realized_fx_cents')||')' END;
-- JE balanced: Dt 1930 15000 = Cr 1510 10000 + Cr 3960 5000
SELECT CASE WHEN sum(debit_cents) = sum(credit_cents)
            AND sum(credit_cents) FILTER (WHERE account_code='3960') = 5000
            AND sum(debit_cents)  FILTER (WHERE account_code='1930') = 15000
       THEN 'PASS FX.2 gain JE balanced (3960=5000, bank=15000)' ELSE 'FAIL FX.2' END
FROM journal_entry_lines WHERE journal_entry_id = (:'r1'::jsonb->>'journal_entry_id')::uuid;

-- LOSS case: booked 11.00, paid at 10.40 → fx = 10000×(−0.6) = −6000
UPDATE exchange_rates SET rate = 10.40 WHERE base_currency='EUR' AND quote_currency='SEK' AND rate_date=CURRENT_DATE;
INSERT INTO invoices (invoice_number, customer_email, status, line_items,
  subtotal_cents, tax_rate, tax_cents, total_cents, paid_amount_cents, currency, exchange_rate, paid_at, due_date)
VALUES ('SMOKE-FX-LOSS', 'fx@test.dev', 'sent'::invoice_status, '[]'::jsonb,
  10000, 0, 0, 10000, 10000, 'EUR', 11.00, now(), CURRENT_DATE)
RETURNING id AS inv_loss \gset

SELECT (book_invoice_paid(:'inv_loss', '1930', '1510')) AS r2 \gset
SELECT CASE WHEN (:'r2'::jsonb->>'realized_fx_cents')::bigint = -6000
       THEN 'PASS FX.3 loss = -6000' ELSE 'FAIL FX.3 (got '||(:'r2'::jsonb->>'realized_fx_cents')||')' END;
SELECT CASE WHEN sum(debit_cents) = sum(credit_cents)
            AND sum(debit_cents) FILTER (WHERE account_code='7960') = 6000
            AND sum(debit_cents) FILTER (WHERE account_code='1930') = 4000
       THEN 'PASS FX.4 loss JE balanced (7960=6000, bank=4000)' ELSE 'FAIL FX.4' END
FROM journal_entry_lines WHERE journal_entry_id = (:'r2'::jsonb->>'journal_entry_id')::uuid;

-- BASE-CURRENCY case: SEK invoice → fx must be 0, plain 2-line JE
INSERT INTO invoices (invoice_number, customer_email, status, line_items,
  subtotal_cents, tax_rate, tax_cents, total_cents, paid_amount_cents, currency, exchange_rate, paid_at, due_date)
VALUES ('SMOKE-FX-BASE', 'fx@test.dev', 'sent'::invoice_status, '[]'::jsonb,
  10000, 0, 0, 10000, 10000, 'SEK', 1, now(), CURRENT_DATE)
RETURNING id AS inv_base \gset
SELECT (book_invoice_paid(:'inv_base', '1930', '1510')) AS r3 \gset
SELECT CASE WHEN (:'r3'::jsonb->>'realized_fx_cents')::bigint = 0
       THEN 'PASS FX.5 base currency → no FX line' ELSE 'FAIL FX.5' END;

-- idempotency: second call skips
SELECT CASE WHEN (book_invoice_paid(:'inv_gain', '1930', '1510')->>'skipped') IS NOT NULL
       THEN 'PASS FX.6 idempotent (already booked)' ELSE 'FAIL FX.6' END;

ROLLBACK;
SELECT 'SMOKE realized-fx done (rolled back)';
