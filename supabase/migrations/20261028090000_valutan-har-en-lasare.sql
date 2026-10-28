-- The currency has one reader (2026-10-28).
--
-- A fresh install had no platform currency from 2026-10-26 (nightly fresh
-- install runs 40289704143 and 40472619205: procure-to-pay, plan-to-produce,
-- subscribe-to-renew and record-to-report all red). Two readers answered
-- "what is the business's currency":
--
--   * business_currency()          (20261025040000) — platform_locale →
--                                  accounting_preferences → the country → SEK.
--   * platform_default_currency()  (20260820220003) — platform_locale →
--                                  general.currency → the invoices.currency
--                                  COLUMN DEFAULT, read from the catalog with
--                                  regexp_match(..., '''([A-Za-z]{3})''').
--
-- 20261025040000 rewrote every 'SEK' column default to
-- public.business_currency(). From then on the catalog expression carried no
-- quoted three-letter literal, the regexp matched nothing, and on an instance
-- with no platform_locale and no general.currency — every fresh install —
-- platform_default_currency() returned NULL. Its callers still existed:
-- create_manual_subscription refused ("no platform currency configured"),
-- stamp_purchase_order_fx looked for a rate to <NULL>, and a scenario that
-- inserted platform_default_currency() into approval_rules.currency hit the
-- NOT NULL. Live instances were untouched: they carry the setting.
--
-- One fact, one reader (#430 is what two readers do). platform_default_currency()
-- keeps its name for the callers it has and IS business_currency() from here on.
-- Existing instances read the same value they did: business_currency() reads
-- platform_locale.default_currency first, exactly as this function did.
CREATE OR REPLACE FUNCTION public.platform_default_currency()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.business_currency();
$$;

COMMENT ON FUNCTION public.platform_default_currency() IS
  'The business currency — an alias of business_currency() (platform_locale.default_currency → accounting_preferences.currency → the country → SEK). Never NULL. New code reads business_currency().';

GRANT EXECUTE ON FUNCTION public.platform_default_currency() TO authenticated, anon, service_role;

-- Proof, on every install: the two names answer the same non-NULL currency.
-- A fresh install reaches this with no settings at all, which is exactly the
-- state that was NULL before.
DO $$
DECLARE
  v_platform text := public.platform_default_currency();
  v_business text := public.business_currency();
BEGIN
  IF v_business IS NULL OR v_business !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'business_currency() must always answer a currency, got %', v_business;
  END IF;
  IF v_platform IS DISTINCT FROM v_business THEN
    RAISE EXCEPTION 'platform_default_currency() (%) and business_currency() (%) disagree — one fact, one reader', v_platform, v_business;
  END IF;
END $$;
