-- P1 Subscribe-to-Renew smoke (docs/parity/sprint-p1-subscribe-to-renew.md).
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/smoke/p1-subscribe.sql
-- Self-cleaning: runs in a rolled-back transaction. Expect: all PASS.

\set QUIET on
\pset pager off

BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}', false);

-- Manual sub: 2 × 10000/month, half the period remaining
INSERT INTO subscriptions (customer_email, customer_name, product_name, status,
  quantity, unit_amount_cents, currency, billing_interval, provider,
  current_period_start, current_period_end)
VALUES ('smoke-p1@test.dev','SMOKE P1','SMOKE Plan','active',
  2, 10000, 'sek', 'month', 'manual',
  now() - interval '15 days', now() + interval '15 days')
RETURNING id AS sid \gset

-- P1.1a upgrade: qty 2→4 → delta 20000/period, ~50% left → prorated ≈ 10000
SELECT (change_subscription(:'sid', 4, NULL, true, 0.25)) AS r1 \gset
SELECT CASE WHEN (:'r1'::jsonb->>'prorated_cents')::bigint BETWEEN 9000 AND 11000
       THEN 'PASS P1.1a upgrade prorated ~10000 (got '||(:'r1'::jsonb->>'prorated_cents')||')'
       ELSE 'FAIL P1.1a (got '||(:'r1'::jsonb->>'prorated_cents')||')' END;
SELECT CASE WHEN (:'r1'::jsonb->>'adjustment_invoice_id') IS NOT NULL
       THEN 'PASS P1.1b adjustment invoice created' ELSE 'FAIL P1.1b' END;
SELECT CASE WHEN quantity=4 THEN 'PASS P1.1c quantity updated' ELSE 'FAIL P1.1c' END
FROM subscriptions WHERE id=:'sid';
-- invoice is balanced draft with our line
SELECT CASE WHEN status='draft' AND subtotal_cents=(:'r1'::jsonb->>'prorated_cents')::int
       THEN 'PASS P1.1d invoice draft + amount matches' ELSE 'FAIL P1.1d' END
FROM invoices WHERE id=(:'r1'::jsonb->>'adjustment_invoice_id')::uuid;

-- P1.1e downgrade: qty 4→1 → credit recorded, NO invoice
SELECT (change_subscription(:'sid', 1, NULL, true, 0.25)) AS r2 \gset
SELECT CASE WHEN (:'r2'::jsonb->>'credit_cents')::bigint > 0
            AND (:'r2'::jsonb->>'adjustment_invoice_id') IS NULL
       THEN 'PASS P1.1e downgrade credit (no negative invoice)' ELSE 'FAIL P1.1e' END;
SELECT CASE WHEN metadata->'last_change'->>'prorated_cents' IS NOT NULL
       THEN 'PASS P1.1f change recorded on metadata' ELSE 'FAIL P1.1f' END
FROM subscriptions WHERE id=:'sid';

-- P1.1g guards: non-manual rejected
DO $$
DECLARE sid2 uuid;
BEGIN
  INSERT INTO subscriptions (customer_email, product_name, status, quantity,
    unit_amount_cents, currency, billing_interval, provider)
  VALUES ('smoke-p1b@test.dev','X','active',1,1000,'sek','month','stripe')
  RETURNING id INTO sid2;
  BEGIN
    PERFORM change_subscription(sid2, 2, NULL, true, 0.25);
    RAISE NOTICE 'FAIL P1.1g stripe sub allowed';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS P1.1g non-manual rejected';
  END;
END $$;

ROLLBACK;
SELECT 'SMOKE p1-subscribe done (rolled back)';
