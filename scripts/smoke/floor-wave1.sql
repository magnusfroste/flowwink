-- Floor-wave-1 smoke (docs/parity/sprint-floor-wave1.md) — repeatable Stage-3
-- verification. Run against any instance:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/smoke/floor-wave1.sql
-- Read/write but self-cleaning: every object it creates is deleted at the end.
-- Prefix: SMOKE-FW1. Expect: every line starts with PASS.

\set QUIET on
\pset pager off

BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}', false);

-- ── F1 companies ────────────────────────────────────────────────────────────
INSERT INTO companies (name, domain, org_number, vat_number, employee_count,
                       annual_revenue_cents, credit_limit_cents, tags)
VALUES ('SMOKE-FW1 Parent AB', 'smoke-fw1.se', '556677-8899', 'SE556677889901',
        42, 1200000000, 50000000, ARRAY['smoke','b2b'])
RETURNING id AS parent_id \gset

INSERT INTO companies (name, domain, parent_company_id)
VALUES ('SMOKE-FW1 Dotter AB', 'smoke-fw1.se', :'parent_id')
RETURNING id AS child_id \gset

SELECT CASE WHEN org_number='556677-8899' AND vat_number='SE556677889901'
            AND employee_count=42 AND credit_limit_cents=50000000
            AND tags @> ARRAY['b2b']
       THEN 'PASS F1.1 b2b fields stored' ELSE 'FAIL F1.1' END
FROM companies WHERE id = :'parent_id';

SELECT CASE WHEN parent_company_id = :'parent_id'
       THEN 'PASS F1.2 hierarchy FK' ELSE 'FAIL F1.2' END
FROM companies WHERE id = :'child_id';

-- self-parent must be rejected
DO $$ BEGIN
  BEGIN
    UPDATE companies SET parent_company_id = id WHERE name='SMOKE-FW1 Parent AB';
    RAISE NOTICE 'FAIL F1.3 self-parent allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS F1.3 self-parent rejected';
  END;
END $$;

-- duplicate detection: same domain → pair with score 1.0
SELECT CASE WHEN (find_duplicate_companies(0.45, 50)->'pairs') @>
            jsonb_build_array(jsonb_build_object('same_domain', true))
       THEN 'PASS F1.4 dup detection (same domain)' ELSE 'FAIL F1.4' END;

-- cleanup F1
DELETE FROM companies WHERE name LIKE 'SMOKE-FW1%';
SELECT CASE WHEN count(*)=0 THEN 'PASS F1.9 cleanup' ELSE 'FAIL F1.9 cleanup' END
FROM companies WHERE name LIKE 'SMOKE-FW1%';

ROLLBACK;  -- belt & braces: nothing this file does should persist
SELECT 'SMOKE floor-wave1 F1 done (transaction rolled back)';
