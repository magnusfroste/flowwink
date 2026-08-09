-- Account ROLES — the layer that lets the bookkeeping engine stop assuming Sweden.
--
-- Today 11 SECURITY DEFINER functions carry BAS 2024 account numbers as
-- parameter defaults: p_bank_account '1930', p_ar_account '1510',
-- p_revenue_account '3001', p_gain_account '3970', and 20 more. A German
-- instance with a German pack activated still posts to 1930 and 3970, which
-- mean nothing in SKR03. The engine does not branch on country — it ASSUMES
-- one, which is harder to spot than an `if (country = 'SE')`.
--
-- The locale pack already had the right idea in miniature: vat.rates[] carries
-- output_account/input_account, a role→account mapping. This generalises it.
--
-- Model, deliberately the WordPress one Magnus named: core calls a lookup, the
-- pack supplies the value. Callers may still pass an explicit account code —
-- that is a real need ("book this to 1930 specifically") — but the DEFAULT
-- stops being a literal and becomes a role resolved against the instance's
-- active pack.

CREATE TABLE IF NOT EXISTS public.account_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale text NOT NULL,
  role text NOT NULL,
  account_code text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (locale, role)
);

COMMENT ON TABLE public.account_roles IS
  'Role → account_code per accounting locale. The bookkeeping RPCs resolve roles through account_for() instead of hardcoding a country''s numbers. Seeded from the locale pack (src/lib/locale-packs/*), never edited by hand in a migration.';

ALTER TABLE public.account_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read account roles" ON public.account_roles;
CREATE POLICY "Authenticated users can read account roles"
  ON public.account_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage account roles" ON public.account_roles;
CREATE POLICY "Admins can manage account roles"
  ON public.account_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Resolve a role to an account code for THIS instance's active pack.
--
-- Fails loudly when a role has no mapping. The alternative — returning NULL and
-- letting the caller post to nowhere — is how you get a ledger that looks fine
-- and is wrong. A missing mapping is a pack-completeness bug and should read
-- like one.
CREATE OR REPLACE FUNCTION public.account_for(p_role text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _raw jsonb;
  _locale text;
  _code text;
BEGIN
  SELECT value INTO _raw FROM public.site_settings WHERE key = 'accounting_locale' LIMIT 1;
  _locale := COALESCE(
    NULLIF(_raw #>> '{}', ''),      -- value stored as a bare JSON string
    _raw ->> 'id',                  -- or as { "id": "…" }
    'se-bas2024'                    -- pack default; see DEFAULT_LOCALE_ID
  );

  SELECT account_code INTO _code
    FROM public.account_roles
   WHERE locale = _locale AND role = p_role;

  IF _code IS NULL THEN
    RAISE EXCEPTION
      'No account mapped to role "%" for accounting locale "%". Activate a locale pack that defines it, or add the mapping in account_roles.',
      p_role, _locale;
  END IF;

  RETURN _code;
END $function$;

GRANT EXECUTE ON FUNCTION public.account_for(text) TO authenticated, service_role;

-- Sweden / BAS 2024. This is the PROOF pack, not the platform — the same shape
-- a German or UK pack fills in. Seeded here so existing instances keep working
-- the moment the RPCs switch to role lookups; new locales arrive via the pack
-- artifact (supabase/seed/locale-packs.json → sync-skills.ts).
INSERT INTO public.account_roles (locale, role, account_code, description) VALUES
  ('se-bas2024', 'bank',                     '1930', 'Företagskonto / bank'),
  ('se-bas2024', 'accounts_receivable',      '1510', 'Kundfordringar'),
  ('se-bas2024', 'accounts_payable',         '2440', 'Leverantörsskulder'),
  ('se-bas2024', 'sales_revenue',            '3001', 'Försäljning'),
  -- 2611 per BAS 2024: "Utgående moms på försäljning inom Sverige, 25 %".
  -- Reverse charge is 2614 and has its own roles below.
  ('se-bas2024', 'vat_output',               '2611', 'Utgående moms på försäljning inom Sverige, 25%'),
  ('se-bas2024', 'vat_input',                '2641', 'Debiterad ingående moms'),
  ('se-bas2024', 'employee_liability',       '2890', 'Övriga kortfristiga skulder (utlägg)'),
  ('se-bas2024', 'expense_default',          '5410', 'Förbrukningsinventarier'),
  ('se-bas2024', 'fixed_asset',              '1210', 'Maskiner och andra tekniska anläggningar'),
  ('se-bas2024', 'accumulated_depreciation', '1219', 'Ackumulerade avskrivningar'),
  ('se-bas2024', 'depreciation_expense',     '7832', 'Avskrivningar inventarier'),
  ('se-bas2024', 'disposal_gain',            '3970', 'Vinst vid avyttring av anläggningstillgångar'),
  ('se-bas2024', 'disposal_loss',            '7970', 'Förlust vid avyttring av anläggningstillgångar'),
  ('se-bas2024', 'impairment',               '7720', 'Nedskrivningar av maskiner och inventarier'),
  ('se-bas2024', 'impairment_reversal',      '7788', 'Återföring av nedskrivningar'),
  ('se-bas2024', 'fx_gain',                  '3960', 'Valutakursvinster av rörelsekaraktär'),
  ('se-bas2024', 'fx_loss',                  '7960', 'Valutakursförluster av rörelsekaraktär'),
  ('se-bas2024', 'rounding_variance',        '3740', 'Öres- och kronutjämning'),
  -- Same BAS account as fx_loss, deliberately a separate role: a cash-count
  -- difference and a currency loss are different events, and another country's
  -- pack may well split them across two accounts.
  ('se-bas2024', 'cash_difference',          '7960', 'Kassadifferens vid kassaräkning')
ON CONFLICT (locale, role) DO NOTHING;
