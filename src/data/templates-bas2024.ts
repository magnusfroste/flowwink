/**
 * Swedish BAS 2024 Accounting Templates
 * 
 * These are default system templates for common Swedish business transactions.
 * Templates use percentage-based lines (debit_pct / credit_pct) so FlowPilot
 * can apply them to any amount. The percentages are relative to the net amount.
 * 
 * Template format:
 * - template_lines use { account_code, account_name, debit_pct, credit_pct }
 * - Keywords help FlowPilot auto-match transactions to templates
 * - Categories: revenue, expense, payment, payroll, tax, asset, adjustment
 */

export const BAS_2024_TEMPLATES = [
  // ── Revenue ────────────────────────────────────────────────
  {
    template_name: 'Försäljning tjänster 25% moms',
    description: 'Fakturerad tjänsteförsäljning med 25% moms',
    category: 'revenue',
    keywords: ['faktura', 'försäljning', 'tjänst', 'konsult', 'arvode', 'invoice', 'sale', 'rådgivning'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 125, credit_pct: 0 },
      { account_code: '3010', account_name: 'Försäljning tjänster', debit_pct: 0, credit_pct: 100 },
      { account_code: '2610', account_name: 'Utgående moms 25%', debit_pct: 0, credit_pct: 25 },
    ],
  },
  {
    template_name: 'Försäljning varor 25% moms',
    description: 'Fakturerad varuförsäljning med 25% moms',
    category: 'revenue',
    keywords: ['vara', 'varor', 'produkt', 'gods', 'leverans', 'goods', 'product'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 125, credit_pct: 0 },
      { account_code: '3010', account_name: 'Försäljning varor', debit_pct: 0, credit_pct: 100 },
      { account_code: '2610', account_name: 'Utgående moms 25%', debit_pct: 0, credit_pct: 25 },
    ],
  },
  {
    template_name: 'Försäljning 12% moms (livsmedel)',
    description: 'Försäljning med reducerad moms 12%',
    category: 'revenue',
    keywords: ['livsmedel', 'mat', 'restaurang', 'catering', 'food', '12%'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 112, credit_pct: 0 },
      { account_code: '3010', account_name: 'Försäljning', debit_pct: 0, credit_pct: 100 },
      { account_code: '2620', account_name: 'Utgående moms 12%', debit_pct: 0, credit_pct: 12 },
    ],
  },
  {
    template_name: 'Försäljning 6% moms (böcker/kultur)',
    description: 'Försäljning med reducerad moms 6%',
    category: 'revenue',
    keywords: ['bok', 'böcker', 'tidning', 'kultur', 'biljett', 'evenemang', '6%'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 106, credit_pct: 0 },
      { account_code: '3010', account_name: 'Försäljning', debit_pct: 0, credit_pct: 100 },
      { account_code: '2630', account_name: 'Utgående moms 6%', debit_pct: 0, credit_pct: 6 },
    ],
  },
  {
    template_name: 'Försäljning inom EU (omvänd moms)',
    description: 'Tjänsteförsäljning till EU-företag, omvänd skattskyldighet',
    category: 'revenue',
    keywords: ['EU', 'export', 'omvänd', 'reverse charge', 'intra-community'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 100, credit_pct: 0 },
      { account_code: '3310', account_name: 'Försäljning tjänster EU', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Försäljning utanför EU',
    description: 'Export av varor eller tjänster utanför EU',
    category: 'revenue',
    keywords: ['export', 'utland', 'USA', 'UK', 'international', 'outside EU'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 100, credit_pct: 0 },
      { account_code: '3380', account_name: 'Försäljning export', debit_pct: 0, credit_pct: 100 },
    ],
  },

  // ── Payments ───────────────────────────────────────────────
  {
    template_name: 'Inbetalning kundfordran',
    description: 'Kund betalar faktura — bankkonto ökar, kundfordran minskar',
    category: 'payment',
    keywords: ['betalning', 'inbetalning', 'betald', 'payment', 'received', 'paid', 'inkommen'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 100, credit_pct: 0 },
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Utbetalning leverantörsskuld',
    description: 'Betalning av leverantörsfaktura',
    category: 'payment',
    keywords: ['utbetalning', 'betala leverantör', 'supplier payment', 'pay bill'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '2440', account_name: 'Leverantörsskulder', debit_pct: 100, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },

  // ── Expenses (supplier invoices) ───────────────────────────
  {
    template_name: 'Leverantörsfaktura med 25% moms',
    description: 'Inkommande faktura med avdragsgill moms',
    category: 'expense',
    keywords: ['leverantör', 'inköp', 'faktura', 'supplier', 'purchase', 'vendor'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '4010', account_name: 'Inköp material och varor', debit_pct: 100, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 25, credit_pct: 0 },
      { account_code: '2440', account_name: 'Leverantörsskulder', debit_pct: 0, credit_pct: 125 },
    ],
  },
  {
    template_name: 'Kontorsmaterial',
    description: 'Inköp av kontorsmaterial och förbrukningsvaror',
    category: 'expense',
    keywords: ['kontorsmaterial', 'papper', 'pennor', 'kontorsförnödenheter', 'office supplies'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6110', account_name: 'Kontorsmaterial', debit_pct: 100, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 25, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 125 },
    ],
  },
  {
    template_name: 'Telefon & internet',
    description: 'Månadskostnad för telefoni och internet',
    category: 'expense',
    keywords: ['telefon', 'mobil', 'internet', 'bredband', 'tele2', 'telia', 'telecom'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6210', account_name: 'Telefon och internet', debit_pct: 100, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 25, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 125 },
    ],
  },
  {
    template_name: 'Hyra kontor',
    description: 'Månadshyra för kontor eller lokal',
    category: 'expense',
    keywords: ['hyra', 'kontor', 'lokal', 'rent', 'office', 'kontorshyra'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '5010', account_name: 'Lokalhyra', debit_pct: 100, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'IT-tjänster & hosting',
    description: 'SaaS, hosting, domäner och IT-konsulter',
    category: 'expense',
    keywords: ['hosting', 'saas', 'domän', 'server', 'IT', 'software', 'subscription', 'licens'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6540', account_name: 'IT-tjänster', debit_pct: 80, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Bankkostnader',
    description: 'Bankavgifter, kortavgifter, transaktionsavgifter',
    category: 'expense',
    keywords: ['bank', 'avgift', 'stripe', 'kort', 'fee', 'transaction', 'kortavgift'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6570', account_name: 'Bankkostnader', debit_pct: 100, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Resekostnader',
    description: 'Tjänsteresa — transport, hotell, traktamente',
    category: 'expense',
    keywords: ['resa', 'flyg', 'tåg', 'hotell', 'traktamente', 'travel', 'trip', 'SJ', 'SAS'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '5810', account_name: 'Resekostnader', debit_pct: 80, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Representation',
    description: 'Kundmöte, lunch, representation (begränsad avdragsrätt)',
    category: 'expense',
    keywords: ['representation', 'lunch', 'middag', 'kundmöte', 'entertainment', 'fika'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6071', account_name: 'Representation avdragsgill', debit_pct: 80, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Bilkostnader (firmabil)',
    description: 'Drivmedel, försäkring, skatt för firmabil',
    category: 'expense',
    keywords: ['bil', 'drivmedel', 'bensin', 'diesel', 'bilförsäkring', 'fordon', 'car', 'vehicle', 'fuel'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '5610', account_name: 'Bilkostnader', debit_pct: 80, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Försäkringar (företag)',
    description: 'Företagsförsäkring, ansvarsförsäkring',
    category: 'expense',
    keywords: ['försäkring', 'insurance', 'ansvarsförsäkring', 'företagsförsäkring'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6310', account_name: 'Företagsförsäkringar', debit_pct: 100, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Reklamkostnader',
    description: 'Annonsering, marknadsföring, Google Ads, sociala medier',
    category: 'expense',
    keywords: ['reklam', 'annons', 'marknadsföring', 'google ads', 'facebook', 'marketing', 'ad'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '5910', account_name: 'Annonsering', debit_pct: 80, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Juridiska tjänster',
    description: 'Advokat, juridisk rådgivning, avtal',
    category: 'expense',
    keywords: ['advokat', 'juridik', 'avtal', 'legal', 'lawyer', 'juridisk'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6530', account_name: 'Redovisning och juridik', debit_pct: 80, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
      { account_code: '2440', account_name: 'Leverantörsskulder', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Utbildning & facklitteratur',
    description: 'Kurs, konferens, facklitteratur',
    category: 'expense',
    keywords: ['utbildning', 'kurs', 'konferens', 'facklitteratur', 'training', 'course', 'seminar'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6910', account_name: 'Tidningar och facklitteratur', debit_pct: 80, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },

  // ── Payroll ────────────────────────────────────────────────
  {
    template_name: 'Löneutbetalning',
    description: 'Bruttolön med skatt och arbetsgivaravgifter',
    category: 'payroll',
    keywords: ['lön', 'salary', 'payroll', 'löner', 'anställd'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '7210', account_name: 'Löner tjänstemän', debit_pct: 100, credit_pct: 0 },
      { account_code: '2710', account_name: 'Personalskatt', debit_pct: 0, credit_pct: 30 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 70 },
      { account_code: '7510', account_name: 'Arbetsgivaravgifter', debit_pct: 31.42, credit_pct: 0 },
      { account_code: '2730', account_name: 'Arbetsgivaravgifter skuld', debit_pct: 0, credit_pct: 31.42 },
    ],
  },
  {
    template_name: 'Utbetalning personalskatt',
    description: 'Inbetalning av personalskatt och arbetsgivaravgifter till Skatteverket',
    category: 'tax',
    keywords: ['skatteverket', 'personalskatt', 'arbetsgivaravgift', 'F-skatt', 'tax payment'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '2710', account_name: 'Personalskatt', debit_pct: 100, credit_pct: 0 },
      { account_code: '2730', account_name: 'Arbetsgivaravgifter skuld', debit_pct: 31.42, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 131.42 },
    ],
  },

  // ── Tax ────────────────────────────────────────────────────
  {
    template_name: 'Momsredovisning (betalning)',
    description: 'Inbetalning av moms till Skatteverket',
    category: 'tax',
    keywords: ['moms', 'momsredovisning', 'VAT', 'momsbetalning', 'skattekonto'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '2610', account_name: 'Utgående moms 25%', debit_pct: 100, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 0, credit_pct: 80 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 20 },
    ],
  },
  {
    template_name: 'Preliminär F-skatt',
    description: 'Inbetalning av preliminär F-skatt',
    category: 'tax',
    keywords: ['f-skatt', 'preliminärskatt', 'inkomstskatt', 'skatteinbetalning'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '2510', account_name: 'Skatteskulder', debit_pct: 100, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },

  // ── Assets ─────────────────────────────────────────────────
  {
    template_name: 'Inventarieinköp',
    description: 'Inköp av inventarier/utrustning (> 1/2 prisbasbelopp)',
    category: 'asset',
    keywords: ['inventarie', 'utrustning', 'dator', 'möbel', 'maskin', 'equipment', 'furniture'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1220', account_name: 'Inventarier', debit_pct: 100, credit_pct: 0 },
      { account_code: '2640', account_name: 'Ingående moms', debit_pct: 25, credit_pct: 0 },
      { account_code: '2440', account_name: 'Leverantörsskulder', debit_pct: 0, credit_pct: 125 },
    ],
  },
  {
    template_name: 'Avskrivning inventarier',
    description: 'Månatlig/årlig avskrivning på inventarier',
    category: 'adjustment',
    keywords: ['avskrivning', 'depreciation', 'inventarier', 'värdeminskning'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '7830', account_name: 'Avskrivning inventarier', debit_pct: 100, credit_pct: 0 },
      { account_code: '1229', account_name: 'Ackumulerade avskrivningar inventarier', debit_pct: 0, credit_pct: 100 },
    ],
  },

  // ── Adjustments ────────────────────────────────────────────
  {
    template_name: 'Upplupna intäkter',
    description: 'Periodisering av intäkter som tillhör perioden men ej fakturerats',
    category: 'adjustment',
    keywords: ['upplupen', 'periodisering', 'accrued', 'intjänad', 'accrual'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1790', account_name: 'Upplupna intäkter', debit_pct: 100, credit_pct: 0 },
      { account_code: '3010', account_name: 'Försäljning tjänster', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Förutbetalda kostnader',
    description: 'Kostnader betalda i förskott som tillhör kommande period',
    category: 'adjustment',
    keywords: ['förutbetald', 'förskott', 'prepaid', 'förskottsbetalning'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1710', account_name: 'Förutbetalda kostnader', debit_pct: 100, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Upplupna kostnader',
    description: 'Kostnader som tillhör perioden men ej fakturerats',
    category: 'adjustment',
    keywords: ['upplupen kostnad', 'accrued expense', 'periodisering'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6990', account_name: 'Övriga kostnader', debit_pct: 100, credit_pct: 0 },
      { account_code: '2990', account_name: 'Upplupna kostnader', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Ägarinsättning',
    description: 'Ägaren sätter in privata medel i företaget',
    category: 'adjustment',
    keywords: ['insättning', 'ägartillskott', 'owner contribution', 'kapitaltillskott'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 100, credit_pct: 0 },
      { account_code: '2010', account_name: 'Eget kapital', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Privata uttag',
    description: 'Ägaren tar ut medel från företaget (enskild firma)',
    category: 'adjustment',
    keywords: ['uttag', 'privat uttag', 'owner draw', 'eget uttag'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '2010', account_name: 'Eget kapital', debit_pct: 100, credit_pct: 0 },
      { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Kundförlust',
    description: 'Avskrivning av osäker kundfordran',
    category: 'adjustment',
    keywords: ['kundförlust', 'bad debt', 'osäker fordran', 'avskrivning fordran', 'kredit'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '6350', account_name: 'Kundförluster', debit_pct: 100, credit_pct: 0 },
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 0, credit_pct: 100 },
    ],
  },
  {
    template_name: 'Kreditfaktura',
    description: 'Korrigering av faktura — kreditering',
    category: 'adjustment',
    keywords: ['kredit', 'kreditfaktura', 'retur', 'credit note', 'korrigering', 'återbetalning'],
    is_system: true,
    locale: 'se-bas2024',
    template_lines: [
      { account_code: '3010', account_name: 'Försäljning tjänster', debit_pct: 100, credit_pct: 0 },
      { account_code: '2610', account_name: 'Utgående moms 25%', debit_pct: 25, credit_pct: 0 },
      { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 0, credit_pct: 125 },
    ],
  },
];
