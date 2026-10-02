/**
 * Re-date the migrations this branch adds so they sort after main's head.
 *
 *   npm run migrations:redate            # rename + update every reference
 *   npm run migrations:redate -- --dry-run
 *
 * WHY THE RULE EXISTS (and it is not Lovable any more)
 * ---------------------------------------------------
 * The fleet rail is `supabase db push` (scripts/flowwink.sh, deploy-fleet.sh).
 * Given a pending migration dated BELOW the remote's newest applied version the
 * CLI does not skip it and does not apply it — it stops the whole push:
 *
 *   "Found local migration files to be inserted before the last migration on
 *    remote database. Rerun the command with --include-all flag to apply these
 *    migrations"
 *
 * So one back-dated file blocks every deploy until someone adds a flag by hand.
 * The Supabase GitHub integration the forks deploy through applies on push and
 * its handling of the same case is unverified. And a fresh install applies by
 * filename order while a live instance applies by arrival order — the two agree
 * only when every new file sorts after everything already applied. The guard
 * (scripts/check-migration-forward-dated.ts) enforces that; this script does
 * the chore it used to leave to a person: #313 was re-dated 27 times across 84
 * merges, #532 twelve times, each a rename plus every reference to the name.
 *
 * WHAT IT DOES
 * ------------
 * 1. Finds the migrations ADDED on this branch (vs. the merge-base with
 *    origin/main) whose timestamp is at or below the base head — the same
 *    definition the guard uses.
 * 2. Gives each a new timestamp: max(now UTC, head + 1 s), consecutive seconds,
 *    original relative order preserved.
 * 3. `git mv` + rewrites every tracked file that names the old filename (tests
 *    that pin a migration, the hand-rolled-role-policies baseline, docs).
 *
 * Bodies are untouched. Version-only references (the bare 14 digits) are
 * reported, not rewritten — they are rare and usually mean something else.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const MIGRATIONS_DIR = 'supabase/migrations';
const TS_RE = /^(\d{14})_/;

export function tsOf(file: string): number | undefined {
  const m = TS_RE.exec(file.split('/').pop() ?? '');
  return m ? Number(m[1]) : undefined;
}

export function tsToDate(ts: number): Date {
  const s = String(ts).padStart(14, '0');
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)));
}

export function dateToTs(d: Date): number {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return Number(`${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`);
}

export interface Redate { from: string; to: string; oldTs: number; newTs: number }

/**
 * Pure: which added files move, and to what. `now` is a 14-digit UTC timestamp.
 * Offenders keep their relative order and get consecutive seconds starting at
 * max(now, baseMax + 1 s), so two files never share a version and both sort
 * after the head — whatever the clock says.
 */
export function planRedates(added: string[], baseMax: number, now: number): Redate[] {
  const offenders = added
    .map((f) => ({ f, ts: tsOf(f) }))
    .filter((x): x is { f: string; ts: number } => x.ts !== undefined && x.ts <= baseMax)
    .sort((a, b) => a.ts - b.ts || a.f.localeCompare(b.f));
  if (!offenders.length) return [];
  let cursor = tsToDate(Math.max(now, baseMax));
  if (dateToTs(cursor) <= baseMax) cursor = new Date(cursor.getTime() + 1000);
  const out: Redate[] = [];
  for (const { f, ts } of offenders) {
    const newTs = dateToTs(cursor);
    const base = f.split('/').pop()!;
    out.push({ from: f, to: f.slice(0, f.length - base.length) + base.replace(TS_RE, `${newTs}_`), oldTs: ts, newTs });
    cursor = new Date(cursor.getTime() + 1000);
  }
  return out;
}

const ROOT = resolve(import.meta.dirname ?? __dirname, '..');
const git = (args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

function discover(baseRef: string): { added: string[]; baseMax: number } {
  const mergeBase = git(['merge-base', baseRef, 'HEAD']);
  const tracked = lines(git(['diff', '--no-renames', '--name-only', '--diff-filter=A', mergeBase, '--', MIGRATIONS_DIR]));
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard', '--', MIGRATIONS_DIR]));
  const added = [...new Set([...tracked, ...untracked])].filter((f) => f.endsWith('.sql'));
  const deleted = new Set(lines(git(['diff', '--no-renames', '--name-only', '--diff-filter=D', mergeBase, '--', MIGRATIONS_DIR])));
  const baseFiles = lines(git(['ls-tree', '-r', '--name-only', mergeBase, '--', MIGRATIONS_DIR])).filter((f) => f.endsWith('.sql') && !deleted.has(f));
  const baseMax = baseFiles.reduce((mx, f) => Math.max(mx, tsOf(f) ?? 0), 0);
  return { added, baseMax };
}

if (typeof process !== 'undefined' && process.argv[1] && /redate-migrations/.test(process.argv[1])) {
  const dryRun = process.argv.includes('--dry-run');
  const baseRef = process.env.BASE_REF || 'origin/main';
  const { added, baseMax } = discover(baseRef);
  const plan = planRedates(added, baseMax, dateToTs(new Date()));
  if (!plan.length) {
    console.log(`✓ migrations:redate — nothing to do (${added.length} added, base head ${baseMax}).`);
    process.exit(0);
  }
  console.log(`${dryRun ? 'Would re-date' : 'Re-dating'} ${plan.length} migration(s) past base head ${baseMax}:`);
  for (const r of plan) console.log(`  ${r.from.split('/').pop()}\n    → ${r.to.split('/').pop()}`);

  // Every tracked file that names an old filename (never the migration itself —
  // a migration does not name itself, and bodies stay byte-identical).
  const rewrites = new Map<string, string>();
  for (const r of plan) {
    const oldBase = r.from.split('/').pop()!;
    const newBase = r.to.split('/').pop()!;
    let hits: string[] = [];
    try { hits = lines(git(['grep', '-l', '-F', oldBase, '--', '.', `:!${r.from}`])); } catch { /* no hits → exit 1 */ }
    for (const h of hits) {
      const cur = rewrites.get(h) ?? readFileSync(join(ROOT, h), 'utf8');
      rewrites.set(h, cur.split(oldBase).join(newBase));
    }
    let bare: string[] = [];
    try { bare = lines(git(['grep', '-l', '-F', String(r.oldTs), '--', '.', `:!${r.from}`, `:!${MIGRATIONS_DIR}`])).filter((h) => !hits.includes(h)); } catch { /* none */ }
    if (bare.length) console.log(`  ⚠ bare version ${r.oldTs} also appears in (not rewritten): ${bare.join(', ')}`);
  }
  if (rewrites.size) {
    console.log(`References updated in ${rewrites.size} file(s):`);
    for (const f of rewrites.keys()) console.log(`  ${f}`);
  }
  if (dryRun) process.exit(0);

  for (const r of plan) {
    const isTracked = (() => { try { git(['ls-files', '--error-unmatch', r.from]); return true; } catch { return false; } })();
    if (isTracked) git(['mv', r.from, r.to]);
    else execFileSync('mv', [r.from, r.to], { cwd: ROOT });
  }
  for (const [f, content] of rewrites) writeFileSync(join(ROOT, f), content);
  console.log('\nDone. Review `git status`, then commit. The instance manifest is rebuilt by CI (scripts/generated-artifacts.ts);\nif this checkout predates that rule, run: npm run manifest:json');
}
