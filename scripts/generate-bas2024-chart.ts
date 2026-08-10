/**
 * Generate src/data/bas2024-accounts.ts from the official BAS 2024 workbook.
 *
 * Why the whole standard and not a selection: a Swedish company may post to any
 * BAS account, and every account we DON'T ship is a wall a migrating company
 * hits — LiteIT's own history needed six of them (1351, 1640, 2081, 2086, 2098,
 * 8314), all perfectly ordinary BAS accounts we simply hadn't shipped. Reference
 * data should be complete; what varies per company is which accounts they USE.
 *
 * That is what is_active means from now on: not "exists" but "this company uses
 * it". BAS's own ■ marking (341 core accounts) starts active, the rest ship
 * inactive-but-present, and posting to an account activates it. Pickers, the
 * balance-sheet classifier and manage_chart_of_accounts list all filter
 * is_active already, so the short chart stays short.
 *
 * WHAT IS TAKEN VERBATIM and what is derived:
 *   - account_code, account_name — verbatim from the workbook. Never edited.
 *   - account_category — the reviewed category where one exists (63 of the
 *     two-digit groups), otherwise BAS's OWN group-account name (e.g. 5100
 *     "Fastighetskostnader (gruppkonto)" → "Fastighetskostnader"). Still the
 *     standard's words, not ours.
 *   - account_type, normal_balance — DERIVED. The workbook does not publish
 *     them. Existing reviewed values always win; new accounts get the class
 *     rule plus a name rule for the two cases where the class is misleading
 *     (accumulated depreciation is a credit asset; class 8 mixes income and
 *     cost). A contra account we get wrong reads as its class until someone
 *     corrects it — which is why this is stated here rather than assumed.
 *
 * Run: bun run scripts/generate-bas2024-chart.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const official = JSON.parse(
  readFileSync(resolve(ROOT, 'src/data/locale-sources/bas-2024-official.json'), 'utf8'),
);
const BAS: Record<string, { name: string; core: boolean }> = official.accounts;

// ── What we already ship, with its reviewed classification ──────────────────
const current = readFileSync(resolve(ROOT, 'src/data/bas2024-accounts.ts'), 'utf8');
type Row = { code: string; name: string; type: string; cat: string; nb: string };
const reviewed = new Map<string, Row>();
const RE = /\{ account_code: '(\d+)', account_name: '((?:[^'\\]|\\.)*)', account_type: '(\w+)', account_category: '((?:[^'\\]|\\.)*)', normal_balance: '(\w+)'/g;
for (const m of current.matchAll(RE)) {
  reviewed.set(m[1], { code: m[1], name: m[2], type: m[3], cat: m[4], nb: m[5] });
}

// ── Category per two-digit group ────────────────────────────────────────────
const groupCat = new Map<string, string>();
for (const r of reviewed.values()) {
  if (!groupCat.has(r.code.slice(0, 2))) groupCat.set(r.code.slice(0, 2), r.cat);
}
const CLASS_CAT: Record<string, string> = {
  '1': 'Tillgångar', '2': 'Eget kapital och skulder', '3': 'Rörelsens inkomster/intäkter',
  '4': 'Utgifter/kostnader för varor, material och vissa köpta tjänster',
  '5': 'Övriga externa rörelseutgifter/kostnader', '6': 'Övriga externa rörelseutgifter/kostnader',
  '7': 'Utgifter/kostnader för personal, avskrivningar m.m.',
  '8': 'Finansiella och andra inkomster/intäkter och utgifter/kostnader',
};
function categoryFor(code: string): string {
  const g = code.slice(0, 2);
  const own = groupCat.get(g);
  if (own) return own;
  // BAS names its own group accounts (XX00). Use the standard's word for it.
  const group = BAS[`${g}00`]?.name;
  if (group) return group.replace(/\s*\(gruppkonto\)\s*$/, '').trim();
  return CLASS_CAT[code[0]] ?? 'Övrigt';
}

// ── Type and normal balance ─────────────────────────────────────────────────
const CONTRA = /^(Ackumulerade av|Ackumulerade ned|Ack\.? av|Ack\.? ned)/i;
const COSTISH = /kostnad|nedskrivning|förlust|skatt|avgift|räntekostnad/i;
function classify(code: string, name: string): { type: string; nb: string } {
  if (CONTRA.test(name)) return { type: 'asset', nb: 'credit' };       // contra asset
  const c = code[0];
  if (c === '1') return { type: 'asset', nb: 'debit' };
  if (c === '2') return code < '2100'
    ? { type: 'equity', nb: 'credit' }
    : { type: 'liability', nb: 'credit' };
  if (c === '3') return { type: 'revenue', nb: 'credit' };
  if (c >= '4' && c <= '7') return { type: 'expense', nb: 'debit' };
  // Class 8 holds both financial income and financial cost; the name is the
  // only signal the workbook gives.
  return COSTISH.test(name) ? { type: 'expense', nb: 'debit' } : { type: 'revenue', nb: 'credit' };
}

// ── Build ───────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const codes = new Set([...Object.keys(BAS), ...reviewed.keys()]);
const rows = [...codes].sort().map((code) => {
  const r = reviewed.get(code);
  const inBas = BAS[code];
  const name = inBas ? inBas.name : r!.name;                 // standard wins on names
  const derived = classify(code, name);
  return {
    code,
    name,
    type: r?.type ?? derived.type,                            // reviewed wins
    cat: r?.cat ?? categoryFor(code),
    nb: r?.nb ?? derived.nb,
    // Active = this company uses it. Core per BAS's ■, plus everything we
    // already shipped (instances have posted to those, including the 40 codes
    // BAS does not have at all).
    active: Boolean(inBas?.core) || reviewed.has(code),
    legacy: !inBas,
  };
});

const activeCount = rows.filter((r) => r.active).length;
let out = `/**
 * BAS 2024 Chart of Accounts — the WHOLE standard, ${rows.length} accounts.
 *
 * GENERATED. Do not hand-edit: run \`bun run scripts/generate-bas2024-chart.ts\`,
 * which reads src/data/locale-sources/bas-2024-official.json (sha256-verified
 * against the workbook BAS publishes). This file used to be a hand-written
 * selection of 269 called "BAS 2024", and 166 of its names were wrong before
 * anyone compared them.
 *
 * is_active is not "exists" — it is "this company uses it". ${activeCount} accounts
 * start active (BAS's own ■ core set, plus everything we shipped before);
 * the rest are present but out of the way, and posting to one activates it.
 * Pickers, the balance-sheet classifier and manage_chart_of_accounts list all
 * filter is_active, so a company still sees a short chart.
 *
 * ${rows.filter((r) => r.legacy).length} codes here are NOT in BAS 2024. They are kept because instances have
 * posted to them (3011, 3041, …) and an account with history must not vanish.
 * They are listed in KNOWN_NOT_IN_BAS in bas2024-chart.guardrails.test.ts and
 * that list may only shrink.
 */
export const BAS_2024_ACCOUNTS = [
`;
let lastClass = '';
for (const r of rows) {
  if (r.code[0] !== lastClass) {
    lastClass = r.code[0];
    out += `  // ── ${lastClass}xxx — ${CLASS_CAT[lastClass] ?? ''} ──\n`;
  }
  out += `  { account_code: '${r.code}', account_name: '${esc(r.name)}', account_type: '${r.type}', account_category: '${esc(r.cat)}', normal_balance: '${r.nb}', is_active: ${r.active}, locale: 'se-bas2024' },\n`;
}
out += '];\n';
writeFileSync(resolve(ROOT, 'src/data/bas2024-accounts.ts'), out);
console.log(`✅ ${rows.length} konton (${activeCount} aktiva, ${rows.length - activeCount} vilande, ${rows.filter((r) => r.legacy).length} utanför BAS)`);
