import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-20, manufacturing: what actually came out of an
 * operation. A manufacturing order used to assume that everything started
 * became a whole product, and nothing could require a quality check.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$function$;', start));
}

describe('a quality check decides whether the operation is finished', () => {
  it('the rule lives on the table: done needs the latest check to pass', () => {
    const b = latestFunctionBody('work_order_done_needs_its_inspection');
    expect(b).toMatch(/NEW\.status <> 'done' OR OLD\.status = 'done'/);
    expect(b).toMatch(/ORDER BY c\.checked_at DESC, c\.id DESC LIMIT 1/);
    expect(b).toMatch(/v_last IS DISTINCT FROM 'pass'/);
    expect(migrations).toMatch(/CREATE TRIGGER work_order_done_needs_its_inspection\s+BEFORE UPDATE OF status ON public\.mo_work_orders/);
  });

  it('a check is a fact — it is superseded, never rewritten or deleted', () => {
    const b = latestFunctionBody('quality_check_is_a_fact');
    expect(b).toMatch(/TG_OP = 'DELETE'/);
    expect(b).toMatch(/is on record/);
    expect(migrations).toMatch(/CREATE TRIGGER quality_check_is_a_fact\s+BEFORE UPDATE OR DELETE ON public\.mo_quality_checks/);
  });

  it('a failed check reopens a finished operation for rework', () => {
    expect(latestFunctionBody('record_quality_check')).toMatch(/p_result = 'fail' AND v_wo\.status = 'done' THEN\s+UPDATE public\.mo_work_orders SET status = 'in_progress'/);
  });

  it('the requirement is set on the routing operation, through one signature', () => {
    expect(migrations).toMatch(/ADD COLUMN IF NOT EXISTS requires_inspection boolean NOT NULL DEFAULT false/);
    expect(migrations).toMatch(/DROP FUNCTION IF EXISTS public\.manage_routing_operation\(text, uuid, uuid, integer, text, uuid, numeric\);/);
    expect(latestFunctionBody('manage_routing_operation')).toMatch(/requires_inspection=COALESCE\(p_requires_inspection,requires_inspection\)/);
  });
});

describe('scrap is what never became a product', () => {
  it('it is capped by the order and counted across its operations', () => {
    const b = latestFunctionBody('record_operation_scrap');
    expect(b).toMatch(/FOR UPDATE/);
    expect(b).toMatch(/> v_mo\.quantity THEN/);
    expect(b).toMatch(/status IN \('done', 'cancelled'\)/);
    expect(latestFunctionBody('mo_scrapped_quantity')).toMatch(/SUM\(qty_scrapped\)/);
  });

  it('the completion produces the order minus the scrap, and says the survivors carry it', () => {
    expect(migrations).toMatch(/anchor missing in complete_mo/);
    expect(migrations).toMatch(/scrap-aware 20260920060000/);
    expect(migrations).toMatch(/v_qty := COALESCE\(p_actual_qty, v_mo\.quantity - v_scrapped\)/);
    expect(migrations).toMatch(/'unit_cost_includes_scrap', v_scrapped > 0/);
  });
});

describe('both surfaces', () => {
  it('the skills are seeded with the parameter names the functions take', () => {
    type Seed = { name: string; handler: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    for (const name of ['record_quality_check', 'work_order_inspection_state', 'record_operation_scrap']) {
      const skill = skills.find((s) => s.name === name);
      expect(skill?.handler, name).toBe(`rpc:${name}`);
      const head = migrations.slice(migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
      const signature = head.slice(0, head.indexOf('RETURNS'));
      for (const param of Object.keys(skill!.tool_definition.function.parameters.properties)) {
        expect(signature, `${name} takes ${param}`).toContain(param);
      }
    }
    const routing = skills.find((s) => s.name === 'manage_routing_operation')!;
    expect(Object.keys(routing.tool_definition.function.parameters.properties)).toContain('p_requires_inspection');
  });

  it('the shop floor can record both, and the routing can ask for a check', () => {
    expect(read('src/components/admin/manufacturing/MoWorkOrdersPanel.tsx')).toMatch(/<WorkOrderOutcomeDialog/);
    const dialog = read('src/components/admin/manufacturing/WorkOrderOutcomeDialog.tsx');
    expect(dialog).toMatch(/'record_quality_check'/);
    expect(dialog).toMatch(/'record_operation_scrap'/);
    expect(read('src/components/admin/manufacturing/RoutingEditor.tsx')).toMatch(/p_requires_inspection: draft\.requires_inspection/);
  });

  it('the quality checks are closed to anonymous visitors and follow the matrix', () => {
    expect(migrations).toMatch(/ALTER TABLE public\.mo_quality_checks ENABLE ROW LEVEL SECURITY/);
    expect(migrations).toMatch(/REVOKE ALL ON public\.mo_quality_checks FROM anon/);
    expect(migrations).toMatch(/USING \(can_access_module\(auth\.uid\(\), 'manufacturing'\)\)/);
  });
});
