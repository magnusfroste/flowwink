-- Floor-wave-1 · F1 (docs/parity/sprint-floor-wave1.md): companies B2B fields.
-- Adds the Odoo res.partner-class fields the audit flagged: org/VAT numbers,
-- parent/subsidiary hierarchy, numeric employee count, revenue, credit limit,
-- account owner (sales rep) and tags — all additive (nullable/defaulted).
-- Plus find_duplicate_companies (read-only, trigram similarity on name/domain).
-- Idempotent.

ALTER TABLE "public"."companies"
  ADD COLUMN IF NOT EXISTS "org_number" "text",
  ADD COLUMN IF NOT EXISTS "vat_number" "text",
  ADD COLUMN IF NOT EXISTS "parent_company_id" "uuid",
  ADD COLUMN IF NOT EXISTS "employee_count" integer,
  ADD COLUMN IF NOT EXISTS "annual_revenue_cents" bigint,
  ADD COLUMN IF NOT EXISTS "credit_limit_cents" bigint,
  ADD COLUMN IF NOT EXISTS "account_owner" "uuid",
  ADD COLUMN IF NOT EXISTS "tags" "text"[] DEFAULT '{}'::text[];

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='companies_parent_company_id_fkey' AND table_name='companies') THEN
    ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_parent_company_id_fkey"
      FOREIGN KEY ("parent_company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;
  END IF;
  -- a company cannot be its own parent
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name='companies_not_own_parent') THEN
    ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_not_own_parent"
      CHECK ("parent_company_id" IS DISTINCT FROM "id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "companies_parent_idx" ON "public"."companies" ("parent_company_id")
  WHERE "parent_company_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "companies_org_number_idx" ON "public"."companies" ("org_number")
  WHERE "org_number" IS NOT NULL;

-- pg_trgm for similarity (already used by contracts search; safe if present)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION "public"."find_duplicate_companies"(
  "p_threshold" numeric DEFAULT 0.45,
  "p_limit" integer DEFAULT 25
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY (x.score) DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT a.id AS company_a, a.name AS name_a,
           b.id AS company_b, b.name AS name_b,
           round(GREATEST(
             similarity(lower(a.name), lower(b.name)),
             CASE WHEN a.domain IS NOT NULL AND a.domain = b.domain THEN 1.0 ELSE 0 END
           )::numeric, 2) AS score,
           (a.domain IS NOT NULL AND a.domain = b.domain) AS same_domain
    FROM companies a
    JOIN companies b ON a.id < b.id
    WHERE similarity(lower(a.name), lower(b.name)) >= p_threshold
       OR (a.domain IS NOT NULL AND a.domain = b.domain)
    ORDER BY 5 DESC
    LIMIT GREATEST(COALESCE(p_limit, 25), 1)
  ) x;
  RETURN jsonb_build_object('success', true, 'pairs', v_rows);
END $$;
ALTER FUNCTION "public"."find_duplicate_companies"(numeric, integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."find_duplicate_companies"(numeric, integer) TO "anon", "authenticated", "service_role";
