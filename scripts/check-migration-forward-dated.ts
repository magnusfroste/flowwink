/**
 * Migration forward-dating guard (BLOCKING CI gate).
 *
 * ROOT CAUSE THIS PREVENTS (verified 2026-10-02, R3 of #605)
 * ----------------------------------------------------------
 * The fleet rail is `supabase db push` (scripts/flowwink.sh, deploy-fleet.sh).
 * Given a pending local migration dated BELOW the remote's newest applied
 * version, the CLI neither skips nor applies it — it refuses the whole push:
 *
 *   "Found local migration files to be inserted before the last migration on
 *    remote database. Rerun the command with --include-all flag to apply these
 *    migrations"
 *
 * One back-dated file therefore blocks every fleet deploy until a person adds a
 * flag by hand — and with the flag, the file applies on live instances AFTER
 * everything already there while a fresh install applies it by filename order,
 * so the two orders diverge exactly where a dependency might hide. The Supabase
 * GitHub integration the forks deploy through applies on push; its handling of
 * a back-dated file is unverified, which is one more reason not to produce one.
 * (The earlier wording here blamed a managed ledger that "silently skipped" —
 * that runner is retired; the CLI's behaviour above is the rule's reason now.)
 *
 * The same rule was once also hit by hand-rolled drift: ar_aging_report,
 * resolve_pricelist_price, normalize_email and the credit-note guard shipped
 * stale bodies from back-dated files.
 *
 * THE CHORE IS A COMMAND, NOT A PERSON
 * ------------------------------------
 * main moves between a PR's first commit and its merge, so a legitimately
 * forward-dated file goes stale (#313: 27 re-datings over 84 merges). Run
 *   npm run migrations:redate
 * (scripts/redate-migrations.ts): it renames every offending file past the base
 * head and rewrites every reference to the old name.
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
 * SECOND FAILURE MODE: VERSION COLLISION BETWEEN SIBLINGS
 * -------------------------------------------------------
 * Forward-dating alone is not enough. Two branches cut from the SAME fork point
 * can each pick the same 14-digit timestamp, and each passes the check above —
 * because each is compared only against its own merge-base, where the other
 * sibling does not yet exist. (Observed 2026-08-24: PR #261 and PR #265 both
 * added `20260828120000_*.sql`; both went green.)
 *
 * A shared timestamp is not a cosmetic clash. The ledger's identity IS the
 * version — `supabase_migrations.schema_migrations.version` — so the second file
 * to be applied looks already-applied and is SILENTLY SKIPPED. Exactly the same
 * outcome as back-dating, arrived at from the other direction.
 *
 * Worse, it is invisible downstream: `instance-readiness.ts` matches an expected
 * migration when `versions.has(m.version) || names.has(m.name)`, so ONE applied
 * file satisfies BOTH expected entries and the instance reports "all migrations
 * applied" while one of them never ran.
 *
 * So we additionally reject any version shared by two different filenames in the
 * post-merge state (origin/main ∪ this branch), and only when this branch is the
 * one introducing the clash — a pre-existing clash on main must not block every
 * unrelated PR.
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
  // --no-renames: a rename must be seen as delete+add, or a file renamed TO a
  // back-dated name would slip past the A-filter as status R.
  const tracked = sh(`git diff --no-renames --name-only --diff-filter=A ${mergeBase} -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const untracked = sh(`git ls-files --others --exclude-standard -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter(Boolean);
  addedFiles = [...new Set([...tracked, ...untracked])].filter((f) => f.endsWith('.sql'));
  // Files DELETED on this branch no longer define the forward horizon: a
  // rename (delete+add) of the ledger head must compare new files against the
  // head that will exist AFTER the branch merges, not the one it removes.
  // (Discovered when the fresh-install finalizer moved from the 99999999999999
  // sentinel to a real timestamp — the sentinel it deleted was the baseMax.)
  const deleted = new Set(
    sh(`git diff --no-renames --name-only --diff-filter=D ${mergeBase} -- ${MIGRATIONS_DIR}`)
      .split('\n').map((s) => s.trim()).filter(Boolean),
  );
  baseFiles = sh(`git ls-tree -r --name-only ${mergeBase} -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => f.endsWith('.sql') && !deleted.has(f));
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
    '  highest one already present makes `supabase db push` refuse the whole deploy\n' +
    '  ("insert before the last migration on remote … --include-all") on every instance\n' +
    '  already past that timestamp.\n'
  );
  for (const { f, ts } of offenders) {
    console.error(`   ${f}\n      timestamp ${ts} ≤ base HEAD ${baseMax}`);
  }
  console.error(
    `\n  Fix: npm run migrations:redate — renames each past ${baseMax} and rewrites every\n` +
    '  reference to the old filename (tests, the role-policy baseline, docs). Keep the body\n' +
    '  idempotent (CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS / DROP ... IF EXISTS).'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Version-collision guard (see SECOND FAILURE MODE above).
//
// Post-merge state = every migration basename on origin/main plus every one on
// this branch. Deduping by BASENAME first is what makes self-comparison
// impossible: a file already merged to main appears once, not twice.
// ---------------------------------------------------------------------------
const baseName = (f: string) => f.split('/').pop() ?? '';

let postMerge: Set<string>;
try {
  // Files DELETED on this branch are not part of the post-merge state. Without
  // this, a legitimate in-place rename (delete old name + add new name, SAME
  // version) reads as two files claiming one version — main still holds the
  // old name until the merge lands. Found by this guard's own audit on
  // 2026-08-24, one day after it shipped; the forward-dating check above has
  // handled the identical case via --diff-filter=D since the sentinel rename.
  const deletedOnBranch = new Set(
    sh(`git diff --no-renames --name-only --diff-filter=D ${mergeBase} -- ${MIGRATIONS_DIR}`)
      .split('\n').map((s) => s.trim()).filter(Boolean).map((f) => f.split('/').pop() ?? ''),
  );
  const onMain = sh(`git ls-tree -r --name-only ${baseRef} -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter((f) => f.endsWith('.sql'))
    .filter((f) => !deletedOnBranch.has(f.split('/').pop() ?? ''));
  const onBranch = sh(`git ls-tree -r --name-only HEAD -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter((f) => f.endsWith('.sql'));
  const untrackedNow = sh(`git ls-files --others --exclude-standard -- ${MIGRATIONS_DIR}`)
    .split('\n').map((s) => s.trim()).filter((f) => f.endsWith('.sql'));
  postMerge = new Set([...onMain, ...onBranch, ...untrackedNow].map(baseName));
} catch (e) {
  console.warn(`⚠ migration-version-collision: git inspection failed — skipping (not blocking). ${(e as Error).message}`);
  process.exit(0);
}

const byVersion = new Map<number, string[]>();
for (const name of postMerge) {
  const ts = tsOf(name);
  if (ts === undefined) continue;
  const bucket = byVersion.get(ts);
  if (bucket) bucket.push(name);
  else byVersion.set(ts, [name]);
}

// Only clashes this branch is responsible for. A clash already sitting on main
// is main's problem, not this PR's — blocking here would stop every unrelated
// branch and teach everyone to ignore the gate.
const addedNames = new Set(addedFiles.map(baseName));
const clashes = [...byVersion.entries()]
  .filter(([, names]) => names.length > 1 && names.some((n) => addedNames.has(n)))
  .map(([ts, names]) => ({ ts, names: names.sort() }));

if (clashes.length > 0) {
  console.error(
    '✖ Migration version collision. Two files share one 14-digit timestamp, and\n' +
    '  that timestamp IS the ledger\'s primary key — whichever applies second looks\n' +
    '  already-applied and is SILENTLY SKIPPED. The readiness check cannot see it\n' +
    '  either: one applied file satisfies both expected entries, so the instance\n' +
    '  reports "all migrations applied" while one of them never ran.\n'
  );
  for (const { ts, names } of clashes) {
    console.error(`   version ${ts} claimed by ${names.length} files:`);
    for (const n of names) console.error(`      ${n}`);
  }
  console.error(
    '\n  Fix: re-timestamp the file(s) added on THIS branch to a fresh, unique value\n' +
    '  (date -u +%Y%m%d%H%M%S), keeping it strictly greater than the base HEAD.'
  );
  process.exit(1);
}

console.log(
  `✓ migration-forward-dated: ${addedFiles.length} new migration(s) all forward-dated (> ${baseMax}), ` +
  `no version collisions across ${postMerge.size} post-merge migration(s).`,
);
