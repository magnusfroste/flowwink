/**
 * Correctness lint gate (BLOCKING CI step).
 *
 * WHY THIS EXISTS SEPARATELY FROM `npm run lint`
 * ----------------------------------------------
 * The full ESLint run is `continue-on-error: true` in CI and reports ~3350
 * errors, 97% of them `@typescript-eslint/no-explicit-any` — overwhelmingly in
 * Deno edge functions handling untyped JSON, where `any` is a reasonable choice.
 * Making that blocking is a multi-week refactor with no correctness payoff, so
 * it stays advisory.
 *
 * But a step that can never fail is furniture, and the repo already learned this
 * once: `tsc --noEmit` sat behind `continue-on-error` against a config that
 * skipped the app sources, so it "passed" in under a second while real errors
 * accumulated (see the comment on the typecheck step in ci.yml). A green tick
 * that checks nothing is a claim the repo makes about itself and does not keep.
 *
 * So: a small, named allowlist of rules that catch BUGS rather than style, held
 * at zero and blocking. Adding a rule here is a deliberate act — it must be one
 * where a violation is a defect, not a preference.
 *
 * FOUND BY THIS GATE'S FIRST RUN (2026-08-24)
 * -------------------------------------------
 * `react-hooks/rules-of-hooks` × 10. Nine were in
 * `src/pages/account/PerformancePage.tsx`, which returned early on
 * `!isEmployee` — a value that is false while the query loads and true after it
 * resolves. Two hooks on the first render, eleven on the second: React throws
 * "Rendered more hooks than during the previous render". The page crashed for
 * every employee and for nobody else, which is exactly why it survived.
 */
import { execSync } from 'node:child_process';

/**
 * Rules whose violations are defects. Keep this list short and justified.
 *
 * NOT included, deliberately: `@typescript-eslint/no-explicit-any` (style, and
 * 3262 pre-existing), `prefer-const` (style), `no-case-declarations` (style
 * unless the declaration actually leaks, which TS already narrows).
 */
const CORRECTNESS_RULES = [
  // A conditionally-called hook desynchronises React's hook list. Runtime crash,
  // every time, with no safe way to write it on purpose.
  'react-hooks/rules-of-hooks',
  // `catch {}` — an error observed and discarded. Every instance in this repo is
  // a deliberate best-effort call (a webhook that must not fail the business
  // operation, a localStorage write in private mode), and every one of them was
  // silent about it. The rule is satisfied by a comment, so what it actually
  // enforces is: a swallowed error must say why it is swallowed. This repo has
  // lost hours to stacked bugs hiding behind a swallowed catch.
  'no-empty',
] as const;

/**
 * DELIBERATELY EXCLUDED, and the reasoning matters more than the list.
 *
 * The first draft of this gate also carried `no-useless-escape` (11),
 * `no-regex-spaces` (5) and `no-constant-binary-expression` (2). Reading all 18
 * killed them: every escape was `\/` inside a character class or `\"` inside a
 * template literal — byte-identical behaviour; every regex-space was a test
 * matching literal indentation; and both constant expressions were
 * `cn('base', true && 'included')` in a test whose whole point is feeding `cn`
 * literal conditionals. Eighteen cosmetic edits to regexes and strings, zero
 * defects found, non-zero risk.
 *
 * Holding a rule at zero is only honest when a violation IS a defect. Forcing a
 * list green to look rigorous is the same failure as a green tick that checks
 * nothing — just more work.
 *
 * ALSO EXCLUDED: `react-hooks/exhaustive-deps` (43 violations today).
 *
 * Unlike the rules above, this one is broken on purpose all the time — a
 * run-once effect, an intentionally stale closure, a dep that would loop. A gate
 * can only be held at zero when every violation is a defect; hold a
 * sometimes-right rule at zero and you get a suppression culture, or the gate
 * gets `continue-on-error` back within a week. It stays in the advisory lint,
 * where a human can weigh each case.
 */

type EslintMessage = { ruleId: string | null; line: number; column: number; message: string };
type EslintFile = { filePath: string; messages: EslintMessage[] };

let raw: string;
try {
  raw = execSync('npx eslint . -f json', { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
} catch (e: unknown) {
  // ESLint exits non-zero when it reports errors — that is the normal path here,
  // and stdout still holds the JSON we want.
  const err = e as { stdout?: string };
  if (!err.stdout) {
    console.error('✖ lint-correctness-gate: eslint produced no output.');
    process.exit(1);
  }
  raw = err.stdout;
}

let report: EslintFile[];
try {
  report = JSON.parse(raw);
} catch {
  console.error('✖ lint-correctness-gate: could not parse eslint JSON output.');
  process.exit(1);
}

const watched = new Set<string>(CORRECTNESS_RULES);
const cwd = process.cwd();
const offenders = report.flatMap((f) =>
  f.messages
    .filter((m) => m.ruleId !== null && watched.has(m.ruleId))
    .map((m) => ({
      file: f.filePath.startsWith(cwd) ? f.filePath.slice(cwd.length + 1) : f.filePath,
      ...m,
    })),
);

if (offenders.length > 0) {
  console.error(
    `✖ ${offenders.length} correctness lint error(s). These are defects, not style —\n` +
    '  see the rule notes in scripts/lint-correctness-gate.ts for what each one breaks.\n',
  );
  for (const o of offenders) {
    console.error(`   ${o.file}:${o.line}:${o.column}`);
    console.error(`      ${o.ruleId} — ${o.message}`);
  }
  process.exit(1);
}

console.log(
  `✓ lint-correctness-gate: 0 violations across ${CORRECTNESS_RULES.length} correctness rules ` +
  `(${report.length} files linted).`,
);
