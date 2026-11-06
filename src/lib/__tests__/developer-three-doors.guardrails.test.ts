/**
 * Developer has three doors, each for a different reader (2026-11-06): MCP
 * Keys (agents and scripts), Content API (your own front-end), Webhooks
 * (other systems). Skills — what agents may do — is the operator's question
 * and lives on /admin/skills (Browse | Manage), so there is ONE skills page,
 * not three. "Dev Tools" (a mock webhook logger in React state beside the
 * real delivery log, two "Coming soon" cards) and the n8n brochure are gone.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('Developer: three doors', () => {
  it('MCP Keys, Content API, Webhooks — each introduced by who it is for; the old skills link still lands', () => {
    const dev = read('src/pages/admin/DeveloperPage.tsx');
    expect(dev).toMatch(/const TABS = \['mcp-keys', 'api', 'webhooks'\] as const;/);
    expect(dev).toMatch(/const INTRO: Record<Tab, string>/);
    expect(dev).toMatch(/if \(requested === 'mcp-skills'\) return <Navigate to="\/admin\/skills\?tab=manage" replace \/>;/);
    expect(dev).not.toMatch(/DevToolsContent|McpSkillsPanel|devtools/);
    expect(existsSync('src/pages/admin/DeveloperToolsPage.tsx')).toBe(false);
    expect(existsSync('src/components/admin/N8NTemplates.tsx')).toBe(false);
    expect(read('src/pages/admin/WebhooksPage.tsx')).not.toMatch(/N8N/);
  });

  it('the Content API explorer runs as the signed-in person, links docs that exist, and sends agents to the wizard', () => {
    const api = read('src/pages/admin/ContentApiPage.tsx');
    expect(api).toMatch(/async function explorerHeaders\(\)/);
    expect(api).toMatch(/headers: await explorerHeaders\(\)/g);
    expect(api.match(/await explorerHeaders\(\)/g)?.length).toBe(2);
    expect(api).toMatch(/docs\/reference\/headless-api\.md/);
    expect(existsSync('docs/reference/headless-api.md')).toBe(true);
    expect(api).not.toMatch(/TabsTrigger value="mcp"/);
    expect(api).toMatch(/to="\/admin\/agents\?tab=connect"/);
    expect(read('src/pages/admin/AgentsPage.tsx')).toMatch(/params\.get\('tab'\) === 'connect' \? 'connect' : 'agents'/);
  });

  it('one skills page: Browse | Manage on /admin/skills, in the admin-only System group beside Modules, and every old link points there', () => {
    const skills = read('src/pages/admin/SkillsCatalogPage.tsx');
    expect(skills).toMatch(/<TabsTrigger value="browse"/);
    expect(skills).toMatch(/<TabsTrigger value="manage"/);
    expect(skills).toMatch(/\{tab === 'manage' \? <McpSkillsPanel \/> : \(/);
    const nav = read('src/components/admin/adminNavigation.ts');
    const system = nav.slice(nav.indexOf('label: "System"'));
    expect(system).toMatch(/\{ name: "Modules", href: "\/admin\/modules", icon: Puzzle \},[\s\S]*?\{ name: "Skills", href: "\/admin\/skills", icon: Cpu \},/);
    expect(read('src/components/admin/developer/McpSkillsPanel.tsx')).toMatch(/to="\/admin\/developer\?tab=mcp-keys"/);
    for (const f of ['src/components/admin/modules/ModuleSkillsSection.tsx', 'src/components/admin/copilot/FlowPilotOverviewTab.tsx']) {
      expect(read(f), f).not.toMatch(/tab=mcp-skills/);
      expect(read(f), f).toMatch(/\/admin\/skills\?tab=manage/);
    }
  });
});
