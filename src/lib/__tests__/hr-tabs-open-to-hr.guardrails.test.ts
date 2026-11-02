/**
 * HR's own tabs were closed to HR (2026-11-02): Shifts, Compensation, Training
 * and Disciplinary call SECURITY DEFINER functions that admitted only an
 * admin, so a person with the HR role saw the tabs in the HR workspace and got
 * "Only admins can manage shifts" on each. The guard is the HR module, not the
 * admin role: can_access_module(auth.uid(), 'hr') (admin included).
 *
 * Discovers the functions from the hook every HR panel calls them through
 * (useHrOps' RpcName), then reads each one's NEWEST definition in the
 * migrations — a later migration that put the admin-only guard back fails it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const hook = readFileSync('src/hooks/useHrOps.ts', 'utf8');
const names = [...(hook.match(/type RpcName =([\s\S]*?);/)?.[1] ?? '').matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();

function newestDefinition(fn: string): { file: string; body: string } | null {
  for (const f of [...migrations].reverse()) {
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8');
    const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\$\\$;`));
    if (m) return { file: f, body: m[0] };
  }
  return null;
}

describe('the functions behind HR\'s tabs admit HR, not only admins', () => {
  it('finds the functions', () => {
    expect(names).toEqual(expect.arrayContaining(['manage_shift', 'manage_salary_grade', 'manage_training', 'manage_disciplinary']));
  });

  for (const fn of names) {
    it(`${fn} is guarded by the HR module`, () => {
      const def = newestDefinition(fn);
      expect(def, `${fn} has no definition in the migrations`).not.toBeNull();
      expect(def!.body, `${def!.file}`).toMatch(/can_access_module\(auth\.uid\(\), 'hr'\)/);
      expect(def!.body, `${def!.file}: admin-only guard`).not.toMatch(/OR has_role\(auth\.uid\(\), 'admin'\)\) THEN/);
    });
  }
});
