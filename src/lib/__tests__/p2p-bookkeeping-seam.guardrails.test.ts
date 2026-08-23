import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Skyddsräcke: sömmen mellan mottagning, leverantörsfaktura och betalning.
 *
 * ── Det verkliga felet (mätt på Nordbrygg, 2026-08-27) ──────────────────────
 * Inköpskedjan postade två verifikationer och saknade den i mitten:
 *
 *   mottagning:   Dt 1460 Lager        13 440,00  /  Kr 2441 GRNI      13 440,00
 *   faktura:      — INGENTING —
 *   betalning:    Dt 2440 Lev.skuld    15 052,80  /  Kr 1930 Bank      15 052,80
 *
 * Var och en balanserar för sig, så ingen balanskontroll larmade. Men de hänger
 * inte ihop, och tre saldon bar spåren:
 *
 *   • 2441 GRNI −60 736,00 och växande. Upplupningen som mottagningen bokar
 *     stängdes ALDRIG av någon — kontot var en evighetsmaskin.
 *   • 2440 Leverantörsskuld +40 852,80 DEBET. Betalningen debiterade en skuld
 *     ingen krediterat: ett skuldkonto som blivit en tillgång.
 *   • 2641 Debiterad ingående moms aldrig rörd. 8 044,80 avdragsgill moms fanns
 *     aldrig i huvudboken och kunde därför aldrig nå ruta 48 i
 *     momsdeklarationen. Pengar företaget hade rätt till, borta i tystnad.
 *
 * Dessutom: mottagningens verifikation dateras av KLOCKAN, inte av händelsen.
 * En mottagning daterad 2026-08-28 fick verifikation daterad 2026-08-23.
 *
 * Odoo kallar mellansteget anglosaxisk redovisning — mottagningen bokas mot
 * "Stock Interim (Received)" och fakturan NOLLSTÄLLER det kontot. 2441 spelar
 * exakt den rollen i BAS.
 *
 * ── Vad som låses ───────────────────────────────────────────────────────────
 *  1. Registreringen av en leverantörsfaktura BOKFÖR. Inte "kan bokföra" via
 *     en skill någon kanske anropar — en trigger på tabellen, så att alla
 *     vägar in (agentens db:-skill, admin-UI:t, en RPC) ger samma huvudbok.
 *  2. Verifikationen har rätt form: GRNI debiteras, ingående moms debiteras,
 *     leverantörsskulden krediteras.
 *  3. Noll moms skiljs från moms-ej-angiven, och ett nollbelopp skriver ingen
 *     rad.
 *  4. Bokföringsdatumet följer händelsen. Ingen verifikation i inköpskedjan
 *     dateras med CURRENT_DATE som förstahandsval.
 *  5. Kontona läses ur kontorollerna. Ett fyrsiffrigt BAS-nummer i en
 *     pengavägs KROPP är samma bugg som i en parameterdefault — och det är i
 *     kroppen literalen gömde sig i pay_vendor_invoice, där kontorollsspärren
 *     (som bara tittar på defaulter) inte såg den.
 *  6. Varje roll någon faktiskt slår upp finns seedad för BÅDA levererade
 *     paketen. account_for() är fail-closed: en roll utan mappning kastar, och
 *     då dör hela postningsvägen. Det har hänt förut — ifrs-generic hade en
 *     kontoplan men noll rollmappningar, så paketet kunde AKTIVERAS men inte
 *     ANVÄNDAS.
 */

const root = process.cwd();
const migrationsDir = join(root, 'supabase/migrations');
const BASELINE = '00000000000000_baseline.sql';

/** Alla migrationer i tillämpningsordning (baseline först). */
function migrationFiles(): string[] {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  return [
    ...files.filter((f) => f === BASELINE),
    ...files.filter((f) => f !== BASELINE).sort(),
  ];
}

/**
 * Senaste definitionen av varje funktion, KROPPEN inkluderad.
 * Kontorollsspärren fångar bara signaturen; literalen i pay_vendor_invoice satt
 * i kroppen, så den här läser hela dollarcitatet.
 */
function latestFunctionBodies(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const start = m.index!;
      // Hitta dollarcitatet som inleder kroppen.
      const tagMatch = /\bAS\s+(\$[A-Za-z_0-9]*\$)/i.exec(sql.slice(start, start + 4000));
      if (!tagMatch) continue;
      const tag = tagMatch[1];
      const bodyStart = start + tagMatch.index + tagMatch[0].length;
      const bodyEnd = sql.indexOf(tag, bodyStart);
      if (bodyEnd === -1) continue;
      out.set(m[1], sql.slice(start, bodyEnd + tag.length));
    }
  }
  return out;
}

/** Kommentarer bort — prosan citerar de gamla kontonumren med flit. */
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

const bodies = latestFunctionBodies();

/** Pengavägarna i Procure-to-Pay. Här får inget kontonummer stå skrivet. */
const P2P_MONEY_PATHS = [
  'book_vendor_invoice',
  'pay_vendor_invoice',
  'process_stock_move_valuation',
];

describe('P2P: bokföringssömmen mellan mottagning, faktura och betalning', () => {
  it('registreringen av en leverantörsfaktura bokför — via en trigger, inte en skill någon kanske anropar', () => {
    expect(bodies.has('book_vendor_invoice'), 'book_vendor_invoice saknas i migrationerna').toBe(true);

    const allSql = migrationFiles()
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
      .join('\n');

    // Triggerfunktionen anropar bokföringen …
    const triggerFn = bodies.get('book_vendor_invoice_on_register');
    expect(triggerFn, 'triggerfunktionen book_vendor_invoice_on_register saknas').toBeTruthy();
    expect(stripComments(triggerFn!)).toMatch(/book_vendor_invoice\s*\(/);

    // … och triggern sitter på tabellen, efter INSERT.
    expect(
      /CREATE\s+TRIGGER\s+trg_book_vendor_invoice_on_register[\s\S]{0,200}?AFTER\s+INSERT\s+ON\s+public\.vendor_invoices/i.test(
        allSql,
      ),
      'ingen AFTER INSERT-trigger på vendor_invoices — då beror bokföringen på vilken väg registreringen tog',
    ).toBe(true);
  });

  it('verifikationen har rätt form: GRNI + ingående moms debiteras, leverantörsskulden krediteras', () => {
    const body = stripComments(bodies.get('book_vendor_invoice')!);
    for (const role of ['goods_received_not_invoiced', 'vat_input', 'accounts_payable']) {
      expect(body, `book_vendor_invoice slår inte upp rollen ${role}`).toContain(
        `account_for('${role}')`,
      );
    }
    // Krediten på leverantörsskulden är hela poängen — utan den blir ett
    // skuldkonto en tillgång så fort betalningen debiterar det.
    expect(body).toMatch(/v_ap,\s*0,\s*v_total/);
  });

  it('noll moms skriver ingen rad — men noll är inte samma sak som "ej angiven"', () => {
    const body = stripComments(bodies.get('book_vendor_invoice')!);

    // Momsraden skrivs bara när det finns ett belopp.
    expect(body, 'momsraden villkoras inte av ett positivt belopp').toMatch(/IF\s+v_tax\s*>\s*0\s+THEN/i);

    // Skillnaden mellan "uttalad nollmoms" och "bara totalen angavs" kan bara
    // avgöras genom att också läsa nettot. En funktion som bara tittar på
    // tax_cents kan inte skilja ett EU-förvärv från en ofullständig
    // registrering — och skulle tyst kalla båda för noll.
    expect(body, 'nollmoms avgörs utan att netto (subtotal_cents) läses').toContain('subtotal_cents');
    expect(body, 'en faktura där momsen aldrig angavs märks inte ut').toMatch(/moms ej angiven/i);
  });

  it('bokföringsdatumet följer händelsen, inte klockan', () => {
    const body = stripComments(bodies.get('process_stock_move_valuation')!);

    // Mottagningens datum hämtas ur mottagningsraden.
    expect(body, 'mottagningens verifikation läser inte goods_receipts.received_date').toMatch(
      /received_date\s+INTO[\s\S]{0,80}goods_receipts/i,
    );

    // Och CURRENT_DATE får aldrig vara förstahandsvalet i INSERT:en.
    const inserts = body.match(/INSERT\s+INTO\s+journal_entries\s*\([^)]*\)\s*VALUES\s*\(\s*([^,]+),/gi) ?? [];
    expect(inserts.length, 'hittade ingen journalinsättning att kontrollera').toBeGreaterThan(0);
    for (const ins of inserts) {
      expect(
        /VALUES\s*\(\s*CURRENT_DATE/i.test(ins),
        `journalinsättningen dateras av klockan: ${ins.trim()}`,
      ).toBe(false);
    }

    // Fakturans verifikation dateras av fakturadatumet.
    const invoice = stripComments(bodies.get('book_vendor_invoice')!);
    expect(invoice).toMatch(/COALESCE\(p_entry_date,\s*v_inv\.invoice_date/);
  });

  it('ingen pengaväg i P2P bär ett kontonummer i kroppen', () => {
    const offenders: string[] = [];
    for (const name of P2P_MONEY_PATHS) {
      const body = bodies.get(name);
      expect(body, `${name} saknas i migrationerna`).toBeTruthy();
      const code = stripComments(body!);
      for (const m of code.matchAll(/'(\d{4})'/g)) {
        offenders.push(`${name} → '${m[1]}'`);
      }
    }
    expect(
      offenders,
      'Kontoklassificering hör i kontoplanen. Läs kontot ur account_for(<roll>) i stället för att skriva numret i funktionen.',
    ).toEqual([]);
  });

  it('varje roll som slås upp är seedad för båda levererade paketen', () => {
    const allSql = migrationFiles()
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
      .join('\n');
    const edgeDir = join(root, 'supabase/functions');
    const used = new Set<string>();
    for (const m of allSql.matchAll(/account_for\('([a-z0-9_]+)'\)/g)) used.add(m[1]);
    // Även kanttjänsterna får slå upp roller.
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (e.name.endsWith('.ts')) out.push(p);
      }
      return out;
    };
    for (const f of walk(edgeDir)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/account_for\('([a-z0-9_]+)'\)/g)) used.add(m[1]);
    }

    // Seedade roller per paket, ur INSERT-satserna i migrationerna.
    const seeded = new Map<string, Set<string>>();
    for (const m of allSql.matchAll(/\(\s*'(se-bas2024|ifrs-generic)'\s*,\s*'([a-z0-9_]+)'\s*,\s*'[^']+'/g)) {
      if (!seeded.has(m[1])) seeded.set(m[1], new Set());
      seeded.get(m[1])!.add(m[2]);
    }

    const missing: string[] = [];
    for (const locale of ['se-bas2024', 'ifrs-generic']) {
      for (const role of [...used].sort()) {
        if (!seeded.get(locale)?.has(role)) missing.push(`${locale} saknar rollen "${role}"`);
      }
    }
    expect(
      missing,
      'account_for() är fail-closed: en roll utan mappning kastar och hela postningsvägen dör. Ett paket som kan aktiveras men inte bokföra är inget paket.',
    ).toEqual([]);
  });
});
