// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownerModuleOf, SKILL_OWNER_MODULE_OVERRIDES } from '../../../supabase/functions/_shared/skills/owner-module';
import { SKILL_OWNER_MODULE } from '../../../supabase/functions/_shared/skills/skill-modules';

/**
 * A colleague connects their own agent without an admin — and the agent can do
 * the owner's job.
 *
 * Found on optic, 2026-10-26/27: Svante (sales + marketing) was made admin
 * "so he could log in". He was logged in the whole time (a Safari session from
 * August, refreshed that morning); what he got was Access Denied:
 *
 *  - /admin/agents required `federation`, which no role on optic holds
 *    (deliberate 2026-08-13: keys and missions as instance infrastructure);
 *  - /account/agents, the staff door of #649 ("No admin needed"), sends every
 *    staff member without a customer role to /admin (2026-08-17) — a door
 *    built behind a wall, and its guard checked that it existed, not that
 *    anyone could reach it.
 *
 * And once his role goes back: an agent is held to its owner's modules, but
 * describe_blocks and inspect_rendered_page are platform seeds ⇒ admin-only,
 * so the page-writing agent would go blind (reads the contract first, looks
 * at the result after — the designed workflow). The owner-module overrides
 * lived in agent-execute alone; the gateway read the seeded map — the same
 * split let a contracts-owner's agent mint an invoice over MCP without
 * `invoicing`.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('one owner-module table for every surface that offers or runs a skill', () => {
  it('the override wins over the seeded map, and the seeded map stands where there is none', () => {
    expect(SKILL_OWNER_MODULE['describe_blocks']).toBe('platform');
    expect(ownerModuleOf('describe_blocks')).toBe('pages');
    expect(ownerModuleOf('inspect_rendered_page')).toBe('pages');
    expect(SKILL_OWNER_MODULE['generate_contract_invoice']).toBe('contracts');
    expect(ownerModuleOf('generate_contract_invoice')).toBe('invoicing');
    expect(ownerModuleOf('manage_page')).toBe('pages');
    expect(ownerModuleOf('no_such_skill')).toBeNull();
  });

  it('every override names a real module, never platform', () => {
    const modules = new Set(Object.values(SKILL_OWNER_MODULE));
    for (const [skill, mod] of Object.entries(SKILL_OWNER_MODULE_OVERRIDES)) {
      expect(mod, skill).not.toBe('platform');
      expect(modules.has(mod), `${skill} → ${mod} is not a module any skill is seeded in`).toBe(true);
      expect(skill in SKILL_OWNER_MODULE, `${skill} is not a seeded skill`).toBe(true);
    }
  });

  it('agent-execute, the gateway and workspace-chat all read it — nobody keeps a private copy', () => {
    for (const f of ['supabase/functions/agent-execute/index.ts', 'supabase/functions/mcp-server/index.ts', 'supabase/functions/workspace-chat/index.ts']) {
      expect(read(f), f).toMatch(/_shared\/skills\/owner-module\.ts/);
      expect(read(f), f).not.toMatch(/const SKILL_OWNER_MODULE_OVERRIDES/);
      expect(read(f), f).not.toMatch(/from ["']\.\.\/_shared\/skills\/skill-modules\.ts["']/);
    }
  });
});

describe('the staff door is on the staff side of the wall', () => {
  const nav = read('src/components/admin/adminNavigation.ts');
  const page = read('src/pages/admin/AgentsPage.tsx');

  it('/admin/agents carries no module gate in the sidebar', () => {
    expect(nav).toMatch(/\{ name: "Agents", href: "\/admin\/agents", icon: Network \}/);
    expect(nav).not.toMatch(/href: "\/admin\/agents", icon: Network, moduleId/);
  });

  it('the page decides by the matrix: federation or admin manages everyone, anyone else gets My agents', () => {
    expect(page).toMatch(/const managesAgents = isAdmin \|\| \(roles as AppRole\[\]\)\.some\(\(r\) => accessMap\?\.\[r\]\?\.has\('federation'\)\)/);
    expect(page).toMatch(/managesAgents \? <EveryonesAgents \/> : <MyAgents \/>/);
    const mine = page.slice(page.indexOf('function MyAgents()'), page.indexOf('function EveryonesAgents()'));
    expect(mine).toMatch(/<ConnectedAgentsTable mine \/>/);
    expect(mine).toMatch(/<ConnectAgentWizard mode="self" \/>/);
    // the owner column, activity, findings and dispatch stay with the managers
    expect(mine).not.toMatch(/McpActivityLog|McpFindings|OpenClawDispatch|mode="admin"/);
  });

  it('the staff redirect in the portal still stands — the fix is a reachable door, not a hole in the wall', () => {
    expect(read('src/pages/account/AccountLayout.tsx')).toMatch(/if \(rolesReady && roles\.length > 0 && !roles\.includes\('customer'\)\) \{\s*return <Navigate to="\/admin" replace \/>;/);
  });
});
