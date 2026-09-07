#!/usr/bin/env node
// ESLint as a ratchet, not a bulletin.
//
// `npm run lint` reports ~3500 findings (97% no-explicit-any) and CI ran it
// as an advisory step nobody read — a minute per build spent printing a number
// that could only grow. This turns the number into a guard: the committed
// baseline (src/lib/__tests__/fixtures/eslint-baseline.json) may only SHRINK.
// More findings than the baseline fails the build and names the files that
// grew; fewer findings asks you to lower the baseline so the gain is kept.
// Same shape as the hardcoded-visitor-text guard: scan everything, ratchet a
// count, never enumerate files.
//
//   node scripts/eslint-ratchet.mjs            # check (CI)
//   node scripts/eslint-ratchet.mjs --update   # write the current counts as baseline
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = resolve(ROOT, 'src/lib/__tests__/fixtures/eslint-baseline.json');
const update = process.argv.includes('--update');

let raw;
try {
  raw = execFileSync('npx', ['eslint', '.', '-f', 'json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
} catch (e) {
  // eslint exits 1 when there are errors — the JSON is still on stdout.
  raw = e.stdout?.toString() ?? '';
  if (!raw.trim().startsWith('[')) { console.error('eslint-ratchet: eslint produced no JSON'); process.exit(2); }
}
const results = JSON.parse(raw);
const perFile = {};
let errors = 0, warnings = 0;
for (const f of results) {
  errors += f.errorCount; warnings += f.warningCount;
  const n = f.errorCount + f.warningCount;
  if (n) perFile[f.filePath.slice(ROOT.length + 1)] = n;
}
const current = { errors, warnings, files: perFile };

if (update) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ errors, warnings, files: perFile }, null, 2) + '\n');
  console.log(`eslint-ratchet: baseline written — ${errors} errors, ${warnings} warnings across ${Object.keys(perFile).length} files`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const grew = Object.entries(perFile)
  .filter(([file, n]) => n > (baseline.files[file] ?? 0))
  .map(([file, n]) => `  ${file}: ${n} (baseline ${baseline.files[file] ?? 0})`);

if (grew.length) {
  console.error(`✗ eslint-ratchet: findings grew in ${grew.length} file(s) — the number may only shrink:\n${grew.join('\n')}`);
  process.exit(1);
}
const total = errors + warnings, base = baseline.errors + baseline.warnings;
if (total < base) {
  console.log(`✓ eslint-ratchet: ${total} findings, baseline ${base} — you removed ${base - total}. Keep the gain: node scripts/eslint-ratchet.mjs --update (and commit the baseline).`);
} else {
  console.log(`✓ eslint-ratchet: ${total} findings, no file above its baseline.`);
}
