import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: a handler that reads the clock has bound it.
 *
 * #774 (2026-10-26) moved contract_renewal_check's horizon to the business
 * date and deleted `const now = new Date()` — but `now.getTime()` four lines
 * down stayed. PR CI type-checks the frontend, not the edge functions, so
 * nothing was red; optic's nightly "Contract Renewal Alert" threw
 * `now is not defined` the next morning (2026-10-27 09:00), the only failed
 * cron in a week. `deno check` catches it (TS2304) — this test is the CI-side
 * net until that check runs on PRs.
 *
 * Discover, don't enumerate: every `now.<Date method>` in every edge function
 * must have a `now` bound in an ENCLOSING scope — the scanner walks back from
 * the use counting braces, and a binding counts only while the walk has not
 * climbed out of a block the use sits in. A `const now` inside a sibling
 * handler's `if {}` (there are seven in agent-execute's dispatcher) is not a
 * binding for this one; that is exactly how the leftover hid.
 */
const ROOT = join(__dirname, '../../..');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const USE = /(?<![\w.$])now\.(getTime|getFullYear|getMonth|getDate|getDay|getHours|getMinutes|toISOString|toLocale\w*|valueOf)\b/;
const BOUND = /\b(?:const|let|var)\s+now\b|\bnow\s*[:=]|\(\s*now\b|,\s*now\b|\bnow\s*\)|\bnow\s*,/;

/** Is `now` bound in a scope that encloses line `i`? Brace-counting, backwards. */
function boundAbove(lines: string[], i: number): boolean {
  let depth = 0; // > 0 while inside a block that closed before the use (a sibling)
  for (let j = i - 1; j >= 0; j--) {
    const line = lines[j].replace(/\/\/.*$/, '');
    // Braces right-to-left, since we walk backwards: a `}` enters a sibling
    // block, a `{` leaves one — or, at depth 0, is the start of an enclosing
    // block (which stays enclosing). `{ a: 1 }` on one line nets to zero.
    for (let k = line.length - 1; k >= 0; k--) {
      if (line[k] === '}') depth++;
      else if (line[k] === '{' && depth > 0) depth--;
    }
    if (depth === 0 && BOUND.test(line)) return true;
  }
  return false;
}

export function unboundClockUses(source: string): number[] {
  const lines = source.split('\n');
  const bad: number[] = [];
  lines.forEach((line, i) => {
    if (!USE.test(line)) return;
    if (!boundAbove(lines, i)) bad.push(i + 1);
  });
  return bad;
}

describe('every `now.` in an edge function has a `now` bound above it', () => {
  it('no edge function reads a clock it never bound', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(FUNCTIONS)) {
      const bad = unboundClockUses(readFileSync(file, 'utf8'));
      for (const line of bad) offenders.push(`${file.slice(ROOT.length + 1)}:${line}`);
    }
    expect(offenders, 'a `now.` with no `now` in reach — the binding was probably deleted in a refactor').toEqual([]);
  });

  it('the scanner sees the #774 shape (negative test on the exact leftover)', () => {
    const leftover = [
      "if (skillName === 'contract_renewal_check') {",
      '  const horizon = businessDateIn(tz, Number(days_ahead) || 30);',
      '  const { data, error } = await q;',
      '  const today = now.getTime();',
    ].join('\n');
    expect(unboundClockUses(leftover)).toEqual([4]);
    expect(unboundClockUses('const now = new Date();\nconst today = now.getTime();')).toEqual([]);
    expect(unboundClockUses('function f(now: Date) {\n  return now.getTime();\n}')).toEqual([]);
    // a sibling handler's binding does not count — that is how #774's leftover hid
    const sibling = [
      'async function dispatch() {',
      "  if (skill === 'a') {",
      '    const now = new Date();',
      '    return now.getTime();',
      '  }',
      "  if (skill === 'b') {",
      '    return now.getTime();',
      '  }',
      '}',
    ].join('\n');
    expect(unboundClockUses(sibling)).toEqual([7]);
    // a binding in the enclosing function, 150 lines up, does count
    const far = ['function f() {', '  const now = new Date();', ...Array(150).fill('  x();'), '  if (y) { return now.toISOString(); }', '}'].join('\n');
    expect(unboundClockUses(far)).toEqual([]);
  });

  it('contract_renewal_check counts days on the business calendar, not the runtime clock', () => {
    const ae = readFileSync(join(FUNCTIONS, 'agent-execute', 'index.ts'), 'utf8');
    const handler = ae.slice(ae.indexOf("if (skillName === 'contract_renewal_check')"), ae.indexOf('horizon_days: days_ahead'));
    expect(handler).toMatch(/const today = Date\.parse\(dateInZone\(tz\)\);/);
    expect(handler).not.toMatch(/now\.getTime\(\)/);
  });
});
