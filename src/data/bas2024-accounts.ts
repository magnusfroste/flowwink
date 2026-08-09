/**
 * BAS 2024 Chart of Accounts — the starter set new installations get.
 *
 * NAMES ARE THE STANDARD'S, NOT OURS. Every account name here is verified
 * against src/data/locale-sources/bas-2024-official.json, generated from the
 * workbook BAS publishes. bas2024-chart.guardrails.test.ts fails on any that
 * disagree — because this file used to say "BAS 2024" while being written by
 * hand, and 166 of its names were wrong before anyone compared them.
 *
 * Adding an account: take the name verbatim from the official artifact. If the
 * account is not in it, it is not a BAS account — see KNOWN_NOT_IN_BAS in the
 * guardrail before shipping one.
 */
export const BAS_2024_ACCOUNTS = [
  // ============================================================
  // 1xxx — Tillgångar (Assets)
  // ============================================================
  // Immateriella anläggningstillgångar
  { account_code: '1010', account_name: 'Utvecklingsutgifter', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1020', account_name: 'Koncessioner m.m.', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1030', account_name: 'Patent', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1040', account_name: 'Licenser', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1050', account_name: 'Varumärken', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1060', account_name: 'Hyresrätter, tomträtter och liknande', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1070', account_name: 'Goodwill', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1088', account_name: 'Förskott för immateriella anläggningstillgångar', account_type: 'asset', account_category: 'Immateriella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  // Materiella anläggningstillgångar
  { account_code: '1110', account_name: 'Byggnader', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1111', account_name: 'Byggnader på egen mark', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1119', account_name: 'Ackumulerade avskrivningar på byggnader', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '1120', account_name: 'Förbättringsutgifter på annans fastighet', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1129', account_name: 'Ackumulerade avskrivningar på förbättringsutgifter på annans fastighet', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '1130', account_name: 'Mark', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1139', account_name: 'Ack avskrivning inventarier', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '1150', account_name: 'Markanläggningar', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1159', account_name: 'Ackumulerade avskrivningar på markanläggningar', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '1180', account_name: 'Pågående nyanläggningar och förskott för byggnader och mark', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1190', account_name: 'Övriga materiella anläggningstillgångar', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1200', account_name: 'Inventarier', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1220', account_name: 'Inventarier och verktyg', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1229', account_name: 'Ackumulerade avskrivningar på inventarier och verktyg', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '1209', account_name: 'Ack avskrivning inventarier och verktyg', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  // Finansiella anläggningstillgångar
  { account_code: '1310', account_name: 'Andelar i koncernföretag', account_type: 'asset', account_category: 'Finansiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1320', account_name: 'Långfristiga fordringar hos koncernföretag', account_type: 'asset', account_category: 'Finansiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1350', account_name: 'Andelar och värdepapper i andra företag', account_type: 'asset', account_category: 'Finansiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1360', account_name: 'Lån till delägare eller närstående enligt ABL, långfristig del', account_type: 'asset', account_category: 'Finansiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1380', account_name: 'Andra långfristiga fordringar', account_type: 'asset', account_category: 'Finansiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  // Varulager
  { account_code: '1410', account_name: 'Lager av råvaror', account_type: 'asset', account_category: 'Varulager', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1420', account_name: 'Lager av tillsatsmaterial och förnödenheter', account_type: 'asset', account_category: 'Varulager', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1430', account_name: 'Färdiga varor och handelsvaror', account_type: 'asset', account_category: 'Varulager', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1440', account_name: 'Produkter i arbete', account_type: 'asset', account_category: 'Varulager', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1450', account_name: 'Lager av färdiga varor', account_type: 'asset', account_category: 'Varulager', normal_balance: 'debit', locale: 'se-bas2024' },
  // Kortfristiga fordringar
  { account_code: '1510', account_name: 'Kundfordringar', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1520', account_name: 'Växelfordringar', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1530', account_name: 'Kontraktsfordringar', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1540', account_name: 'Förutbetalda kostnader och upplupna intäkter', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1550', account_name: 'Konsignationsfordringar', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1560', account_name: 'Kundfordringar hos koncernföretag', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1580', account_name: 'Fordringar för kontokort och kuponger', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1610', account_name: 'Kortfristiga fordringar hos anställda', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1620', account_name: 'Upparbetad men ej fakturerad intäkt', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1630', account_name: 'Avräkning för skatter och avgifter (skattekonto)', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1640', account_name: 'Skattefordringar', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1650', account_name: 'Momsfordran', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1710', account_name: 'Förutbetalda hyreskostnader', account_type: 'asset', account_category: 'Fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1790', account_name: 'Övriga förutbetalda kostnader och upplupna intäkter', account_type: 'asset', account_category: 'Fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1660', account_name: 'Kortfristiga fordringar hos koncernföretag', account_type: 'asset', account_category: 'Kortfristiga fordringar', normal_balance: 'debit', locale: 'se-bas2024' },
  // Kortfristiga placeringar
  { account_code: '1810', account_name: 'Andelar i börsnoterade företag', account_type: 'asset', account_category: 'Kortfristiga placeringar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1890', account_name: 'Nedskrivning av kortfristiga placeringar', account_type: 'asset', account_category: 'Kortfristiga placeringar', normal_balance: 'debit', locale: 'se-bas2024' },
  // Kassa och bank
  { account_code: '1910', account_name: 'Kassa', account_type: 'asset', account_category: 'Kassa och bank', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1920', account_name: 'PlusGiro', account_type: 'asset', account_category: 'Kassa och bank', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1930', account_name: 'Företagskonto/checkkonto/affärskonto', account_type: 'asset', account_category: 'Kassa och bank', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1940', account_name: 'Övriga bankkonton', account_type: 'asset', account_category: 'Kassa och bank', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1950', account_name: 'Bankcertifikat', account_type: 'asset', account_category: 'Kassa och bank', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1960', account_name: 'Koncernkonto moderföretag', account_type: 'asset', account_category: 'Kassa och bank', normal_balance: 'debit', locale: 'se-bas2024' },

  // ============================================================
  // 2xxx — Eget kapital och skulder
  // ============================================================
  // Eget kapital
  { account_code: '2010', account_name: 'Eget kapital', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2011', account_name: 'Egna varuuttag', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2020', account_name: 'Eget kapital', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2030', account_name: 'Eget kapital', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2040', account_name: 'Eget kapital', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '2050', account_name: 'Avsättning till expansionsfond', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2070', account_name: 'Ändamålsbestämda medel', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2072', account_name: 'Ändamål 2', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2013', account_name: 'Övriga egna uttag', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '2018', account_name: 'Övriga egna insättningar', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2080', account_name: 'Bundet eget kapital', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2081', account_name: 'Aktiekapital', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2091', account_name: 'Balanserad vinst eller förlust', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2099', account_name: 'Årets resultat', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  // Obeskattade reserver
  { account_code: '2110', account_name: 'Periodiseringsfonder', account_type: 'liability', account_category: 'Obeskattade reserver', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2150', account_name: 'Ackumulerade överavskrivningar', account_type: 'liability', account_category: 'Obeskattade reserver', normal_balance: 'credit', locale: 'se-bas2024' },
  // Avsättningar
  { account_code: '2210', account_name: 'Avsättningar för pensioner enligt tryggandelagen', account_type: 'liability', account_category: 'Avsättningar', normal_balance: 'credit', locale: 'se-bas2024' },
  // Långfristiga skulder
  { account_code: '2310', account_name: 'Obligations- och förlagslån', account_type: 'liability', account_category: 'Långfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2220', account_name: 'Avsättningar för garantier', account_type: 'liability', account_category: 'Långfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2250', account_name: 'Övriga avsättningar för skatter', account_type: 'liability', account_category: 'Långfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2290', account_name: 'Övriga avsättningar', account_type: 'liability', account_category: 'Långfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  // Kortfristiga skulder
  { account_code: '2410', account_name: 'Andra kortfristiga låneskulder till kreditinstitut', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2420', account_name: 'Förskott från kunder', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2350', account_name: 'Andra långfristiga skulder till kreditinstitut', account_type: 'liability', account_category: 'Långfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2440', account_name: 'Leverantörsskulder', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2450', account_name: 'Fakturerad men ej upparbetad intäkt', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2460', account_name: 'Leverantörsskulder till koncernföretag', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2470', account_name: 'Leverantörsskulder till intresseföretag, gemensamt styrda företag och övriga företag som det finns ett ägarintresse i', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2480', account_name: 'Checkräkningskredit, kortfristig', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2490', account_name: 'Övriga kortfristiga skulder till kreditinstitut, kunder och leverantörer', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2510', account_name: 'Skatteskulder', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2610', account_name: 'Utgående moms, 25 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2611', account_name: 'Utgående moms på försäljning inom Sverige, 25 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  // Reverse-charge output VAT (BAS: "omvänd skattskyldighet"). Seeded to the
  // database by 20260726090000_reverse-charge-vat.sql but missing here, so the
  // code's chart disagreed with every live instance until 2026-08-09.
  { account_code: '2614', account_name: 'Utgående moms omvänd skattskyldighet, 25 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2615', account_name: 'Utgående moms import av varor, 25 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2624', account_name: 'Utgående moms omvänd skattskyldighet, 12 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2625', account_name: 'Utgående moms import av varor, 12 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2634', account_name: 'Utgående moms omvänd skattskyldighet, 6 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2635', account_name: 'Utgående moms import av varor, 6 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2620', account_name: 'Utgående moms, 12 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2630', account_name: 'Utgående moms, 6 %', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2640', account_name: 'Ingående moms', account_type: 'liability', account_category: 'Moms', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '2645', account_name: 'Beräknad ingående moms på förvärv från utlandet', account_type: 'liability', account_category: 'Moms', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '2650', account_name: 'Redovisningskonto för moms', account_type: 'liability', account_category: 'Moms', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2660', account_name: 'Punktskatter', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2710', account_name: 'Personalskatt', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2720', account_name: 'Utmätning i lön', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2730', account_name: 'Lagstadgade sociala avgifter och särskild löneskatt', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2731', account_name: 'Avräkning lagstadgade sociala avgifter', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2740', account_name: 'Avtalade sociala avgifter', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2750', account_name: 'Utmätning i lön m.m.', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2820', account_name: 'Kortfristiga skulder till anställda', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2890', account_name: 'Övriga kortfristiga skulder', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2891', account_name: 'Skulder under indrivning', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2920', account_name: 'Upplupna semesterlöner', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2898', account_name: 'Outtagen vinstutdelning', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2990', account_name: 'Övriga upplupna kostnader och förutbetalda intäkter', account_type: 'liability', account_category: 'Kortfristiga skulder', normal_balance: 'credit', locale: 'se-bas2024' },

  // ============================================================
  // 3xxx — Intäkter (Revenue)
  // ============================================================
  { account_code: '3000', account_name: 'Försäljning inom Sverige', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3001', account_name: 'Försäljning inom Sverige, 25 % moms', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3002', account_name: 'Försäljning inom Sverige, 12 % moms', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3003', account_name: 'Försäljning inom Sverige, 6 % moms', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3004', account_name: 'Försäljning inom Sverige, momsfri', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3010', account_name: 'Försäljning av tjänster', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3011', account_name: 'Försäljning tjänster 25% moms', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3012', account_name: 'Försäljning tjänster momsfritt', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3013', account_name: 'Försäljning tjänster utanför EU', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3020', account_name: 'Försäljning varor inom EU', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3030', account_name: 'Försäljning varor utanför EU', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3040', account_name: 'Hyresintäkter', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3041', account_name: 'Försäljning tjänster inom Sverige, 25% moms', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3050', account_name: 'Provisionsintäkter', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3060', account_name: 'Licensintäkter', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3090', account_name: 'Övriga rörelseintäkter', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3100', account_name: 'Försäljning av varor utanför Sverige', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3200', account_name: 'Försäljning VMB och omvänd moms', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3300', account_name: 'Försäljning av tjänster utanför Sverige', account_type: 'revenue', account_category: 'Intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3310', account_name: 'Försäljning tjänster EU', account_type: 'revenue', account_category: 'Nettoomsättning', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3380', account_name: 'Försäljning export', account_type: 'revenue', account_category: 'Nettoomsättning', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3500', account_name: 'Fakturerade kostnader (gruppkonto)', account_type: 'revenue', account_category: 'Övriga intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3530', account_name: 'Fakturerade tull- och speditionskostnader m.m.', account_type: 'revenue', account_category: 'Övriga intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3540', account_name: 'Faktureringsavgifter', account_type: 'revenue', account_category: 'Övriga intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3600', account_name: 'Rörelsens sidointäkter (gruppkonto)', account_type: 'revenue', account_category: 'Övriga intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3700', account_name: 'Intäktskorrigeringar (gruppkonto)', account_type: 'revenue', account_category: 'Övriga intäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3740', account_name: 'Öres- och kronutjämning', account_type: 'revenue', account_category: 'Övriga intäkter', normal_balance: 'credit', locale: 'se-bas2024' },

  // ============================================================
  // 4xxx — Varuinköp / Kostnader för sålda varor
  // ============================================================
  { account_code: '4000', account_name: 'Inköp av varor från Sverige', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4010', account_name: 'Inköp av material', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4020', account_name: 'Inköp varor inom EU', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4030', account_name: 'Inköp varor utanför EU', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4050', account_name: 'Frakter', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4060', account_name: 'Tull och spedition', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4080', account_name: 'Rabatter och bonusar', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4100', account_name: 'Lagerförändring', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4500', account_name: 'Övriga momspliktiga inköp', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4600', account_name: 'Legoarbeten och underentreprenader (gruppkonto)', account_type: 'expense', account_category: 'Varuinköp', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '4990', account_name: 'Förändring av lager', account_type: 'expense', account_category: 'Material och varor', normal_balance: 'debit', locale: 'se-bas2024' },

  // ============================================================
  // 5xxx — Övriga externa kostnader
  // ============================================================
  { account_code: '5010', account_name: 'Lokalhyra', account_type: 'expense', account_category: 'Lokalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5020', account_name: 'El för belysning', account_type: 'expense', account_category: 'Lokalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5030', account_name: 'Värme', account_type: 'expense', account_category: 'Lokalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5040', account_name: 'Vatten och avlopp', account_type: 'expense', account_category: 'Lokalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5050', account_name: 'Lokaltillbehör', account_type: 'expense', account_category: 'Lokalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5060', account_name: 'Städning och renhållning', account_type: 'expense', account_category: 'Lokalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5090', account_name: 'Övriga lokalkostnader', account_type: 'expense', account_category: 'Lokalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5410', account_name: 'Förbrukningsinventarier', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5420', account_name: 'Programvaror', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5430', account_name: 'Transportinventarier', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5460', account_name: 'Förbrukningsmaterial', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5500', account_name: 'Reparation och underhåll (gruppkonto)', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5600', account_name: 'Kostnader för transportmedel (gruppkonto)', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5610', account_name: 'Personbilskostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5620', account_name: 'Lastbilskostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5630', account_name: 'Truckkostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5640', account_name: 'Kostnader för arbetsmaskiner', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5650', account_name: 'Traktorkostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5800', account_name: 'Resekostnader (gruppkonto)', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5810', account_name: 'Biljetter', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5820', account_name: 'Hyrbilskostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5831', account_name: 'Kost och logi i Sverige', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5832', account_name: 'Kost och logi i utlandet', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5850', account_name: 'Traktamenten skattefria', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5860', account_name: 'Bilersättningar skattefria', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5910', account_name: 'Annonsering', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5920', account_name: 'Utomhus- och trafikreklam', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '5930', account_name: 'Reklamtrycksaker och direktreklam', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },

  // ============================================================
  // 6xxx — Övriga externa kostnader
  // ============================================================
  { account_code: '6000', account_name: 'Övriga försäljningskostnader (gruppkonto)', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6040', account_name: 'Kontokortsavgifter', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6070', account_name: 'Representation', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6071', account_name: 'Representation, avdragsgill', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6072', account_name: 'Representation, ej avdragsgill', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6110', account_name: 'Kontorsmateriel', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6200', account_name: 'Tele och post (gruppkonto)', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6210', account_name: 'Telekommunikation', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6230', account_name: 'Datakommunikation', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6250', account_name: 'Postbefordran', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6310', account_name: 'Företagsförsäkringar', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6320', account_name: 'Självrisker vid skada', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6350', account_name: 'Förluster på kundfordringar', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6410', account_name: 'Styrelsearvoden som inte är lön', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6420', account_name: 'Ersättningar till revisor', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6530', account_name: 'Redovisningstjänster', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6540', account_name: 'IT-tjänster', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6550', account_name: 'Konsultarvoden', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6560', account_name: 'Serviceavgifter till branschorganisationer', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6570', account_name: 'Bankkostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6580', account_name: 'Advokat- och rättegångskostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6590', account_name: 'Övriga externa tjänster', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6800', account_name: 'Inhyrd personal (gruppkonto)', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6900', account_name: 'Övriga externa kostnader (gruppkonto)', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6910', account_name: 'Licensavgifter och royalties', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6950', account_name: 'Tillsynsavgifter myndigheter', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6970', account_name: 'Tidningar, tidskrifter och facklitteratur', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6980', account_name: 'Föreningsavgifter', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '6990', account_name: 'Övriga externa kostnader', account_type: 'expense', account_category: 'Övriga externa kostnader', normal_balance: 'debit', locale: 'se-bas2024' },

  // ============================================================
  // 7xxx — Personalkostnader & avskrivningar
  // ============================================================
  { account_code: '7010', account_name: 'Löner till kollektivanställda', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7020', account_name: 'Löner till tjänstemän', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7030', account_name: 'Löner till kollektivanställda (utlandsanställda)', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7040', account_name: 'Timlöner', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7050', account_name: 'Ackordslöner', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7070', account_name: 'Sjuklön', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7080', account_name: 'Löner till kollektivanställda för ej arbetad tid', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7082', account_name: 'Semesterlöner till kollektivanställda', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7090', account_name: 'Förändring av semesterlöneskuld', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7100', account_name: 'Löner vid pågående arbete', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7210', account_name: 'Löner till tjänstemän', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7220', account_name: 'Löner till företagsledare', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7230', account_name: 'Löner till tjänstemän och ftgsledare (utlandsanställda)', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7290', account_name: 'Förändring av semesterlöneskuld', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7321', account_name: 'Skattefria traktamenten, Sverige', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7331', account_name: 'Skattefria bilersättningar', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7310', account_name: 'Kontanta extraersättningar', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7320', account_name: 'Traktamenten vid tjänsteresa', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7330', account_name: 'Bilersättningar', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7340', account_name: 'Personalrepresentation', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7350', account_name: 'Ersättningar för föreskrivna arbetskläder', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7380', account_name: 'Kostnader för förmåner till anställda', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7399', account_name: 'Övriga personalkostnader', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  // Avskrivningar
  { account_code: '7510', account_name: 'Arbetsgivaravgifter 31,42 %', account_type: 'expense', account_category: 'Avskrivningar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7810', account_name: 'Avskrivningar på immateriella anläggningstillgångar', account_type: 'expense', account_category: 'Avskrivningar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7820', account_name: 'Avskrivningar på byggnader och markanläggningar', account_type: 'expense', account_category: 'Avskrivningar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7830', account_name: 'Avskrivningar på maskiner och inventarier', account_type: 'expense', account_category: 'Avskrivningar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7832', account_name: 'Avskrivningar på inventarier och verktyg', account_type: 'expense', account_category: 'Avskrivningar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7840', account_name: 'Avskrivningar på förbättringsutgifter på annans fastighet', account_type: 'expense', account_category: 'Avskrivningar', normal_balance: 'debit', locale: 'se-bas2024' },

  // ============================================================
  // 8xxx — Finansiella poster, skatt & bokslut
  // ============================================================
  { account_code: '8010', account_name: 'Utdelning på andelar i koncernföretag', account_type: 'expense', account_category: 'Finansiella poster', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8020', account_name: 'Resultat vid försäljning av andelar i koncernföretag', account_type: 'revenue', account_category: 'Finansiella poster', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8110', account_name: 'Utdelningar på andelar i intresseföretag, gemensamt styrda företag och övriga företag som det finns ett ägarintresse i', account_type: 'revenue', account_category: 'Finansiella poster', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8210', account_name: 'Utdelningar på andelar i andra företag', account_type: 'revenue', account_category: 'Finansiella poster', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8310', account_name: 'Ränteintäkter från omsättningstillgångar', account_type: 'revenue', account_category: 'Finansiella poster', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8320', account_name: 'Värdering till verkligt värde, omsättningstillgångar', account_type: 'revenue', account_category: 'Finansiella poster', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8330', account_name: 'Valutakursdifferenser på kortfristiga fordringar och placeringar', account_type: 'revenue', account_category: 'Finansiella poster', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8410', account_name: 'Räntekostnader för långfristiga skulder', account_type: 'expense', account_category: 'Finansiella poster', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8999', account_name: 'Årets resultat', account_type: 'expense', account_category: 'Årets resultat', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8420', account_name: 'Räntekostnader för kortfristiga skulder', account_type: 'expense', account_category: 'Finansiella poster', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8422', account_name: 'Dröjsmålsräntor för leverantörsskulder', account_type: 'expense', account_category: 'Finansiella poster', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8430', account_name: 'Valutakursdifferenser på skulder', account_type: 'expense', account_category: 'Finansiella poster', normal_balance: 'debit', locale: 'se-bas2024' },
  // Extraordinära poster
  { account_code: '8710', account_name: 'Extraordinära intäkter', account_type: 'revenue', account_category: 'Extraordinära poster', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8750', account_name: 'Extraordinära kostnader', account_type: 'expense', account_category: 'Extraordinära poster', normal_balance: 'debit', locale: 'se-bas2024' },
  // Bokslutsdispositioner
  { account_code: '8811', account_name: 'Avsättning till periodiseringsfond', account_type: 'expense', account_category: 'Bokslutsdispositioner', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8819', account_name: 'Återföring från periodiseringsfond', account_type: 'revenue', account_category: 'Bokslutsdispositioner', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '8810', account_name: 'Förändring av periodiseringsfond', account_type: 'expense', account_category: 'Bokslutsdispositioner', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8830', account_name: 'Lämnade koncernbidrag', account_type: 'expense', account_category: 'Bokslutsdispositioner', normal_balance: 'debit', locale: 'se-bas2024' },
  // Skatt
  { account_code: '8910', account_name: 'Skatt som belastar årets resultat', account_type: 'expense', account_category: 'Skatt', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8920', account_name: 'Skatt på grund av ändrad beskattning', account_type: 'expense', account_category: 'Skatt', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '8930', account_name: 'Restituerad skatt', account_type: 'expense', account_category: 'Skatt', normal_balance: 'debit', locale: 'se-bas2024' },

  // ============================================================
  // Konton som RPC:er defaultar till
  // ============================================================
  // Dessa saknades i seeden trots att SECURITY DEFINER-funktioner bokför mot
  // dem som DEFAULT-värde. Följden var att en nyinstallation bokförde mot
  // konton som inte fanns i kontoplanen — balansräkningen kunde inte
  // klassificera raderna och rapporterade balanced:false. Två migrationer
  // hade börjat lappa in enstaka konton (1210, 2641, 7385) en i taget i
  // stället för att fylla luckan här.
  //
  // chart-of-accounts.guardrails.test.ts håller ihop de två: varje konto som
  // en migration anger som DEFAULT måste finnas i den här listan.
  { account_code: '1210', account_name: 'Maskiner och andra tekniska anläggningar', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '1219', account_name: 'Ackumulerade avskrivningar på maskiner och andra tekniska anläggningar', account_type: 'asset', account_category: 'Materiella anläggningstillgångar', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2090', account_name: 'Fritt eget kapital', account_type: 'equity', account_category: 'Eget kapital', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '2641', account_name: 'Debiterad ingående moms', account_type: 'liability', account_category: 'Moms', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '3960', account_name: 'Valutakursvinster på fordringar och skulder av rörelsekaraktär', account_type: 'revenue', account_category: 'Övriga rörelseintäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '3970', account_name: 'Vinst vid avyttring av immateriella och materiella anläggningstillgångar', account_type: 'revenue', account_category: 'Övriga rörelseintäkter', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '7385', account_name: 'Kostnader för fri bil', account_type: 'expense', account_category: 'Personalkostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7720', account_name: 'Nedskrivningar av byggnader och mark', account_type: 'expense', account_category: 'Av- och nedskrivningar', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7788', account_name: 'Återföring av nedskrivningar av maskiner och inventarier', account_type: 'expense', account_category: 'Av- och nedskrivningar', normal_balance: 'credit', locale: 'se-bas2024' },
  { account_code: '7960', account_name: 'Valutakursförluster på fordringar och skulder av rörelsekaraktär', account_type: 'expense', account_category: 'Övriga rörelsekostnader', normal_balance: 'debit', locale: 'se-bas2024' },
  { account_code: '7970', account_name: 'Förlust vid avyttring av immateriella och materiella anläggningstillgångar', account_type: 'expense', account_category: 'Övriga rörelsekostnader', normal_balance: 'debit', locale: 'se-bas2024' },
];
