import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rollsvepet #102: the matrix (role_module_access) is the ONLY dial.
 *
 * The sweep found two structural holes and a family of shadow matrices:
 * agent-execute 401'd every non-admin JWT out of the whole skill layer, and
 * three frontend surfaces carried hardcoded `roles: [...]` lists beside a
 * moduleId — lists the matrix can never reach, so a granted role still saw
 * nothing. These tests pin the repaired invariants so the class stays dead.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('agent-execute authorizes per the skill’s owning module', () => {
  const src = read('supabase/functions/agent-execute/index.ts');

  it('builds the skill → module ownership map from the bundled artifact', () => {
    expect(src).toContain('SKILL_OWNER_MODULE');
    expect(src).toMatch(/for \(const mod of \(bundledModuleSkills/);
  });

  it('gates non-admin JWT callers with can_access_module, after the skill lookup', () => {
    expect(src).toMatch(/can_access_module/);
    // The old shape — 401 for every non-admin before the body is read — must
    // not come back: authentication may reject unknowns, but a resolved user
    // without admin proceeds to per-skill authorization.
    expect(src).toContain('if (!isServiceCaller && !gateUserId)');
    expect(src).toContain('if (!isServiceCaller && !gateIsAdmin)');
  });

  it('fails closed: platform-owned and unmapped skills stay admin-only', () => {
    expect(src).toMatch(/ownerModule !== 'platform'/);
  });

  it('the 403 names the module and the dial, so a denial self-corrects', () => {
    // Motiveringen bor numera i beslutet, inte i anroparen — och prövas på
    // riktigt i "en nekan säger vad operatören ska göra åt saken" nedan.
    const decisionSrc = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/skill-access.ts'), 'utf-8',
    );
    expect(decisionSrc).toContain('Role Permissions');
  });

  /**
   * Matrisens ANDRA SVEP: invoice-creating skills are gated by the module that
   * owns the EFFECT, not the one that owns the code. Six skills mint a real
   * customer invoice (number from the series, rows in the ledger) while living
   * in whichever process module happens to trigger them — so `sales`, holding
   * only `ecommerce`, could issue a live invoice through send_invoice_for_order
   * without ever being granted `invoicing`. The override map re-homes them.
   */
  it('invoice-creating skills are gated by invoicing, wherever they are seeded', () => {
    expect(src).toContain('SKILL_OWNER_MODULE_OVERRIDES');
    for (const name of [
      'send_invoice_for_order',
      'service_order_to_invoice',
      'generate_contract_invoice',
      'pos_sale_to_invoice',
      'generate_subscription_invoice',
    ]) {
      expect(src, `${name} måste grindas av invoicing`).toMatch(
        new RegExp(`${name}:\\s*'invoicing'`),
      );
    }
  });

  it('the override is applied AFTER the artifact loop, so a regen cannot undo it', () => {
    const loopAt = src.indexOf('for (const s of mod.skills) SKILL_OWNER_MODULE');
    const applyAt = src.indexOf('Object.entries(SKILL_OWNER_MODULE_OVERRIDES)');
    expect(loopAt).toBeGreaterThan(-1);
    expect(applyAt).toBeGreaterThan(loopAt);
  });

  /**
   * initiate_company_invoice_payment stays on `companies` deliberately: it
   * creates nothing, resolves one of the caller's OWN company's unpaid invoices
   * and hands back the payment link. Its real gate is company membership
   * (companyScopeGuard, rung 3), and it is reached with the service key, so the
   * module gate never applies. Re-homing it would be theatre.
   */
  it('the read-only company payment link skill is NOT re-homed to invoicing', () => {
    expect(src).not.toMatch(/initiate_company_invoice_payment:\s*'invoicing'/);
    expect(src).toContain("companyScopeGuard(args, 'buyer')");
  });
});

describe('no shadow role lists beside a moduleId (frontend)', () => {
  it('dashboard widget relevance reads the matrix, not a third role list', () => {
    const presets = read('src/lib/dashboard-presets.ts');
    expect(presets).toMatch(/canAccess: \(moduleId: string\) => boolean/);
    // ROLE_PRESETS (personalization defaults) are allowed — widget-level
    // `roles:` gates are not.
    const catalog = presets.split('ROLE_PRESETS')[0];
    expect(catalog).not.toMatch(/roles: \[/);
  });

  it('the ⌘K palette filters nav hits on the matrix, same as the sidebar', () => {
    const cmd = read('src/components/admin/AdminSearchCommand.tsx');
    expect(cmd).toMatch(/canAccess\(item\.moduleId\)/);
  });

  it('expense approval follows the expenses module, not the admin role', () => {
    const tab = read('src/components/admin/expenses/ExpenseReportsTab.tsx');
    expect(tab).toMatch(/canAccess\('expenses'\)/);
    expect(tab).not.toMatch(/\bisAdmin\b/);
  });
});

describe('nav honesty: one module id, one answer', () => {
  const nav = read('src/components/admin/adminNavigation.ts');

  it('Campaigns follows paidGrowth (the "developer" copy-paste bug stays dead)', () => {
    expect(nav).not.toMatch(/Campaigns[^\n]*moduleId: "developer"/);
    expect(nav).toMatch(/Campaigns[^\n]*moduleId: "paidGrowth"/);
  });

  it('only the documented platform tools keep a moduleId inside adminOnly groups', () => {
    // Templates + Developer are deliberately admin-only platform tooling.
    // Any OTHER moduleId-carrying item inside an adminOnly group repeats the
    // POS-Audit bug: the same module id answered differently per code path.
    const groups = nav.split(/\{\s*\n\s*(?:\/\/[^\n]*\n\s*)*label:/).slice(1);
    const offenders: string[] = [];
    for (const g of groups) {
      if (!/adminOnly:\s*true/.test(g)) continue;
      for (const m of g.matchAll(/name: "([^"]+)"[^\n]*moduleId: "([^"]+)"/g)) {
        if (!['Templates', 'Developer'].includes(m[1])) offenders.push(`${m[1]} (${m[2]})`);
      }
    }
    expect(offenders, `moduleId-bärande rader fångna i adminOnly-grupper: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('staff means non-customer', () => {
  it('isWriter never counts the customer role as staff', () => {
    const auth = read('src/hooks/useAuth.tsx');
    expect(auth).toMatch(/effectiveRoles\.some\(\(r\) => r !== 'customer'\)/);
    expect(auth).not.toContain('effectiveRoles.length > 0;');
  });
});

describe('every ai-task declares its owning module', () => {
  it('TaskSpec.module is required and every task sets it', () => {
    const tasks = read('supabase/functions/ai-task/tasks.ts');
    expect(tasks).toMatch(/^\s+module: string;/m);
    const names = [...tasks.matchAll(/^\s+name: "([a-z_]+)",$/gm)].map((m) => m[1]);
    const withModule = [...tasks.matchAll(/^\s+name: "([a-z_]+)",\n\s+module: "/gm)].map((m) => m[1]);
    // Every task registered by name must be immediately followed by module.
    const taskNames = names.filter((n) => !n.startsWith('submit_') && !n.startsWith('extract_'));
    for (const n of taskNames) {
      expect(withModule, `task "${n}" saknar module-fält`).toContain(n);
    }
  });
});

describe('manage_page_blocks update never nests a full block into data', () => {
  it('unwraps {id,type,data}-shaped block_data and scrubs the corruption it caused', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    // The instructions called block_data a "Block object"; callers sent exactly
    // that and the bare spread nested it under data.* while rendered fields
    // stayed stale (optic, 2026-08-17). The unwrap must stay.
    expect(src).toContain('_isFullBlock');
    expect(src).toMatch(/_incoming = _isFullBlock \? \(block_data as any\)\.data : block_data/);
  });
});

// ─── Beslutet, körd — inte bara omnämnt ─────────────────────────────────────
//
// Mutationsrevisionen 2026-08-30 satte `allowed = true` i den inbyggda
// versionen och samtliga 15 påståenden nedan förblev gröna: de bevisade att
// strängen `can_access_module` fanns i filen, inte att någon nekades. En
// auktorisationsgrind som inte ser fail-open intygar det den aldrig prövade.
// Därför ligger beslutet numera i _shared/skill-access.ts och anropas här.
describe('matrisen nekar på riktigt — beslutet körs', () => {
  const load = async () => (await import('../../../supabase/functions/_shared/skill-access.ts')).decideSkillAccess;

  it('service-rollen och admin släpps igenom', async () => {
    const decide = await load();
    expect(decide({ isServiceCaller: true, isAdmin: false, ownerModule: undefined, moduleGranted: false }).allowed).toBe(true);
    expect(decide({ isServiceCaller: false, isAdmin: true, ownerModule: 'platform', moduleGranted: false }).allowed).toBe(true);
  });

  it('en beviljad modul släpps igenom — men bara på ett strikt true', async () => {
    const decide = await load();
    const base = { isServiceCaller: false, isAdmin: false, ownerModule: 'crm' };
    expect(decide({ ...base, moduleGranted: true }).allowed).toBe(true);
    // Allt annat är en nekan. Ett misslyckat rpc ger null, och en null som
    // läses som "ingen invändning" är hur behörighet tyst vänds.
    for (const granted of [false, null, undefined, 'true', 1, {}, []]) {
      expect(decide({ ...base, moduleGranted: granted }).allowed).toBe(false);
    }
  });

  it('plattformsägda och omappade skills är admin-only — fail closed', async () => {
    const decide = await load();
    const base = { isServiceCaller: false, isAdmin: false, moduleGranted: true };
    expect(decide({ ...base, ownerModule: 'platform' }).allowed).toBe(false);
    expect(decide({ ...base, ownerModule: undefined }).allowed).toBe(false);
    expect(decide({ ...base, ownerModule: '' }).allowed).toBe(false);
    expect(decide({ ...base, ownerModule: null }).allowed).toBe(false);
  });

  it('en nekan säger vad operatören ska göra åt saken', async () => {
    const decide = await load();
    const d = decide({ isServiceCaller: false, isAdmin: false, ownerModule: 'crm', moduleGranted: false });
    expect(d.reason).toMatch(/not granted the "crm" module/);
    expect(d.reason).toMatch(/Role Permissions/);
  });

  it('och anroparen använder beslutet i stället för en egen flagga', async () => {
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf-8',
    );
    expect(src).toMatch(/const decision = decideSkillAccess\(\{/);
    expect(src).toMatch(/if \(!decision\.allowed\) \{/);
    // Den lokala flaggan som gick att sätta till true är borta.
    expect(src).not.toMatch(/let allowed = false;/);
  });
});
