/**
 * Migration forward-dating guard (BLOCKING CI gate).
 *
 * ROOT CAUSE THIS PREVENTS
 * ------------------------
 * Every migration ledger — Supabase, Rails, Django, Flyway — tracks the highest
 * version it has applied and SILENTLY SKIPS any migration whose timestamp is
 * below that HEAD (it looks already-passed). So a back-dated migration file gets
 * committed, passes locally on a fresh DB, and is then never applied to any
 * instance already past that timestamp — leaving a stale function/table body.
 * That is exactly the drift class that shipped ar_aging_report, resolve_pricelist_price,
 * normalize_email and the credit-note guard in broken states on the live instance.
 *
 * WHAT THIS ENFORCES
 * ------------------
 * Every migration ADDED on this branch (relative to the merge-base with
 * origin/main) must have a timestamp strictly greater than the highest migration
 * timestamp that already existed at the fork point. Forward-dating makes the
 * back-dated-skip impossible by construction — no discipline required.
 *
 * We compare against the MERGE-BASE, not current origin/main, so a migration
 * that legitimately landed on main in parallel does not falsely flag this
 * branch's own (already-forward-dated-at-authoring-time) migrations.
 *
 * Fails closed only on a real offender; if the base ref / history is unavailable
 * (e.g. a shallow checkout with no common ancestor) it exits 0 with a warning
 * rather than blocking spuriously.
 */
import { execSync } from 'node:child_process';

const MIGRATIONS_DIR = 'supabase/migrations';
const TS_RE = /(\d{14})_/;

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function tsOf(file: string): number | undefined {
  const name = file.split('/').pop() ?? '';
  const m = TS_RE.exec(name);
  return m ? Number(m[1]) : undefined;
}

const baseRef = process.env.BASE_REF || 'origin/main';

let mergeBase: string;
try {
  mergeBase = sh(`git merge-base ${baseRef} HEAD`).trim();
} catch {
  console.warn(`⚠ migration-forward-dated: no merge-base with ${baseRef} available — skipping (not blocking).`);
  process.exit(0);
}

let addedFiles: string[];
let baseFiles: string[];
try {
  // Tracked additions vs the fork point (this is what CI sees — the migration is
  // committed by then), PLUS any not-yet-committed new files (untracked/staged),
  // so the guard has teeth locally and pre-commit too.
  const tracked = sh(`git diff --name-only --diff-filter=A ${mergeBase} -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const untracked = sh(`git ls-files --others --exclude-standard -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter(Boolean);
  addedFiles = [...new Set([...tracked, ...untracked])].filter((f) => f.endsWith('.sql'));
  baseFiles = sh(`git ls-tree -r --name-only ${mergeBase} -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter(Boolean).filter((f) => f.endsWith('.sql'));
} catch (e) {
  console.warn(`⚠ migration-forward-dated: git inspection failed — skipping (not blocking). ${(e as Error).message}`);
  process.exit(0);
}

if (addedFiles.length === 0) {
  console.log('✓ migration-forward-dated: no new migrations on this branch.');
  process.exit(0);
}

const baseMax = baseFiles.reduce((mx, f) => Math.max(mx, tsOf(f) ?? 0), 0);

const offenders = addedFiles
  .map((f) => ({ f, ts: tsOf(f) }))
  .filter((x) => x.ts !== undefined && x.ts <= baseMax) as Array<{ f: string; ts: number }>;

if (offenders.length > 0) {
  console.error(
    '✖ Back-dated migration(s) detected. A migration timestamped at or below the\n' +
    '  highest one already present will be SILENTLY SKIPPED by the migration ledger\n' +
    '  on any instance already past that timestamp — the root cause of function drift.\n'
  );
  for (const { f, ts } of offenders) {
    console.error(`   ${f}\n      timestamp ${ts} ≤ base HEAD ${baseMax}`);
  }
  console.error(
    `\n  Fix: rename each to a timestamp strictly greater than ${baseMax} (use "now",\n` +
    '  e.g. date -u +%Y%m%d%H%M%S) and keep the body idempotent (CREATE OR REPLACE /\n' +
    '  ADD COLUMN IF NOT EXISTS / DROP ... IF EXISTS) so it is safe to (re-)apply everywhere.'
  );
  process.exit(1);
}

console.log(`✓ migration-forward-dated: ${addedFiles.length} new migration(s) all forward-dated (> ${baseMax}).`);
