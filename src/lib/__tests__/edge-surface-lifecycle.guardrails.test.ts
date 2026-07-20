import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
    const uac = readFileSync(join(root, 'supabase/functions/_shared/handlers/update-autonomy-cron.ts'), 'utf8');
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

/**
 * Guardrail: reconciliation's SUB-PATH routing survives the move (B1b).
 *
 * The standalone function routed on the URL subpath
 * (/reconciliation/auto-match) and agent-execute carried that subpath inside
 * the handler string. As an internal handler the action comes from the
 * handler suffix instead — if a seed loses its suffix, or the dispatcher stops
 * splitting on '/', all four sub-skills silently collapse onto one route.
 */
describe('reconciliation sub-path routing', () => {
  const SUBS = ['auto-match', 'import-file', 'import-image', 'sync-stripe'];

  it('all four seeds keep their sub-path suffix', () => {
    const mod = readFileSync(join(root, 'src/lib/modules/reconciliation-module.ts'), 'utf8');
    for (const s of SUBS) expect(mod).toContain(`'internal:reconciliation/${s}'`);
    expect(mod).not.toMatch(/'edge:reconciliation/);
  });

  it('agent-execute dispatches on the suffix, and the handler covers every route', () => {
    const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
    expect(ae).toMatch(/handler\.startsWith\('internal:reconciliation\/'\)/);
    expect(ae).toMatch(/executeReconciliation\(handler\.split\('\/'\)\[1\]/);

    const h = readFileSync(join(root, 'supabase/functions/_shared/handlers/reconciliation.ts'), 'utf8');
    for (const s of SUBS) expect(h).toContain(`case "${s}":`);
    expect(h).toMatch(/export async function executeReconciliation/);
  });

  it('no moved handler keeps a ../_shared/ path (it now lives inside _shared)', () => {
    // Live finding: the mechanical move left `../_shared/x.ts`, which resolves
    // to _shared/_shared/x.ts from handlers/ — the whole function failed to
    // boot with "Module not found".
    const dir = join(root, 'supabase/functions/_shared/handlers');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/from ['"]\.\.\/_shared\//);
    }
  });
});

/**
 * Guardrail: a handler moved into _shared/handlers/ must reach sibling helpers
 * with the right depth. Two live boot-failures came from this:
 *   ../_shared/x.ts  → _shared/_shared/x.ts   (module not found)
 *   ../shared/x.ts   → _shared/shared/x.ts    (functions/shared is TWO levels up)
 * A handler needs ../ for _shared siblings and ../../shared/ for functions/shared.
 */
describe('handler import depth', () => {
  const dir = join(root, 'supabase/functions/_shared/handlers');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it('no handler imports ../_shared/ (that doubles to _shared/_shared/)', () => {
    for (const f of files) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/from ['"]\.\.\/_shared\//);
  });

  it('functions/shared is reached with ../../shared/, never ../shared/', () => {
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, `${f} uses ../shared/ (resolves to _shared/shared/)`).not.toMatch(/from ['"]\.\.\/shared\//);
    }
  });
});
