/**
 * Doc-drift guardrail
 *
 * Five checks:
 *   1. every registered module has a docs/modules/<id>.md
 *   2. every relative markdown link inside docs/ resolves to a real file
 *   3. every repo path a doc names in backticks (src/, supabase/, scripts/, api/,
 *      docs/, public/) exists — a doc that names a file is making a claim about
 *      the tree, and the 2026-10-29 sweep found eleven that pointed at functions
 *      and bootstraps retired in July
 *   4. every command a doc gives (`npm run <script>`, `bun run scripts/<file>`)
 *      exists
 *   5. every doc carries the front matter the docs portal reads (title,
 *      description, category) — `bun run scripts/normalize-doc-frontmatter.ts
 *      --write` derives it
 *
 * (2) exists because deleting a stale doc silently breaks the links pointing at
 * it, and a docs tree full of dead links is worse than a smaller honest one.
 * (3) and (4) discover rather than enumerate: they scan every doc for the SHAPE
 * of a claim instead of checking a list of files someone thought of.
 *
 * Run via `bun run scripts/check-doc-drift.ts` (`npm run check:doc-drift`). CI
 * runs it hard-failing since 2026-10-29; --warn keeps it advisory locally.
 *
 * Exit codes:
 *   0  — no drift (or --warn and only warnings)
 *   1  — hard drift detected and --warn not set
 */
// @ts-nocheck

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, localStorage: (globalThis as any).localStorage };

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const { getAllUnifiedModules } = await import(resolve(repoRoot, 'src/lib/module-def.ts'));
await import(resolve(repoRoot, 'src/lib/modules/index.ts'));

const warnOnly = process.argv.includes('--warn');

const docsDir = resolve(repoRoot, 'docs/modules');
const missing: string[] = [];
const present: string[] = [];

// Common alias map — some module ids don't 1:1 match doc filenames.
const docAliases: Record<string, string[]> = {
  customer360: ['customer360.md', 'customer-360.md'],
  bookings: ['bookings.md', 'booking.md'],
  workspaceChat: ['workspace-chat.md'],
  fieldService: ['field-service.md'],
  globalBlocks: ['global-elements.md', 'global-blocks.md'],
  globalElements: ['global-elements.md'],
  companyInsights: ['company-insights.md'],
  liveSupport: ['live-support.md'],
  fixedAssets: ['fixed-assets.md'],
  multiCurrency: ['multi-currency.md'],
  knowledgeBase: ['knowledge-base.md', 'kb.md'],
  kb: ['knowledge-base.md', 'kb.md'],
  salesIntelligence: ['sales-intelligence.md'],
  siteMigration: ['site-migration.md'],
  browserControl: ['browser-control.md'],
};

for (const mod of getAllUnifiedModules()) {
  const id = mod.id as string;
  const candidates = docAliases[id] ?? [`${id}.md`, `${id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.md`];
  const found = candidates.some((c) => existsSync(resolve(docsDir, c)));
  if (found) present.push(id);
  else missing.push(`${id}  (looked for: ${candidates.join(', ')})`);
}

console.log(`✓ ${present.length} modules have docs`);

// --- 2. dead relative links -------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

const deadLinks: string[] = [];
const docsRoot = resolve(repoRoot, 'docs');
for (const file of walk(docsRoot)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\]\((\.[^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
    const target = resolve(dirname(file), m[1]);
    if (!existsSync(target)) {
      deadLinks.push(`${relative(repoRoot, file)} → ${m[1]}`);
    }
  }
}

if (deadLinks.length === 0) console.log('✓ No dead relative links in docs/');

// --- 3. repo paths named in backticks must exist ---------------------------
// Only literal paths: the character class admits no <name>, [Name], * or …, so
// a pattern is never read as a claim. A few files are local-only by design.
const LOCAL_ONLY = new Set(['scripts/fleet.local.json', 'supabase/.env', '.env.local']);
const missingPaths: string[] = [];
for (const file of walk(docsRoot)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/`((?:src|supabase|scripts|api|docs|public)\/[A-Za-z0-9_./-]+)`/g)) {
    const p = m[1].replace(/\/$/, '');
    if (LOCAL_ONLY.has(p)) continue;
    if (!existsSync(resolve(repoRoot, p))) missingPaths.push(`${relative(repoRoot, file)} → ${m[1]}`);
  }
}
if (missingPaths.length === 0) console.log('✓ Every repo path named in docs/ exists');

// --- 4. commands named in docs must exist ------------------------------------
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const missingCmds: string[] = [];
for (const file of walk(docsRoot)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/npm run ([a-z][a-z0-9:_-]*)(\*?)/g)) {
    if (m[2] === '*') continue; // `npm run test:*-regression` is a family, not a script
    const name = m[1].replace(/:$/, '');
    if (!pkg.scripts[name]) missingCmds.push(`${relative(repoRoot, file)} → npm run ${name}`);
  }
  for (const m of text.matchAll(/\b(?:bun|tsx|node|bash|sh)\s+(?:run\s+)?(scripts\/[A-Za-z0-9_./-]+\.(?:ts|js|mjs|sh))/g)) {
    if (!existsSync(resolve(repoRoot, m[1]))) missingCmds.push(`${relative(repoRoot, file)} → ${m[1]}`);
  }
}
if (missingCmds.length === 0) console.log('✓ Every command named in docs/ exists');

// --- 5. front matter the docs portal reads -----------------------------------
// Admin → Docs lists title/description/category from front matter; a file
// without it showed up as its filename with no summary. The normaliser derives
// all three; this only asks that it was run.
const missingFrontMatter: string[] = [];
for (const file of walk(docsRoot)) {
  const text = readFileSync(file, 'utf8');
  const fm = text.startsWith('---\n') ? text.slice(4, text.indexOf('\n---', 4)) : '';
  const lacks = ['title:', 'description:', 'category:'].filter((k) => !new RegExp(`^${k}`, 'm').test(fm));
  if (lacks.length) missingFrontMatter.push(`${relative(repoRoot, file)} (missing ${lacks.join(', ')})`);
}
if (missingFrontMatter.length === 0) console.log('✓ Every doc carries title/description/category front matter');

// --- verdict -----------------------------------------------------------------
const tag = warnOnly ? '⚠ ' : '✗ ';
const sections: Array<[string, string[]]> = [
  ['module(s) missing docs/modules/<id>.md', missing],
  ['dead link(s) in docs/', deadLinks],
  ['repo path(s) named in docs/ that do not exist', missingPaths],
  ['command(s) named in docs/ that do not exist', missingCmds],
  ['doc(s) without portal front matter — run `bun run scripts/normalize-doc-frontmatter.ts --write`', missingFrontMatter],
];
let drift = 0;
for (const [label, items] of sections) {
  if (items.length === 0) continue;
  drift += items.length;
  console.log(`${tag}${items.length} ${label}:`);
  for (const i of items) console.log(`   - ${i}`);
}
if (drift === 0) {
  console.log('✓ No doc drift detected');
  process.exit(0);
}
if (warnOnly) {
  console.log('\n(running with --warn — exiting 0)');
  process.exit(0);
}
process.exit(1);
