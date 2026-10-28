#!/usr/bin/env node
// The edge functions had no typechecker at all.
//
// `tsconfig.json` EXCLUDES supabase/functions and CI's only typecheck is
// `tsc -p tsconfig.app.json` (include: src). So 77 edge functions — ~17.7k
// lines in agent-execute/index.ts alone, the execution path of every skill —
// were checked by nothing. tsc cannot check them either: they import from
// `https://deno.land/...`, `https://esm.sh/...` and `npm:` specifiers that
// only Deno resolves. A wrong type there did not turn CI red; it shipped.
//
// Measured on 2026-10-25, the first time anything looked: 91 errors, not
// thousands — among them five implicit-any parameters, a supabase-js version
// skew (2.98.0 in _shared vs 2.87.1 here) and a handful of real nullability
// holes. Cheap to gate, so gated: the committed baseline may only SHRINK.
//
// Same shape as scripts/eslint-ratchet.mjs — scan everything, ratchet a count,
// never enumerate files. Roots are every `*/index.ts` PLUS every file under
// `_shared/`, so shared code no entrypoint imports is still checked (that is
// worth exactly one of the 91).
//
//   node scripts/deno-typecheck.mjs            # check (CI)
//   node scripts/deno-typecheck.mjs --update   # write the current counts as baseline
//
// Flags, each for a reason:
//   --no-lock             deno.lock is committed; resolving npm specifiers
//                         rewrites it (+5618 lines when first measured), so a
//                         CI run would dirty the tree on every build.
//   --node-modules-dir=none  Deno 2 sees the root package.json and, left to
//                         itself, resolves `npm:` specifiers THROUGH the app's
//                         node_modules — `auto` installed the edge functions'
//                         @supabase/supabase-js@2 (2.118.0) over the app's
//                         pinned 2.87.1 and broke `tsc -p tsconfig.app.json`
//                         with 22 errors. `none` keeps everything in Deno's
//                         own cache (DENO_DIR) and writes nothing into the
//                         repo, so this gate cannot disturb the steps after
//                         it.
//
// The gate deliberately keeps its config in scripts/ and writes NOTHING into
// supabase/functions: `scripts/deploy-edge-via-api.sh` reads a per-function
// `deno.json` as that function's import map, and the Supabase CLI reads the
// directory too. Only mcp-server has one, so it gets its own pass with
// `--config`; a second function gaining one is picked up automatically.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = resolve(ROOT, 'src/lib/__tests__/fixtures/deno-typecheck-baseline.json');
const DENO = process.env.DENO_BIN || 'deno';
const update = process.argv.includes('--update');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Entrypoints + all shared files, grouped by the config they need. */
function roots() {
  const fnDir = resolve(ROOT, 'supabase/functions');
  const plain = [];
  const configured = []; // [{ config, root }]
  for (const entry of readdirSync(fnDir)) {
    const dir = join(fnDir, entry);
    if (!statSync(dir).isDirectory() || entry === '_shared') continue;
    const index = join(dir, 'index.ts');
    if (!existsSync(index)) continue;
    const ownConfig = ['deno.json', 'deno.jsonc'].map((f) => join(dir, f)).find(existsSync);
    if (ownConfig) configured.push({ config: ownConfig, root: index });
    else plain.push(index);
  }
  const shared = join(fnDir, '_shared');
  if (existsSync(shared)) plain.push(...walk(shared));
  return { plain, configured };
}

/**
 * Deno prints an error as `TS1234 [ERROR]: …`, a code frame, then one or more
 * `    at file:///abs/path.ts:line:col` lines. One header is one error (the
 * header count matches Deno's own `Found N errors.`), and the FIRST location
 * after it is where it lives; the later ones are the related types.
 *
 * Returns one identity per error so the caller can dedupe across passes:
 * mcp-server imports _shared, so its pass re-reports the same shared-code
 * errors the main pass already saw — counting both would make fixing one
 * error drop the number by two.
 */
function parse(output) {
  const errors = [];
  let pending = null;
  for (const line of output.split('\n')) {
    const head = line.match(/^(TS\d+) \[ERROR\]/);
    if (head) { pending = head[1]; continue; }
    if (!pending) continue;
    const at = line.match(/^\s*at (\S+?):(\d+):(\d+)$/);
    if (!at) continue;
    const [, loc, ln, col] = at;
    let file = 'external';
    if (loc.startsWith('file://')) {
      const abs = decodeURIComponent(loc.slice('file://'.length));
      const rel = relative(ROOT, abs);
      file = rel.startsWith('..') ? 'external' : rel;
    }
    errors.push({ id: `${pending}:${file}:${ln}:${col}`, file });
    pending = null;
  }
  // Deno's own total, as a cross-check that nothing was missed.
  const found = output.match(/^Found (\d+) errors?\./m);
  return { errors, reported: found ? Number(found[1]) : errors.length };
}

function run(args) {
  try {
    execFileSync(DENO, args, {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' },
    });
    return '';
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(
        'deno-typecheck: deno not found. CI installs it with denoland/setup-deno; ' +
        'locally: curl -fsSL https://deno.land/install.sh | sh (or set DENO_BIN).',
      );
      process.exit(2);
    }
    // `deno check` exits non-zero when it reports errors — the report is the output.
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

const COMMON = ['check', '--no-lock', '--node-modules-dir=none'];
const { plain, configured } = roots();
if (plain.length === 0) { console.error('deno-typecheck: found no edge functions to check'); process.exit(2); }

const seen = new Set();
const perFile = {};
for (const out of [
  run([...COMMON, ...plain]),
  ...configured.map(({ config, root }) => run([...COMMON, '--config', config, root])),
]) {
  const { errors, reported } = parse(out);
  if (errors.length !== reported) {
    console.error(
      `deno-typecheck: attributed ${errors.length} of ${reported} errors Deno reported — ` +
      `the output format changed and this gate would under-count. Fix the parser.`,
    );
    process.exit(2);
  }
  for (const { id, file } of errors) {
    if (seen.has(id)) continue; // same error, seen via another root
    seen.add(id);
    perFile[file] = (perFile[file] ?? 0) + 1;
  }
}
const total = seen.size;

if (update) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ errors: total, files: perFile }, null, 2) + '\n');
  console.log(`deno-typecheck: baseline written — ${total} errors across ${Object.keys(perFile).length} files`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error(`deno-typecheck: no baseline at ${relative(ROOT, BASELINE_PATH)} — write one with --update`);
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const grew = Object.entries(perFile)
  .filter(([file, n]) => n > (baseline.files[file] ?? 0))
  .map(([file, n]) => `  ${file}: ${n} (baseline ${baseline.files[file] ?? 0})`);

if (grew.length) {
  console.error(
    `✗ deno-typecheck: errors grew in ${grew.length} file(s) — the number may only shrink:\n${grew.join('\n')}\n\n` +
    `Nothing else typechecks supabase/functions, so this gate is the only thing between a wrong\n` +
    `type here and production. Reproduce locally:\n  node scripts/deno-typecheck.mjs`,
  );
  process.exit(1);
}
if (total > baseline.errors) {
  console.error(`✗ deno-typecheck: ${total} errors, baseline ${baseline.errors} — the number may only shrink.`);
  process.exit(1);
}
if (total < baseline.errors) {
  console.log(
    `✓ deno-typecheck: ${total} errors, baseline ${baseline.errors} — you removed ${baseline.errors - total}. ` +
    `Keep the gain: node scripts/deno-typecheck.mjs --update (and commit the baseline).`,
  );
} else {
  console.log(`✓ deno-typecheck: ${total} errors, no file above its baseline.`);
}
