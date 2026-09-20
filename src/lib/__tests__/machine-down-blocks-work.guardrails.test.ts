import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-20, maintenance. Odoo's idea is that equipment hangs on
 * a WORK CENTER: a machine that is down stops the work it feeds. That idea had
 * nowhere to land until work orders and work centers became real (#563).
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

describe('a machine that is down blocks its work center', () => {
  it('the rule lives on the table, and the refusal names the machine', () => {
    const b = latestFunctionBody('work_order_needs_a_working_machine');
    expect(b).toMatch(/NEW\.status <> 'in_progress' OR OLD\.status = 'in_progress'/);
    expect(b).toMatch(/e\.status IN \('under_maintenance', 'broken'\)/);
    expect(b).toMatch(/cannot start/);
    expect(migrations).toMatch(/CREATE TRIGGER work_order_needs_a_working_machine\s+BEFORE UPDATE OF status ON public\.mo_work_orders/);
    expect(migrations).toMatch(/ADD COLUMN IF NOT EXISTS work_center_id uuid REFERENCES public\.work_centers\(id\)/);
  });

  it('the availability read and the rule agree on what "down" means', () => {
    expect(latestFunctionBody('work_center_availability')).toMatch(/e\.status IN \('under_maintenance', 'broken'\)/);
  });
});

describe('the request says whether it stops the machine', () => {
  it('one writer of the status, driven by a trigger — not by a caller', () => {
    const b = latestFunctionBody('sync_equipment_status');
    expect(b).toMatch(/r\.blocks_equipment/);
    expect(b).toMatch(/v_status = 'retired'/);
    // 'broken' is a human judgement: closing a request must not silently clear it.
    expect(b).toMatch(/NOT v_blocked AND v_status = 'under_maintenance'/);
    expect(b).not.toMatch(/v_status = 'broken' THEN\s+UPDATE/);
    expect(migrations).toMatch(/CREATE TRIGGER tg_sync_equipment_status\s+AFTER INSERT OR UPDATE OR DELETE ON public\.maintenance_requests/);
    // The door no longer flips the status itself — the trigger owns it.
    const door = latestFunctionBody('manage_maintenance_request');
    expect(door).not.toMatch(/UPDATE equipment SET status='under_maintenance'/);
    expect(door).toMatch(/v_blocks := COALESCE\(p_blocks_equipment, COALESCE\(p_priority,'medium'\) = 'critical'\)/);
  });
});

describe('reliability figures do not invent a mean', () => {
  it('MTBF is absent with fewer than two failures, and says why', () => {
    const b = latestFunctionBody('maintenance_stats');
    expect(b).toMatch(/CASE WHEN f\.failures >= 2/);
    expect(b).toMatch(/insufficient data: a mean between failures needs at least two failures/);
    expect(b).toMatch(/can_access_module\(auth\.uid\(\), 'maintenance'\)/);
  });
});

describe('the asset link has a flow, not just a column', () => {
  it('one asset, one machine — enforced by an index, offered by a reader', () => {
    expect(migrations).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS equipment_one_per_fixed_asset/);
    const b = latestFunctionBody('list_linkable_fixed_assets');
    expect(b).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.equipment e WHERE e\.fixed_asset_id = a\.id\)/);
    expect(latestFunctionBody('manage_equipment')).toMatch(/Fixed asset % not found/);
  });
});

describe('both surfaces', () => {
  it('the skills are seeded with the parameter names the functions take', () => {
    type Seed = { name: string; handler: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    for (const name of ['maintenance_stats', 'work_center_availability', 'manage_equipment', 'manage_maintenance_request']) {
      const skill = skills.find((s) => s.name === name);
      expect(skill?.handler, name).toBe(`rpc:${name}`);
      const head = migrations.slice(migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
      const signature = head.slice(0, head.indexOf('RETURNS'));
      for (const param of Object.keys(skill!.tool_definition.function.parameters.properties)) {
        expect(signature, `${name} takes ${param}`).toContain(param);
      }
    }
    // A new parameter on an existing RPC means the old signature must go, or PostgREST cannot choose.
    expect(migrations).toMatch(/DROP FUNCTION IF EXISTS public\.manage_equipment\(text, uuid, text, text, text, text, text, text\);/);
    expect(migrations).toMatch(/DROP FUNCTION IF EXISTS public\.manage_maintenance_request\(text, uuid, uuid, text, text, text, text, text, date, integer\);/);
  });

  it('the admin page carries the work center, the asset, the blocking toggle and the figures', () => {
    const page = read('src/pages/admin/MaintenancePage.tsx');
    expect(page).toMatch(/p_work_center_id: workCenterId \|\| null/);
    expect(page).toMatch(/p_fixed_asset_id: fixedAssetId \|\| null/);
    expect(page).toMatch(/p_blocks_equipment: blocks/);
    expect(page).toMatch(/<ReliabilityTab \/>/);
    expect(page).toMatch(/too few failures/);
  });
});
