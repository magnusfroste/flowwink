import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  NOT_A_SKILL_FAULT,
  isQuarantined,
  selfHealCandidates,
} from '../../../supabase/functions/_shared/skills/skill-visibility';

/**
 * Guardrail: a write that disables a skill also unexposes it.
 *
 * trg_enforce_mcp_exposure_invariant (baseline) raises check_violation when an
 * agent_skills row has mcp_exposed=true and enabled=false. So
 * `.from('agent_skills').update({ enabled: false })` on an exposed skill
 * fails — and with `.in('name', [...])` one refused row fails the whole
 * statement. Four writers did exactly that and never read the error: a
 * module's switch-off (www had 332 skills of switched-off modules in the
 * catalog, 2026-11-05), self-healing, the outcome auto-pause and the
 * integrity repair. None of them ever disabled an exposed skill.
 *
 * Discover, don't enumerate (CLAUDE.md "Guard design"): this SCANS every
 * source file under src/, supabase/functions/ and scripts/ for an update of
 * agent_skills that sets enabled:false without mcp_exposed — the object
 * literal form and the SQL form — instead of listing the writers we know.
 * The fix is `hideSkills` (supabase/functions/_shared/skills/skill-visibility.ts)
 * or writing both flags.
 */

const ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['src', 'supabase/functions', 'scripts'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** The balanced `{...}` starting at `open` (naive about braces inside strings — fine for update literals). */
function balancedObject(src: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < src.length && i < open + 4000; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

const FROM = /\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g;
const SQL_UPDATE = /\bupdate\s+(?:public\.)?agent_skills\b(?:\s+(?:as\s+)?\w+)?\s+set\s+([\s\S]*?)(?:\bwhere\b|\breturning\b|[`;]|$)/gi;

interface Violation { file: string; line: number; snippet: string }

/** Every agent_skills update in `src` that sets enabled:false without touching mcp_exposed. */
function findUnexposedDisables(src: string, file = '<fixture>'): Violation[] {
  const out: Violation[] = [];
  const lineOf = (i: number) => src.slice(0, i).split('\n').length;

  // 1. Supabase client: .from('agent_skills') … .update({ … enabled: false … })
  const UPDATE = /\.update\(\s*\{/g;
  for (let m: RegExpExecArray | null; (m = UPDATE.exec(src)); ) {
    const literal = balancedObject(src, m.index + m[0].length - 1);
    if (!literal) continue;
    if (!/\benabled\s*:\s*false\b/.test(literal) || /\bmcp_exposed\b/.test(literal)) continue;
    // The table is the nearest .from(...) before this update, within the statement.
    const before = src.slice(Math.max(0, m.index - 600), m.index);
    let table: string | null = null;
    for (let f: RegExpExecArray | null; (f = FROM.exec(before)); ) table = f[1];
    FROM.lastIndex = 0;
    if (table !== 'agent_skills') continue;
    out.push({ file, line: lineOf(m.index), snippet: literal.replace(/\s+/g, ' ').slice(0, 120) });
  }

  // 2. Raw SQL in a string: update agent_skills set enabled = false …
  SQL_UPDATE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = SQL_UPDATE.exec(src)); ) {
    const set = m[1];
    if (/\benabled\s*=\s*false\b/i.test(set) && !/\bmcp_exposed\b/i.test(set)) {
      out.push({ file, line: lineOf(m.index), snippet: m[0].replace(/\s+/g, ' ').slice(0, 120) });
    }
  }
  return out;
}

describe('the scanner sees the shapes that bit us', () => {
  it('flags the old self-heal / integrity-repair / auto-pause writes', () => {
    const old = [
      "await supabase.from('agent_skills').update({ enabled: false }).eq('name', skillName);",
      'const { error } = await sb.from("agent_skills").update({ enabled: false }).eq("id", s.id);',
      "await supabase\n  .from('agent_skills')\n  .update({ enabled: false, updated_at: new Date().toISOString() })\n  .in('name', names);",
      'await c.query(`update agent_skills set enabled = false where name = $1`, [n]);',
    ];
    for (const src of old) expect(findUnexposedDisables(src), src).toHaveLength(1);
  });

  it('passes a write that sets both flags, and other tables', () => {
    const fine = [
      "await supabase.from('agent_skills').update({ enabled: false, mcp_exposed: false }).in('name', chunk);",
      "await supabase.from('agent_automations').update({ enabled: false, last_error: 'x' }).eq('skill_name', n);",
      "await supabase.from('agent_skills').update({ enabled: true }).eq('name', n);",
      'await c.query(`update agent_skills set enabled = false, mcp_exposed = false where name = $1`, [n]);',
      // an automation update right after an agent_skills read: the nearest .from wins
      "await supabase.from('agent_skills').select('name');\nawait supabase.from('agent_automations').update({ enabled: false });",
    ];
    for (const src of fine) expect(findUnexposedDisables(src), src).toEqual([]);
  });
});

describe('no agent_skills write disables a skill and leaves it exposed', () => {
  it('scans src/, supabase/functions/ and scripts/', () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
    expect(files.length).toBeGreaterThan(500);
    const violations = files.flatMap((f) => findUnexposedDisables(readFileSync(f, 'utf8'), relative(ROOT, f)));
    expect(
      violations.map((v) => `${v.file}:${v.line}  ${v.snippet}`),
      'enabled:false on agent_skills without mcp_exposed:false is refused by trg_enforce_mcp_exposure_invariant for an exposed skill. Use hideSkills() from supabase/functions/_shared/skills/skill-visibility.ts, or write both flags and read the error.',
    ).toEqual([]);
  });
});

describe('a quarantine survives the skill sync', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

  it('the migration adds the marker and lifts it on enable', () => {
    const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
    const sql = files.map((f) => read(`supabase/migrations/${f}`)).join('\n');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS quarantined_at timestamptz/);
    expect(sql).toMatch(/CREATE TRIGGER trg_skill_quarantine_lifts_on_enable[\s\S]*?ON public\.agent_skills/);
  });

  it('every path that re-enables a module\'s skills reads the quarantine', () => {
    const agentExecute = read('supabase/functions/_shared/execute/core.ts');
    const sync = agentExecute.slice(agentExecute.indexOf('async function executeSyncSkillsFromCode'));
    expect(sync).toMatch(/isQuarantined\(/);
    expect(sync).toMatch(/keepOff \? \{\} : \{ enabled: true/);
    for (const p of ['src/lib/module-bootstrap.ts', 'src/lib/platform-seeds.ts']) {
      expect(read(p), p).toMatch(/loadQuarantinedSkillNames\(/);
    }
    expect(read('scripts/sync-skills.ts')).toMatch(/keepsQuarantine\(/);
  });

  it('self-healing quarantines, the outcome loop only flags', () => {
    const handlers = read('supabase/functions/_shared/pilot/handlers.ts');
    const heal = handlers.slice(handlers.indexOf('export async function runSelfHealing'), handlers.indexOf('// ─── Skill CRUD'));
    expect(heal).toMatch(/hideSkills\(supabase, \[c\.name\], \{\s*quarantine:/);
    const outcomes = handlers.slice(handlers.indexOf('export async function handleEvaluateOutcomes'));
    expect(outcomes.slice(0, outcomes.indexOf('\nexport async function', 10))).not.toMatch(/from\('agent_skills'\)\s*\.update/);
  });
});

describe('selfHealCandidates counts skill faults only', () => {
  const f = (skill_name: string, code?: string) => ({ skill_name, status: 'failed', code: code ?? null });
  const ok = (skill_name: string) => ({ skill_name, status: 'success' });

  it('three handler errors in a row quarantine', () => {
    expect(selfHealCandidates([f('a', 'HANDLER_ERROR'), f('a'), f('a', 'HANDLER_ERROR')], 3)).toEqual([{ name: 'a', streak: 3 }]);
  });

  it('a success, a refusal or anything not failed ends the streak (rows newest first)', () => {
    expect(selfHealCandidates([f('a'), f('a'), ok('a'), f('a'), f('a')], 3)).toEqual([]);
    expect(selfHealCandidates([f('a'), f('a'), { skill_name: 'a', status: 'refused' }, f('a')], 3)).toEqual([]);
  });

  it('caller errors and the world neither count nor break the streak', () => {
    expect(selfHealCandidates([f('a', 'INVALID_INPUT'), f('a', 'UNKNOWN_PARAMETERS'), f('a', 'TRANSIENT')], 3)).toEqual([]);
    expect(selfHealCandidates([f('a'), f('a', 'NOT_CONNECTED'), f('a'), f('a', 'PERIOD_LOCKED'), f('a')], 3)).toEqual([{ name: 'a', streak: 3 }]);
    for (const code of ['INVALID_INPUT', 'MISSING_REQUIRED_PARAMETER', 'FORBIDDEN', 'TRANSIENT']) expect(NOT_A_SKILL_FAULT.has(code)).toBe(true);
    expect(NOT_A_SKILL_FAULT.has('HANDLER_ERROR')).toBe(false);
  });

  it('a quarantine is a disabled row with the marker', () => {
    expect(isQuarantined({ enabled: false, quarantined_at: '2026-11-05T10:00:00Z' })).toBe(true);
    expect(isQuarantined({ enabled: true, quarantined_at: '2026-11-05T10:00:00Z' })).toBe(false);
    expect(isQuarantined({ enabled: false, quarantined_at: null })).toBe(false);
  });
});
