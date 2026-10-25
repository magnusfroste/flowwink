-- The business's currency, clock and number separators — in the database.
--
-- docs/architecture/locale-and-formatting.md §3b. Three things the SQL got
-- wrong, all the same mistake (a literal where a fact about the business
-- belongs):
--
--  1. 51 currency columns defaulted to 'SEK', and ~30 functions coalesced a
--     missing currency to 'SEK' (approvals, budgets, gift cards, shipping,
--     consultant rates, AR ageing, quote approval, the demo seeds …). A
--     Norwegian business's new deal, product or approval was born in crowns.
--     Odoo's rule: a new row's currency is the company's
--     (default=lambda self: self.env.company.currency_id).
--  2. Contract and job-offer bodies printed amounts with to_char under the
--     server's lc_numeric (en_US): a Swedish contract said "1,234.50 SEK".
--  3. platform_timezone() read one key, unvalidated, with no country fallback:
--     a mistyped zone made every booking rule throw.
--
-- business_currency() / business_timezone() are the SQL twins of
-- resolveHome() in supabase/functions/_shared/locale/home.ts — same read
-- order, same country table (a guard test compares the two). The rewrite
-- below DISCOVERS the literals rather than listing them, so it also catches
-- the functions nobody remembered; re-running finds nothing and does nothing.

-- ── The country table (generated from COUNTRY_DEFAULTS + Intl separators) ──
CREATE OR REPLACE FUNCTION public.business_country_defaults(p_country text)
RETURNS TABLE (currency text, time_zone text, group_sep text, decimal_sep text)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT v.currency, v.time_zone, v.group_sep, v.decimal_sep
  FROM (VALUES
    ('SE', 'SEK', 'Europe/Stockholm', U&'\00A0', ','),
    ('NO', 'NOK', 'Europe/Oslo', U&'\00A0', ','),
    ('DK', 'DKK', 'Europe/Copenhagen', '.', ','),
    ('FI', 'EUR', 'Europe/Helsinki', U&'\00A0', ','),
    ('IS', 'ISK', 'Atlantic/Reykjavik', '.', ','),
    ('EE', 'EUR', 'Europe/Tallinn', U&'\00A0', ','),
    ('DE', 'EUR', 'Europe/Berlin', '.', ','),
    ('AT', 'EUR', 'Europe/Vienna', U&'\00A0', ','),
    ('CH', 'CHF', 'Europe/Zurich', U&'\2019', '.'),
    ('NL', 'EUR', 'Europe/Amsterdam', '.', ','),
    ('BE', 'EUR', 'Europe/Brussels', '.', ','),
    ('FR', 'EUR', 'Europe/Paris', U&'\202F', ','),
    ('ES', 'EUR', 'Europe/Madrid', '.', ','),
    ('IT', 'EUR', 'Europe/Rome', '.', ','),
    ('PL', 'PLN', 'Europe/Warsaw', U&'\00A0', ','),
    ('GB', 'GBP', 'Europe/London', ',', '.'),
    ('IE', 'EUR', 'Europe/Dublin', ',', '.'),
    ('US', 'USD', 'America/New_York', ',', '.'),
    ('CA', 'CAD', 'America/Toronto', ',', '.'),
    ('AU', 'AUD', 'Australia/Sydney', ',', '.')
  ) AS v(country, currency, time_zone, group_sep, decimal_sep)
  WHERE v.country = upper(trim(p_country));
$fn$;

CREATE OR REPLACE FUNCTION public.business_country()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT NULLIF(upper(trim(value ->> 'country')), '') FROM public.site_settings WHERE key = 'general' LIMIT 1;
$fn$;

-- platform_locale > accounting_preferences > the country > SEK, as resolveHome.
CREATE OR REPLACE FUNCTION public.business_currency()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v text;
BEGIN
  SELECT upper(trim(value ->> 'default_currency')) INTO v FROM public.site_settings WHERE key = 'platform_locale' LIMIT 1;
  IF v ~ '^[A-Z]{3}$' THEN RETURN v; END IF;
  SELECT upper(trim(value ->> 'currency')) INTO v FROM public.site_settings WHERE key = 'accounting_preferences' LIMIT 1;
  IF v ~ '^[A-Z]{3}$' THEN RETURN v; END IF;
  SELECT d.currency INTO v FROM public.business_country_defaults(public.business_country()) d;
  RETURN COALESCE(v, 'SEK');
END;
$fn$;

-- A zone Postgres does not know is skipped, never used (a typo used to throw).
CREATE OR REPLACE FUNCTION public.business_timezone()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v text;
BEGIN
  SELECT COALESCE(NULLIF(trim(value ->> 'default_timezone'), ''), NULLIF(trim(value ->> 'timezone'), ''))
    INTO v FROM public.site_settings WHERE key = 'platform_locale' LIMIT 1;
  IF v IS NOT NULL THEN
    BEGIN
      PERFORM now() AT TIME ZONE v;
      RETURN v;
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
  END IF;
  SELECT d.time_zone INTO v FROM public.business_country_defaults(public.business_country()) d;
  RETURN COALESCE(v, 'Europe/Stockholm');
END;
$fn$;

-- The booking rules' reader keeps its name and now reads the same answer.
CREATE OR REPLACE FUNCTION public.platform_timezone()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT public.business_timezone();
$fn$;

-- An amount (hundredths, *_cents) as the business writes numbers — no symbol.
-- Locale-independent: to_char's ',' and '.' are literals, then translated.
CREATE OR REPLACE FUNCTION public.format_business_amount(p_cents bigint, p_currency text DEFAULT NULL, p_digits integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_group text;
  v_dec text;
  v_digits integer;
BEGIN
  IF p_cents IS NULL THEN RETURN NULL; END IF;
  SELECT d.group_sep, d.decimal_sep INTO v_group, v_dec FROM public.business_country_defaults(public.business_country()) d;
  v_group := COALESCE(v_group, U&'\00A0');
  v_dec := COALESCE(v_dec, ',');
  v_digits := COALESCE(p_digits, CASE
    WHEN upper(COALESCE(p_currency, public.business_currency())) IN
      ('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF') THEN 0
    ELSE 2 END);
  RETURN translate(
    to_char(round(p_cents / 100.0, v_digits), CASE WHEN v_digits = 0 THEN 'FM999,999,999,999,990' ELSE 'FM999,999,999,999,990.00' END),
    ',.', v_group || v_dec);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.business_country_defaults(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_country() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_currency() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_timezone() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_timezone() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.format_business_amount(bigint, text, integer) TO anon, authenticated, service_role;

-- The old Swedish-only helpers keep their names (contract bodies call them)
-- and now write the business's separators.
CREATE OR REPLACE FUNCTION public._fmt_amount_sv(p_cents bigint)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT public.format_business_amount(p_cents);
$fn$;

CREATE OR REPLACE FUNCTION public._fmt_qty_sv(p_qty numeric)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT translate(to_char(p_qty, 'FM999,999,990.99'), ',.',
    COALESCE((SELECT d.group_sep || d.decimal_sep FROM public.business_country_defaults(public.business_country()) d), U&'\00A0' || ','));
$fn$;

-- ── 1. Column defaults: 'SEK' → the business's currency ──────────────────
-- payroll_country_profiles is a table OF countries; its rows carry their own.
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_default ~* '^''SEK'''
      AND c.table_name <> 'payroll_country_profiles'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT public.business_currency()', r.table_name, r.column_name);
  END LOOP;
END
$do$;

-- ── 2 + 1b. Function bodies and parameter defaults ───────────────────────
-- 'SEK' → public.business_currency(); a to_char money body → the business's
-- separators. An IMMUTABLE function that now reads settings becomes STABLE.
DO $do$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.provolatile
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname NOT IN ('business_currency', 'business_country_defaults', 'format_business_amount', 'business_timezone')
      AND (p.prosrc ~ '''SEK'''
        OR pg_get_function_arguments(p.oid) ~ '''SEK'''
        OR p.prosrc ~ 'to_char\([a-z_]+ / 100\.0, ''FM999G999G999(D00)?''\)')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '''SEK''(::text)?', 'public.business_currency()', 'g');
    v_new := regexp_replace(v_new, 'to_char\(([a-z_]+) / 100\.0, ''FM999G999G999D00''\)', 'public.format_business_amount(\1::bigint)', 'g');
    v_new := regexp_replace(v_new, 'to_char\(([a-z_]+) / 100\.0, ''FM999G999G999''\)', 'public.format_business_amount(\1::bigint, NULL, 0)', 'g');
    IF r.provolatile = 'i' THEN
      v_new := regexp_replace(v_new, '\mIMMUTABLE\M', 'STABLE');
    END IF;
    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
    END IF;
  END LOOP;
END
$do$;
