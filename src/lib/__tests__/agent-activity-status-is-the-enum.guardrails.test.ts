import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A row written to agent_activity carries a status the enum knows.
 *
 * `agent_activity.status` is the enum `agent_activity_status`. A value it does
 * not carry is refused by Postgres, and a journal write is rarely checked: the
 * heartbeat's wall-clock catch wrote "timeout" from its first day, so every
 * timed-out heartbeat left NO row — liteit 2026-11-12 and 11-24 are absent from
 * the history, and the machine room never saw a heartbeat fail in 90 days.
 *
 * Discovered, not listed: the enum is read from the migrations (the baseline's
 * CREATE TYPE plus every ADD VALUE), the writers from every edge function that
 * inserts, updates or upserts agent_activity.
 */

const ROOT = join(__dirname, '..', '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');

function enumValues(): Set<string> {
  const values = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    const created = sql.match(/CREATE TYPE\s+"?public"?\."?agent_activity_status"?\s+AS ENUM\s*\(([^)]*)\)/i);
    if (created) for (const m of created[1].matchAll(/'([a-z_]+)'/g)) values.add(m[1]);
    for (const m of sql.matchAll(/ALTER TYPE\s+"?public"?\."?agent_activity_status"?\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([a-z_]+)'/gi)) {
      values.add(m[1]);
    }
  }
  return values;
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

/** The argument of the call that opens at `from`, up to its closing paren. */
function callArgument(src: string, from: number): string {
  let depth = 1;
  let i = from;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    i++;
  }
  return src.slice(from, i);
}

/**
 * The status values a write can store: the string literals of each `status:`
 * expression, after its `?` when it is a ternary (the condition's literals are
 * compared, not stored — instance-health's `result.status === 'unhealthy' ? …`).
 */
export function writtenStatuses(src: string): Array<{ value: string; line: number }> {
  const out: Array<{ value: string; line: number }> = [];
  const write = /from\(\s*['"]agent_activity['"]\s*\)\s*\.\s*(?:insert|update|upsert)\(/g;
  for (const m of src.matchAll(write)) {
    const start = (m.index ?? 0) + m[0].length;
    const arg = callArgument(src, start);
    for (const s of arg.matchAll(/(?<![\w.])status\s*:\s*([^,\n}]+)/g)) {
      const expr = s[1].includes('?') ? s[1].slice(s[1].indexOf('?') + 1) : s[1];
      for (const lit of expr.matchAll(/['"`]([a-z_]+)['"`]/g)) {
        out.push({ value: lit[1], line: src.slice(0, start).split('\n').length });
      }
    }
  }
  return out;
}

describe('agent_activity is written with statuses its enum carries', () => {
  const known = enumValues();

  it('reads the enum from the migrations', () => {
    expect(known.has('success')).toBe(true);
    expect(known.has('failed')).toBe(true);
    expect(known.has('refused')).toBe(true);
  });

  it('finds the writers (the scanner sees the heartbeat and instance-health)', () => {
    const hb = readFileSync(join(FUNCTIONS, 'flowpilot-heartbeat', 'index.ts'), 'utf8');
    expect(writtenStatuses(hb).length).toBeGreaterThan(0);
    const ih = readFileSync(join(FUNCTIONS, 'instance-health', 'index.ts'), 'utf8');
    expect(writtenStatuses(ih).map((w) => w.value).sort()).toEqual(['failed', 'success']);
  });

  it('flags a value the enum does not carry', () => {
    const bad = `await supabase.from("agent_activity").insert({ skill_name: "x", status: isTimeout ? "timeout" : "failed" });`;
    expect(writtenStatuses(bad).map((w) => w.value).filter((v) => !known.has(v))).toEqual(['timeout']);
  });

  it('every write in the edge functions stores a known status', () => {
    const offenders = tsFiles(FUNCTIONS).flatMap((file) =>
      writtenStatuses(readFileSync(file, 'utf8'))
        .filter((w) => !known.has(w.value))
        .map((w) => `${file.slice(ROOT.length + 1)}:${w.line} status "${w.value}"`),
    );
    expect(offenders, `not in agent_activity_status (${[...known].join(', ')}) — Postgres refuses the row`).toEqual([]);
  });
});
