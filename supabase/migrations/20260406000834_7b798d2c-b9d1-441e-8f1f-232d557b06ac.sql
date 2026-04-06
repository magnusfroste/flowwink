
-- ============================================================
-- Chart of Accounts (BAS 2024)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL,
  account_category text NOT NULL,
  normal_balance text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read chart of accounts"
  ON public.chart_of_accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage chart of accounts"
  ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_chart_of_accounts_updated_at
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- Journal Entries (header)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  reference_number text,
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'manual',
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read journal entries"
  ON public.journal_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage journal entries"
  ON public.journal_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_journal_entries_date ON public.journal_entries(entry_date);
CREATE INDEX idx_journal_entries_status ON public.journal_entries(status);

-- ============================================================
-- Journal Entry Lines (debit/credit rows)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL,
  debit_cents bigint NOT NULL DEFAULT 0,
  credit_cents bigint NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read journal entry lines"
  ON public.journal_entry_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage journal entry lines"
  ON public.journal_entry_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_journal_entry_lines_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX idx_journal_entry_lines_account ON public.journal_entry_lines(account_code);

-- ============================================================
-- Accounting Templates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounting_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  keywords text[] DEFAULT '{}',
  template_lines jsonb NOT NULL DEFAULT '[]',
  is_system boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read accounting templates"
  ON public.accounting_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage accounting templates"
  ON public.accounting_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_accounting_templates_keywords ON public.accounting_templates USING GIN(keywords);

CREATE TRIGGER update_accounting_templates_updated_at
  BEFORE UPDATE ON public.accounting_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- BAS 2024 Chart of Accounts Data
-- ============================================================
INSERT INTO public.chart_of_accounts (account_code, account_name, account_type, account_category, normal_balance) VALUES
-- TILLGÅNGAR (1000-1999)
('1010', 'Utvecklingsutgifter', 'asset', 'intangible_assets', 'debit'),
('1020', 'Koncessioner, patent, licenser', 'asset', 'intangible_assets', 'debit'),
('1030', 'Hyresrätter och liknande rättigheter', 'asset', 'intangible_assets', 'debit'),
('1040', 'Varumärken', 'asset', 'intangible_assets', 'debit'),
('1050', 'Goodwill', 'asset', 'intangible_assets', 'debit'),
('1110', 'Byggnader och mark', 'asset', 'tangible_assets', 'debit'),
('1120', 'Maskiner och andra tekniska anläggningar', 'asset', 'tangible_assets', 'debit'),
('1130', 'Inventarier, verktyg och installationer', 'asset', 'tangible_assets', 'debit'),
('1150', 'Fordon', 'asset', 'tangible_assets', 'debit'),
('1200', 'Inventarier', 'asset', 'tangible_assets', 'debit'),
('1310', 'Andelar i koncernföretag', 'asset', 'financial_assets', 'debit'),
('1350', 'Andra långfristiga värdepappersinnehav', 'asset', 'financial_assets', 'debit'),
('1410', 'Råvaror och förnödenheter', 'asset', 'inventory', 'debit'),
('1430', 'Färdiga varor och handelsvaror', 'asset', 'inventory', 'debit'),
('1510', 'Kundfordringar', 'asset', 'receivables', 'debit'),
('1520', 'Övriga fordringar', 'asset', 'receivables', 'debit'),
('1530', 'Fordran avseende skatter och avgifter', 'asset', 'receivables', 'debit'),
('1540', 'Förutbetalda kostnader och upplupna intäkter', 'asset', 'receivables', 'debit'),
('1580', 'Fordran moms', 'asset', 'receivables', 'debit'),
('1630', 'Avräkning för skatter och avgifter', 'asset', 'short_term_investments', 'debit'),
('1910', 'Kassa', 'asset', 'cash', 'debit'),
('1920', 'Plusgiro', 'asset', 'cash', 'debit'),
('1930', 'Checkkonto/Företagskonto', 'asset', 'cash', 'debit'),
('1940', 'Övriga banktillgodohavanden', 'asset', 'cash', 'debit'),
-- EGET KAPITAL (2000-2099)
('2010', 'Aktiekapital', 'equity', 'share_capital', 'credit'),
('2070', 'Uppskrivningsfond', 'equity', 'reserves', 'credit'),
('2072', 'Reservfond', 'equity', 'reserves', 'credit'),
('2080', 'Överkursfond', 'equity', 'reserves', 'credit'),
('2091', 'Balanserad vinst eller förlust', 'equity', 'retained_earnings', 'credit'),
('2099', 'Årets resultat', 'equity', 'retained_earnings', 'credit'),
-- SKULDER (2100-2999)
('2110', 'Avsättningar för pensioner', 'liability', 'provisions', 'credit'),
('2210', 'Banklån', 'liability', 'long_term_debt', 'credit'),
('2310', 'Konvertibla skuldebrev', 'liability', 'convertible_debt', 'credit'),
('2410', 'Kortfristiga banklån', 'liability', 'short_term_debt', 'credit'),
('2440', 'Leverantörsskulder', 'liability', 'payables', 'credit'),
('2460', 'Skatteskulder', 'liability', 'payables', 'credit'),
('2470', 'Personalens källskatt', 'liability', 'payables', 'credit'),
('2480', 'Övriga kortfristiga skulder', 'liability', 'payables', 'credit'),
('2490', 'Upplupna kostnader och förutbetalda intäkter', 'liability', 'payables', 'credit'),
('2510', 'Skatteskuld moms', 'liability', 'vat', 'credit'),
('2610', 'Utgående moms 25%', 'liability', 'vat', 'credit'),
('2620', 'Utgående moms 12%', 'liability', 'vat', 'credit'),
('2630', 'Utgående moms 6%', 'liability', 'vat', 'credit'),
('2640', 'Ingående moms', 'liability', 'vat', 'debit'),
('2650', 'Momsredovisning', 'liability', 'vat', 'credit'),
('2710', 'Personalskatt', 'liability', 'payroll_tax', 'credit'),
('2730', 'Arbetsgivaravgifter', 'liability', 'payroll_tax', 'credit'),
('2731', 'Avräkning lagstadgade sociala avgifter', 'liability', 'payroll_tax', 'credit'),
('2890', 'Upplupna semesterlöner', 'liability', 'payables', 'credit'),
('2891', 'Upplupna sociala avgifter', 'liability', 'payables', 'credit'),
('2920', 'Upplupna löner', 'liability', 'payables', 'credit'),
-- INTÄKTER (3000-3999)
('3000', 'Försäljning', 'income', 'sales', 'credit'),
('3001', 'Försäljning varor 25% moms', 'income', 'sales', 'credit'),
('3002', 'Försäljning varor 12% moms', 'income', 'sales', 'credit'),
('3003', 'Försäljning varor 6% moms', 'income', 'sales', 'credit'),
('3010', 'Försäljning av tjänster', 'income', 'services', 'credit'),
('3011', 'Försäljning tjänster 25% moms', 'income', 'services', 'credit'),
('3040', 'Hyresintäkter', 'income', 'rental', 'credit'),
('3050', 'Provisionsintäkter', 'income', 'commission', 'credit'),
('3060', 'Licensintäkter', 'income', 'license', 'credit'),
('3090', 'Övriga rörelseintäkter', 'income', 'other_operating', 'credit'),
('3530', 'Övriga ränteintäkter', 'income', 'interest', 'credit'),
('3740', 'Öres- och kronutjämning', 'income', 'rounding', 'credit'),
-- KOSTNADER (4000-8999)
('4000', 'Inköp av varor', 'expense', 'cost_of_goods', 'debit'),
('4010', 'Inköp av material', 'expense', 'cost_of_goods', 'debit'),
('4050', 'Frakter', 'expense', 'cost_of_goods', 'debit'),
('5010', 'Lokalhyra', 'expense', 'premises', 'debit'),
('5020', 'Elkostnad', 'expense', 'utilities', 'debit'),
('5090', 'Övriga lokalkostnader', 'expense', 'premises', 'debit'),
('5410', 'Förbrukningsinventarier', 'expense', 'office', 'debit'),
('5420', 'Programvaror', 'expense', 'office', 'debit'),
('5460', 'Förbrukningsmaterial', 'expense', 'office', 'debit'),
('5500', 'Reparation och underhåll', 'expense', 'maintenance', 'debit'),
('5610', 'Kontorsmaterial', 'expense', 'office', 'debit'),
('5800', 'Resekostnader', 'expense', 'travel', 'debit'),
('5810', 'Biljetter', 'expense', 'travel', 'debit'),
('5831', 'Kost och logi i Sverige', 'expense', 'travel', 'debit'),
('5910', 'Annonsering', 'expense', 'marketing', 'debit'),
('5930', 'Reklamtrycksaker', 'expense', 'marketing', 'debit'),
('6000', 'Övriga försäljningskostnader', 'expense', 'marketing', 'debit'),
('6070', 'Representation', 'expense', 'entertainment', 'debit'),
('6110', 'Kontorsmaterial', 'expense', 'office', 'debit'),
('6200', 'Telefon och internet', 'expense', 'communication', 'debit'),
('6210', 'Mobiltelefon', 'expense', 'communication', 'debit'),
('6230', 'Porto', 'expense', 'communication', 'debit'),
('6310', 'Företagsförsäkringar', 'expense', 'insurance', 'debit'),
('6530', 'Redovisningstjänster', 'expense', 'professional', 'debit'),
('6540', 'IT-tjänster', 'expense', 'professional', 'debit'),
('6550', 'Konsultarvoden', 'expense', 'professional', 'debit'),
('6570', 'Bankkostnader', 'expense', 'financial', 'debit'),
('6900', 'Övriga externa kostnader', 'expense', 'other_external', 'debit'),
('7010', 'Löner till kollektivanställda', 'expense', 'salaries', 'debit'),
('7020', 'Löner till tjänstemän', 'expense', 'salaries', 'debit'),
('7030', 'Löner VD', 'expense', 'salaries', 'debit'),
('7082', 'Styrelsearvoden', 'expense', 'fees', 'debit'),
('7090', 'Övriga ersättningar', 'expense', 'compensation', 'debit'),
('7210', 'Socialavgifter enligt lag', 'expense', 'social_costs', 'debit'),
('7220', 'Avgifter för tjänstepension', 'expense', 'pension', 'debit'),
('7230', 'Övriga sociala kostnader', 'expense', 'social_costs', 'debit'),
('7290', 'Övriga personalkostnader', 'expense', 'social_costs', 'debit'),
('7510', 'Avskrivning inventarier', 'expense', 'depreciation', 'debit'),
('7820', 'Avskrivning maskiner', 'expense', 'depreciation', 'debit'),
('7832', 'Avskrivning bilar', 'expense', 'depreciation', 'debit'),
('8010', 'Förlust vid avyttring', 'expense', 'asset_disposal', 'debit'),
('8310', 'Ränteintäkter', 'income', 'interest', 'credit'),
('8410', 'Räntekostnader', 'expense', 'interest', 'debit'),
('8422', 'Dröjsmålsräntor', 'expense', 'interest', 'debit'),
('8810', 'Koncernbidrag', 'expense', 'group_contributions', 'debit'),
('8830', 'Förändring av överavskrivningar', 'expense', 'tax_adjustments', 'debit'),
('8910', 'Skatt på årets resultat', 'expense', 'tax', 'debit'),
('8920', 'Förändring av uppskjuten skatt', 'expense', 'deferred_tax', 'debit');

-- ============================================================
-- Swedish Accounting Templates (for FlowPilot)
-- ============================================================
INSERT INTO public.accounting_templates (template_name, description, category, keywords, is_system, template_lines) VALUES
-- Payroll
('Löneutbetalning', 'Månadsvis löneutbetalning med skatt och arbetsgivaravgifter', 'payroll',
  ARRAY['lön', 'löner', 'löneutbetalning', 'månadslön', 'salary', 'payroll'],
  true,
  '[{"account_code":"7020","account_name":"Löner till tjänstemän","type":"debit","description":"Bruttolön"},{"account_code":"2710","account_name":"Personalskatt","type":"credit","description":"Avdragen preliminärskatt"},{"account_code":"1930","account_name":"Checkkonto/Företagskonto","type":"credit","description":"Nettolön utbetald"}]'::jsonb
),
('Arbetsgivaravgifter', 'Sociala avgifter på löner (31.42%)', 'payroll',
  ARRAY['arbetsgivaravgifter', 'sociala avgifter', 'arbetsgivaravgift', 'employer tax'],
  true,
  '[{"account_code":"7210","account_name":"Socialavgifter enligt lag","type":"debit","description":"Arbetsgivaravgifter"},{"account_code":"2730","account_name":"Arbetsgivaravgifter","type":"credit","description":"Skuld arbetsgivaravgifter"}]'::jsonb
),
-- Tax
('Preliminärskatt betalning', 'Månadsvis betalning av F-skatt / preliminärskatt', 'tax',
  ARRAY['preliminärskatt', 'f-skatt', 'skatt', 'skattebetalning', 'tax payment'],
  true,
  '[{"account_code":"2510","account_name":"Skatteskuld moms","type":"debit","description":"Inbetalning skatt"},{"account_code":"1930","account_name":"Checkkonto/Företagskonto","type":"credit","description":"Betalning från bank"}]'::jsonb
),
('Momsredovisning', 'Momsdeklaration — netta utgående mot ingående moms', 'tax',
  ARRAY['moms', 'momsredovisning', 'momsdeklaration', 'vat', 'mervärdeskatt'],
  true,
  '[{"account_code":"2610","account_name":"Utgående moms 25%","type":"debit","description":"Utgående moms"},{"account_code":"2640","account_name":"Ingående moms","type":"credit","description":"Ingående moms avdrag"},{"account_code":"2650","account_name":"Momsredovisning","type":"credit","description":"Nettoskuld moms"}]'::jsonb
),
-- Rent & Utilities
('Lokalhyra', 'Månadshyra för kontor eller lokal', 'premises',
  ARRAY['hyra', 'lokalhyra', 'kontor', 'lokal', 'rent', 'office rent'],
  true,
  '[{"account_code":"5010","account_name":"Lokalhyra","type":"debit","description":"Månadshyra"},{"account_code":"1930","account_name":"Checkkonto/Företagskonto","type":"credit","description":"Betalning"}]'::jsonb
),
('Elräkning', 'Elräkning med moms', 'premises',
  ARRAY['el', 'elektricitet', 'elräkning', 'energi', 'electricity'],
  true,
  '[{"account_code":"5020","account_name":"Elkostnad","type":"debit","description":"Elkostnad exkl moms"},{"account_code":"2640","account_name":"Ingående moms","type":"debit","description":"Moms 25%"},{"account_code":"2440","account_name":"Leverantörsskulder","type":"credit","description":"Leverantörsfaktura"}]'::jsonb
),
-- Sales
('Kundfaktura försäljning', 'Utställd kundfaktura med moms 25%', 'sales',
  ARRAY['kundfaktura', 'försäljning', 'intäkt', 'faktura', 'invoice', 'sales'],
  true,
  '[{"account_code":"1510","account_name":"Kundfordringar","type":"debit","description":"Fakturabelopp inkl moms"},{"account_code":"3011","account_name":"Försäljning tjänster 25% moms","type":"credit","description":"Intäkt exkl moms"},{"account_code":"2610","account_name":"Utgående moms 25%","type":"credit","description":"Utgående moms"}]'::jsonb
),
('Inbetalning kundfaktura', 'Betalning mottagen från kund', 'sales',
  ARRAY['inbetalning', 'kundbetalning', 'betalning', 'payment received'],
  true,
  '[{"account_code":"1930","account_name":"Checkkonto/Företagskonto","type":"debit","description":"Inbetalning"},{"account_code":"1510","account_name":"Kundfordringar","type":"credit","description":"Kundfordran reglerad"}]'::jsonb
),
-- Purchases
('Leverantörsfaktura', 'Bokföring av leverantörsfaktura med moms', 'purchases',
  ARRAY['leverantör', 'leverantörsfaktura', 'inköp', 'purchase', 'supplier invoice'],
  true,
  '[{"account_code":"4000","account_name":"Inköp av varor","type":"debit","description":"Inköpskostnad exkl moms"},{"account_code":"2640","account_name":"Ingående moms","type":"debit","description":"Moms 25%"},{"account_code":"2440","account_name":"Leverantörsskulder","type":"credit","description":"Leverantörsskuld"}]'::jsonb
),
('Betalning leverantör', 'Betalning av leverantörsfaktura', 'purchases',
  ARRAY['leverantörsbetalning', 'betalning leverantör', 'supplier payment'],
  true,
  '[{"account_code":"2440","account_name":"Leverantörsskulder","type":"debit","description":"Leverantörsskuld reglerad"},{"account_code":"1930","account_name":"Checkkonto/Företagskonto","type":"credit","description":"Betalning från bank"}]'::jsonb
),
-- Insurance & Professional
('Företagsförsäkring', 'Betalning av företagsförsäkring', 'insurance',
  ARRAY['försäkring', 'företagsförsäkring', 'insurance'],
  true,
  '[{"account_code":"6310","account_name":"Företagsförsäkringar","type":"debit","description":"Försäkringspremie"},{"account_code":"1930","account_name":"Checkkonto/Företagskonto","type":"credit","description":"Betalning"}]'::jsonb
),
('Konsultkostnad', 'Faktura från extern konsult', 'professional',
  ARRAY['konsult', 'konsultarvode', 'rådgivning', 'consultant'],
  true,
  '[{"account_code":"6550","account_name":"Konsultarvoden","type":"debit","description":"Konsultkostnad exkl moms"},{"account_code":"2640","account_name":"Ingående moms","type":"debit","description":"Moms 25%"},{"account_code":"2440","account_name":"Leverantörsskulder","type":"credit","description":"Leverantörsskuld"}]'::jsonb
),
-- Software & IT
('Programvarulicens', 'SaaS-prenumeration eller programvarulicens', 'it',
  ARRAY['programvara', 'licens', 'saas', 'software', 'prenumeration', 'subscription'],
  true,
  '[{"account_code":"5420","account_name":"Programvaror","type":"debit","description":"Licens/prenumeration exkl moms"},{"account_code":"2640","account_name":"Ingående moms","type":"debit","description":"Moms 25%"},{"account_code":"1930","account_name":"Checkkonto/Företagskonto","type":"credit","description":"Betalning"}]'::jsonb
),
-- Depreciation
('Avskrivning inventarier', 'Månatlig avskrivning på inventarier', 'depreciation',
  ARRAY['avskrivning', 'depreciation', 'inventarier'],
  true,
  '[{"account_code":"7510","account_name":"Avskrivning inventarier","type":"debit","description":"Avskrivning period"},{"account_code":"1200","account_name":"Inventarier","type":"credit","description":"Minskning tillgångsvärde"}]'::jsonb
),
-- Year-end
('Bokslut — årets resultat', 'Bokslutsdisposition — överför resultat till balanserad vinst', 'year_end',
  ARRAY['bokslut', 'årsredovisning', 'resultat', 'closing', 'year end'],
  true,
  '[{"account_code":"2099","account_name":"Årets resultat","type":"debit","description":"Stäng årets resultat"},{"account_code":"2091","account_name":"Balanserad vinst eller förlust","type":"credit","description":"Till balanserad vinst"}]'::jsonb
);
