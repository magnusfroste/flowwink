import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: every automation seed must reference a skill that exists.
 *
 * Live finding (2026-07-20, platform health test on the rebuilt demo):
 * "1 automations reference missing skills:
 *  invoice_completed_service_orders→create_invoice_from_service_order".
 *
 * Genuine, unlike the orphan-skill false alarm the same night. The
 * field-service module seeded an automation on service_order.completed —
 * an event manage_service_order really does emit — pointing at a skill name
 * that had no seed, no RPC and no DB row anywhere. Every completed service
 * order started an automation that could only fail, while the module
 * advertised "auto-generate invoices on completion".
 *
 * Nothing validated the reference at authoring time: skills and automations
 * are declared side by side in the same file, but only the DB ever compared
 * them — and only on an instance that happened to run the health test.
 */

const root = process.cwd();
const modulesDir = join(root, 'src/lib/modules');
const sources = [
  ...readdirSync(modulesDir).filter((f) => f.endsWith('.ts')).map((f) => join(modulesDir, f)),
  join(root, 'src/lib/platform-seeds.ts'),
];

/** Skill names declared anywhere (module manifests + platform seeds). */
function declaredSkills(): Set<string> {
  const out = new Set<string>();
  for (const path of sources) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/name:\s*'([a-z_][a-z0-9_]*)'/g)) {
      const win = src.slice(m.index! + m[0].length, m.index! + m[0].length + 3000);
      if (win.includes('tool_definition') && win.includes('handler')) out.add(m[1]);
    }
    for (const s of src.matchAll(/skills:\s*\[([\s\S]*?)\]/g)) {
      for (const n of s[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)) out.add(n[1]);
    }
  }
  return out;
}

/** [file, skill_name] for every automation seed. */
function automationRefs(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const path of sources) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/skill_name:\s*'([a-z_][a-z0-9_]*)'/g)) {
      out.push([path.split('/').pop()!, m[1]]);
    }
  }
  return out;
}

describe('automation seeds', () => {
  it('every automation references a declared skill', () => {
    const skills = declaredSkills();
    const broken = automationRefs()
      .filter(([, name]) => !skills.has(name))
      .map(([file, name]) => `${file} → ${name}`);
    expect(
      broken,
      `${broken.length} automation(s) point at a skill that does not exist. ` +
      'The automation will fire and fail silently on every trigger.',
    ).toEqual([]);
  });

  it('there are automations to check (the scan itself must not silently find nothing)', () => {
    expect(automationRefs().length).toBeGreaterThan(10);
  });

  it('the field-service invoicing chain is intact end to end', () => {
    // manage_service_order emits service_order.completed → the automation
    // must dispatch to a skill whose RPC exists in a migration.
    const fs = readFileSync(join(modulesDir, 'field-service-module.ts'), 'utf8');
    expect(fs).toMatch(/trigger_config:\s*\{\s*event:\s*'service_order\.completed'\s*\}/);
    expect(fs).toMatch(/skill_name:\s*'service_order_to_invoice'/);
    expect(fs).toMatch(/handler:\s*'rpc:service_order_to_invoice'/);

    const migrations = readdirSync(join(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8'));
    expect(
      migrations.some((s) => /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.service_order_to_invoice/i.test(s)),
      'no migration defines public.service_order_to_invoice',
    ).toBe(true);
  });
});
