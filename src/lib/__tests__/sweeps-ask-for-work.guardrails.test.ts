import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A sweep asks whether there is work before anything wakes (2026-11-09).
 *
 * Four automations fired every 15 minutes on every instance against empty
 * tables (~6 900 runs each on www): a dispatcher invocation and an
 * agent-execute invocation per tick for "nothing to do". An automation now
 * DECLARES a probe (trigger_config.work_probe → public.work_probe_<name>()),
 * the lane and the dispatcher ask it, and no probe / an unknown probe / a
 * probe that raises all mean "there is work".
 *
 * Discovered, not enumerated: every probe a seed declares must exist as a
 * function in a migration, whichever module declares it.
 */
const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const allSql = migrations.map((f) => read(`supabase/migrations/${f}`)).join('\n');
const latest = (fn: string) => {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`);
  const file = [...migrations].reverse().find((f) => re.test(read(`supabase/migrations/${f}`)));
  if (!file) return '';
  const sql = read(`supabase/migrations/${file}`);
  const start = sql.search(re);
  return sql.slice(start, sql.indexOf('\nREVOKE', start));
};

describe('sweeps ask for work', () => {
  const sources = [
    ...readdirSync(join(root, 'src/lib/modules')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/modules/${f}`),
    'src/lib/platform-seeds.ts',
  ];
  const declared = sources.flatMap((f) => [...read(f).matchAll(/work_probe:\s*'([^']+)'/g)].map((m) => ({ f, probe: m[1] })));

  it('every probe a seed declares exists as a function', () => {
    expect(declared.length).toBeGreaterThanOrEqual(3);
    const missing = declared.filter(({ probe }) => !allSql.includes(`CREATE OR REPLACE FUNCTION public.work_probe_${probe}()`));
    expect(missing).toEqual([]);
  });

  it('the one question fails open: no probe, unknown probe, a probe that raises', () => {
    const fn = latest('automation_has_work');
    expect(fn).toMatch(/IF v_probe IS NULL THEN RETURN true;/);
    expect(fn).toMatch(/IF v_fn IS NULL THEN RETURN true;/);
    expect(fn).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RETURN true;/);
    // The name is checked before it is formatted into SQL.
    expect(fn).toMatch(/v_probe !~ '\^\[a-z\]\[a-z0-9_\]\{1,50\}\$'/);
  });

  it('the lane counts a due automation only when it has work', () => {
    expect(latest('lane_has_work')).toMatch(/public\.automation_has_work\(a\.trigger_config\)/);
    // A row never computed (next_run_at NULL) still pulses: the first tick computes it.
    expect(latest('lane_has_work')).toMatch(/a\.next_run_at IS NULL OR public\.automation_has_work/);
  });

  it('idle is not stale: the pulse notes the idle ones, and still carries the cron secret', () => {
    const pulse = latest('pulse_lane');
    expect(pulse).toMatch(/PERFORM public\.note_idle_automations\(\);/);
    expect(pulse).toMatch(/public\.cron_secret_header\(p_headers\)/);
    expect(latest('note_idle_automations')).toMatch(/SET last_triggered_at = now\(\)/);
  });

  it('the dispatcher asks before it wakes agent-execute, and skips a skill of an off module', () => {
    const d = read('supabase/functions/automation-dispatcher/index.ts');
    const probe = d.indexOf('rpc("automation_has_work"');
    const gate = d.indexOf('skillModuleOn(String(auto.skill_name)');
    const exec = d.indexOf('/functions/v1/agent-execute');
    expect(probe).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(probe).toBeLessThan(exec);
    expect(gate).toBeLessThan(exec);
    expect(d).toMatch(/!probeError && hasWork === false/); // an unanswerable probe runs the skill
  });
});
