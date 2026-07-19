import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: flowpilot-lifecycle (edge-surface B5) must not widen access and
 * must keep the autonomous loop's wires intact.
 *
 * Five lifecycle functions became one. flowpilot-learn is cron-scheduled on
 * every fleet instance and flowpilot-followthrough is called from the
 * heartbeat — a broken mapping here means the operator silently stops
 * learning/resuming (pg_net reports success on 404s).
 */

const root = process.cwd();
const dir = join(root, 'supabase/functions/flowpilot-lifecycle');
const index = readFileSync(join(dir, 'index.ts'), 'utf8');

const TASKS = ['briefing', 'distill', 'learn', 'followthrough', 'curator'];

describe('flowpilot-lifecycle consolidation', () => {
  it('every task has its handler module and is wired', () => {
    for (const t of TASKS) {
      expect(existsSync(join(dir, `${t}.ts`)), `${t}.ts`).toBe(true);
    }
    for (const t of TASKS) expect(index).toContain(t);
  });

  it('no module carries a stray serve() closer (the parse bug that bricked boot)', () => {
    // The mechanical move rewrites `serve(async (req) => {` to a function; if
    // the original had helpers AFTER serve(), the closing `});` survived at
    // column 0 and the whole function failed to boot (BOOT_ERROR, found live).
    for (const t of TASKS) {
      const src = readFileSync(join(dir, `${t}.ts`), 'utf8');
      expect(src, `${t}.ts still contains a column-0 '});'`).not.toMatch(/^\}\);$/m);
      expect(src).toMatch(/export (async function|const) handler/);
    }
  });

  it('distill (formerly JWT-gated) keeps an in-body gate', () => {
    const gated = index.match(/const GATED = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    expect(gated).toContain('distill');
    expect(index).toMatch(/requireServiceOrRole/);
  });

  it('skill-name mapping matches the real seed names', () => {
    // Guessed names here once already (learn_from_yesterday) — pin the truth.
    expect(index).toMatch(/run_daily_briefing:\s*'briefing'/);
    expect(index).toMatch(/learn_from_data:\s*'learn'/);
    expect(index).toMatch(/run_skill_curator:\s*'curator'/);
    const platform = readFileSync(join(root, 'src/lib/platform-seeds.ts'), 'utf8');
    const flowpilot = readFileSync(join(root, 'src/lib/modules/flowpilot-module.ts'), 'utf8');
    expect(platform.match(/'edge:flowpilot-lifecycle'/g)?.length).toBe(2);
    expect(flowpilot).toContain("'edge:flowpilot-lifecycle'");
  });

  it('the heartbeat and update-autonomy-cron wires point at the new URL', () => {
    const hb = readFileSync(join(root, 'supabase/functions/flowpilot-heartbeat/index.ts'), 'utf8');
    expect(hb).toContain('flowpilot-lifecycle?task=followthrough');
    expect(hb).not.toContain('/functions/v1/flowpilot-followthrough');
    const uac = readFileSync(join(root, 'supabase/functions/update-autonomy-cron/index.ts'), 'utf8');
    expect(uac).toContain('flowpilot-lifecycle?task=learn');
    // Wire-name policy: the cron JOBNAME stays 'flowpilot-learn'.
    expect(uac).toContain('p_jobname: "flowpilot-learn"');
  });

  it('the cron self-heal migration repoints learn and followthrough (live on the fleet)', () => {
    const mig = readFileSync(join(root, 'supabase/migrations/20260719233000_flowpilot-lifecycle-cron-repoint.sql'), 'utf8');
    expect(mig).toContain('flowpilot-lifecycle?task=learn');
    expect(mig).toContain('flowpilot-lifecycle?task=followthrough');
    expect(mig).toContain('instance-health?check=cron');
  });

  it('cron-health lives on inside instance-health with its admin gate', () => {
    const ih = readFileSync(join(root, 'supabase/functions/instance-health/index.ts'), 'utf8');
    expect(ih).toContain("check === 'cron'");
    expect(ih).toContain('cron_health_report');
    expect(ih).toMatch(/requireServiceOrRole\(req, supabase, 'admin'\)/);
  });
});
