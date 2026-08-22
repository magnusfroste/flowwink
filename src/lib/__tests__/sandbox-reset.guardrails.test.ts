import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_SKILLS } from '@/lib/platform-seeds';

/**
 * Guardrail: the sandbox reset can never fire on a customer instance, and
 * always preserves the layers a reset must not destroy.
 *
 * sandbox.flowwink.com's model (Magnus, 2026-07-22): testers get FULL admin;
 * the nightly rebuild is the safety mechanism. That makes reset_sandbox the
 * most dangerous skill in the fleet if its gates ever loosen — it is seeded
 * everywhere (artifact parity), so the gates ARE the product.
 */

const root = process.cwd();
const MIGRATIONS = join(root, 'supabase/migrations');

/**
 * The LATEST definition of the wipe. A guardrail reading a superseded file
 * would certify a body no instance runs — so this must move with the function.
 *
 * It used to be a hardcoded filename, and it had already gone stale: the pin
 * still pointed at 20260813100000 after 20260823020000 redefined
 * sandbox_reset_wipe to carry the testbed veto. Every assertion below was
 * passing against a body the fleet no longer ran, which is the exact failure
 * mode the comment warned about. So resolve it instead of naming it — a pin
 * that has to be remembered is a pin that will be forgotten.
 */
function latestMigrationDefining(fn: string): string {
  const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`, 'i');
  const hit = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => re.test(readFileSync(join(MIGRATIONS, f), 'utf8')));
  if (!hit) throw new Error(`No migration defines ${fn}`);
  return readFileSync(join(MIGRATIONS, hit), 'utf8');
}

const mig = latestMigrationDefining('sandbox_reset_wipe');
const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

describe('sandbox reset safety', () => {
  it('the SQL wipe is triple-gated and atomic', () => {
    expect(mig).toContain("p_confirm IS DISTINCT FROM 'WIPE-SANDBOX'");
    // Gate = the visible Demo Mode toggle (legacy sandbox_mode honored).
    expect(mig).toMatch(/demo_mode/);
    expect(mig).toMatch(/auth\.role\(\) = 'service_role' OR has_role/);
    // Invariant check that rolls the whole transaction back on keep-table damage.
    expect(mig).toMatch(/rollback: a keep-table was emptied/);
  });

  it('the keep-list preserves every seeded layer, identity and credentials', () => {
    // Reference data whose only source is a migration MUST survive: migrations
    // do not re-run, so a wipe that takes them is permanent. Losing
    // payroll_country_profiles broke the hr seeder on the first rebuilt night;
    // the sweep that followed found seventeen more, including the role/nav
    // matrix from the post-squash empty-views incident and the VAT box map.
    for (const t of [
      'payroll_country_profiles',
      'role_module_access',
      'role_module_access_defaults',
      'account_tax_boxes',
      'journals',
      'currencies',
      'pipeline_stages',
      'uoms',
      'agent_skills',
      'agent_automations',
      'chart_of_accounts',
      'account_roles',
      'accounting_templates',
      'locale_packs',
      'site_settings',
      'user_roles',
      'profiles',
      'api_keys',
    ]) {
      expect(mig, `${t} missing from the wipe keep-list`).toMatch(new RegExp(`'${t}'`));
    }
  });

  it('the wipe is not executable by ordinary authenticated users', () => {
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.sandbox_reset_wipe/);
    expect(mig, 'wipe granted to authenticated').not.toMatch(/GRANT EXECUTE ON FUNCTION public\.sandbox_reset_wipe\(text\) TO authenticated/);
  });

  it('the handler refuses on non-sandbox instances BEFORE calling the wipe', () => {
    const start = ae.indexOf('async function executeResetSandbox');
    expect(start).toBeGreaterThan(0);
    const body = ae.slice(start, ae.indexOf('async function', start + 10));
    const refusal = body.indexOf('reset_sandbox refused');
    const rpc = body.indexOf("rpc('sandbox_reset_wipe'");
    expect(refusal).toBeGreaterThan(0);
    expect(rpc).toBeGreaterThan(refusal);
    // And the wipe call carries the confirm token, never a variable.
    expect(body).toContain("p_confirm: 'WIPE-SANDBOX'");
  });

  it('the skill seed is marked demo-only for the model that will see it fleet-wide', () => {
    const skill = PLATFORM_SKILLS.find((s) => s.name === 'reset_sandbox');
    expect(skill).toBeTruthy();
    expect(skill?.handler).toBe('internal:reset_sandbox');
    expect(skill?.description).toMatch(/^DEMO INSTANCE ONLY/);
  });

  it('demo-cycle runs the full rebuild through the skill rail, gated the same way', () => {
    // One toggle, one implementation: the nightly job must not grow its own
    // wipe path — it calls reset_sandbox via agent-execute so the gates and
    // the agent_activity evidence live in exactly one place.
    const dc = readFileSync(join(root, 'supabase/functions/demo-cycle/index.ts'), 'utf8');
    expect(dc).toMatch(/skill_name: "reset_sandbox"/);
    expect(dc).toMatch(/demo_mode/);
    expect(dc, 'the rebuild must not bypass the rail with its own wipe call')
      .not.toMatch(/rpc\("sandbox_reset_wipe"/);
  });
});
