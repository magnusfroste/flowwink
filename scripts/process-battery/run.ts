/**
 * Process battery — runner.
 *
 *   bun run scripts/process-battery/run.ts                 every process
 *   bun run scripts/process-battery/run.ts return-to-refund quote-to-cash
 *
 *   bun run scripts/process-battery/run.ts --update-known-red
 *
 * Scenarios are DISCOVERED from docs/processes/*.md: a process doc without a
 * scenario is reported as owed, never silently absent.
 *
 * last-green.json is the pulse. A FULL run that held the ratchet (every
 * process, exit 0, no --update-known-red) stamps it with when and on which
 * commit. The suite's pulse guard goes red when the stamp is older than a week —
 * a ratchet nobody runs cannot tell a healthy platform from a forgotten chore,
 * and known-red at zero is exactly the state in which nothing forces a run.
 *
 * known-red.json is the ratchet. It lists the checks that are red because of a
 * product finding nobody has fixed yet. A run fails (exit 1) on a red check
 * that is NOT listed (a regression, or a new finding to triage) and on a listed
 * check that is now green (the fix landed — shrink the list, that is the
 * point). The list may only shrink; --update-known-red rewrites it from the
 * run and is for the day a finding is triaged or fixed, not for getting green.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertLocalTarget, connect, Scenario, ScenarioAbort, type CheckResult, type ScenarioModule } from './lib';

const root = resolve(import.meta.dirname, '../..');
const processes = readdirSync(join(root, 'docs/processes'))
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

const updateKnownRed = process.argv.includes('--update-known-red');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const knownRedPath = join(import.meta.dirname, 'known-red.json');
const knownRed: Record<string, string[]> = existsSync(knownRedPath) ? JSON.parse(readFileSync(knownRedPath, 'utf8')).checks : {};
const unknown = wanted.filter((w) => !processes.includes(w));
if (unknown.length) {
  console.error(`No such process doc: ${unknown.join(', ')}`);
  process.exit(2);
}

assertLocalTarget();
const db = await connect();

interface ProcessReport { process: string; status: 'pass' | 'fail' | 'owed'; checks: CheckResult[]; aborted?: string; ms: number }
const reports: ProcessReport[] = [];

for (const name of wanted.length ? wanted : processes) {
  const file = join(import.meta.dirname, 'scenarios', `${name}.ts`);
  if (!existsSync(file)) {
    reports.push({ process: name, status: 'owed', checks: [], ms: 0 });
    continue;
  }
  const mod = (await import(file)).default as ScenarioModule;
  if (mod.process !== name) throw new Error(`${file} declares process "${mod.process}"`);
  const s = new Scenario(name, db);
  const started = Date.now();
  let aborted: string | undefined;
  try {
    await mod.run(s);
  } catch (e) {
    if (e instanceof ScenarioAbort) aborted = e.message;
    else {
      aborted = `crashed: ${(e as Error).message}`;
      s.checks.push({ name: 'scenario ran to the end', status: 'fail', detail: (e as Error).stack?.slice(0, 600) });
    }
  }
  const failed = s.checks.some((c) => c.status === 'fail');
  reports.push({ process: name, status: failed ? 'fail' : 'pass', checks: s.checks, aborted, ms: Date.now() - started });
}
await db.end();

const mark = { pass: '✅', fail: '❌', skip: '⏭️ ', owed: '▫️ ' } as const;
for (const r of reports) {
  const n = (st: string) => r.checks.filter((c) => c.status === st).length;
  console.log(`\n${mark[r.status]} ${r.process}${r.status === 'owed' ? ' — no scenario yet' : `  (${n('pass')} pass, ${n('fail')} fail, ${n('skip')} skipped, ${(r.ms / 1000).toFixed(1)} s)`}`);
  for (const c of r.checks) {
    if (c.status === 'pass') continue;
    console.log(`   ${mark[c.status]} ${c.name}${c.detail ? `\n        ${c.detail}` : ''}`);
  }
  if (r.aborted) console.log(`   ↳ ${r.aborted}`);
}

const outDir = join(root, '.qa-output');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'process-battery-report.json'), JSON.stringify({ ran_at: new Date().toISOString(), reports }, null, 2));

const ran = reports.filter((r) => r.status !== 'owed');
const redNow = (r: ProcessReport) => r.checks.filter((c) => c.status === 'fail').map((c) => c.name);
const newRed: string[] = [];
const fixed: string[] = [];
for (const r of ran) {
  const known = new Set(knownRed[r.process] ?? []);
  const red = new Set(redNow(r));
  for (const name of red) if (!known.has(name)) newRed.push(`${r.process} › ${name}`);
  // An aborted scenario never reached its later checks: absence is not a fix.
  if (!r.aborted) for (const name of known) if (!red.has(name)) fixed.push(`${r.process} › ${name}`);
}

if (updateKnownRed) {
  const next = { ...knownRed };
  for (const r of ran) { const red = redNow(r); if (red.length) next[r.process] = red; else delete next[r.process]; }
  writeFileSync(knownRedPath, `${JSON.stringify({ _comment: 'Checks that are red because of an unfixed product finding. May only shrink. See scripts/process-battery/README.md.', checks: next }, null, 2)}\n`);
  console.log(`\nknown-red.json rewritten: ${Object.values(next).flat().length} checks across ${Object.keys(next).length} processes`);
  process.exit(0);
}

const owed = reports.filter((r) => r.status === 'owed');
const totals = (st: string) => ran.reduce((n, r) => n + r.checks.filter((c) => c.status === st).length, 0);
console.log(`\n${totals('pass')} pass · ${totals('fail')} red (${totals('fail') - newRed.length} known) · ${totals('skip')} skipped · ${owed.length} owed  →  .qa-output/process-battery-report.json`);
if (newRed.length) console.log(`\nNEW RED — a regression, or a finding to triage:\n  ${newRed.join('\n  ')}`);
if (fixed.length) console.log(`\nNOW GREEN — remove from known-red.json (--update-known-red):\n  ${fixed.join('\n  ')}`);

const held = !newRed.length && !fixed.length;
// Only a full run proves the ratchet: one process green says nothing about the
// other fourteen, and a triage run (--update-known-red) moved the list rather
// than held it — run once more without the flag for the stamp.
if (held && !wanted.length && !owed.length) {
  let head = 'unknown';
  try { head = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  const stamp = {
    _comment: 'Written by run.ts after a FULL process-battery run that held the ratchet. The pulse guard in src/lib/__tests__ goes red when this is older than a week. Never edit by hand — run the battery.',
    ran_at: new Date().toISOString(),
    head,
    processes: ran.length,
    pass: totals('pass'),
    red: totals('fail'),
    skipped: totals('skip'),
    known_red: Object.values(knownRed).flat().length,
  };
  writeFileSync(join(import.meta.dirname, 'last-green.json'), `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`\nlast-green.json stamped: ${stamp.ran_at} @ ${head.slice(0, 7)} — commit it with the run.`);
}
process.exit(held ? 0 : 1);
