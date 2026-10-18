import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_CLIENTS } from '../agent-clients';
import { MISSION_TEMPLATES } from '../agent-missions';
import { buildAgentPrompt } from '../agent-prompt';
import { rankableDef, scoreSkillsByIntent } from '../../../supabase/functions/_shared/skills/intent-scorer.ts';

/**
 * Guardrail: an agent's first five minutes on the sandbox work.
 *
 * Walked end to end on sandbox.flowwink.com (2026-10-18) as a tester would:
 * connect an agent in the wizard, paste the config, ask for the obvious things.
 * Six things stood between a tester and "it works":
 *  1. "Write a blog post" was refused — the demo was born without a Business
 *     Identity, and write_blog_post (rightly) will not ground a post in nothing.
 *  2. The Claude Desktop config was { type: 'http', url, headers } — Desktop's
 *     config file starts LOCAL servers; a remote one needs the mcp-remote bridge.
 *  3. "create a quote for a customer" ranked create_return first: the engine
 *     ranked tool_definition's description, and 520 of 626 seeds kept their
 *     "Use when:" only on the row's canonical description.
 *  4. The Full Operator mission said "There is NO built-in agent" while
 *     FlowPilot was on — the pair must be told from live state.
 *  5. A key whose peer row was wiped (the sandbox keeps api_keys) came back
 *     ownerless — full reach — though the key knew who minted it.
 *  6. The wizard asked "What is it for?" in the main path; it read as a role
 *     picker and never changed a permission.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe("an agent's first five minutes", () => {
  it('1. only a demo template carries a fictional identity, written insert-if-absent on both install paths', () => {
    const dir = join(root, 'src/data/templates');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && x !== 'types.ts' && x !== 'index.ts')) {
      const src = read(`src/data/templates/${f}`);
      if (!/demoIdentity:/.test(src)) continue;
      expect(src, `${f} carries demoIdentity but is not a demo (platform) template`).toMatch(/category: 'platform'/);
    }
    expect(read('src/data/templates/demo-company.ts')).toMatch(/demoIdentity: \{\s*company_name: '/);

    const ae = read('supabase/functions/agent-execute/index.ts');
    const aeBlock = ae.slice(ae.indexOf('if (template.demoIdentity'), ae.indexOf('let localeActivated'));
    expect(aeBlock).toMatch(/eq\('key', 'company_profile'\)/);
    expect(aeBlock).toMatch(/if \(!existingProfile\)/);

    const ui = read('src/hooks/useTemplateInstaller.ts');
    const uiBlock = ui.slice(ui.indexOf('if (template.demoIdentity'), ui.indexOf('Activate an accounting locale'));
    expect(uiBlock).toMatch(/eq\('key', 'company_profile'\)/);
    expect(uiBlock).toMatch(/if \(!existingProfile\)/);
  });

  it('2. the Claude snippet gives Claude Code its command and Claude Desktop the mcp-remote bridge', () => {
    const claude = AGENT_CLIENTS.find((c) => c.id === 'claude')!;
    const s = claude.snippet('https://x.supabase.co/functions/v1/mcp-server?mode=dispatch', 'fwk_test');
    expect(s).toMatch(/claude mcp add --transport http flowwink "https:\/\/x\.supabase\.co[^"]*" --header "Authorization: Bearer fwk_test"/);
    const desktop = JSON.parse(s.slice(s.indexOf('{')));
    const server = desktop.mcpServers.flowwink;
    expect(server.command).toBe('npx');
    expect(server.args).toContain('mcp-remote');
    expect(server.type).toBeUndefined();
    expect(server.env.FLOWWINK_AUTH).toBe('Bearer fwk_test');
  });

  it('2b. the first message to the agent carries endpoint and header, not a client config that only some clients read', () => {
    // Cloud walk-through of #676: the config box was fixed, the prompt still
    // said "Paste this whole block into your MCP client config" over the
    // { url, headers } shape Claude Desktop does not start.
    const p = buildAgentPrompt({
      mission: MISSION_TEMPLATES.find((m) => m.id === 'full-operator')!,
      instructions: 'x', mcpUrl: 'https://abc.supabase.co/functions/v1/mcp-server', rawKey: 'fwk_test', agentName: 'A', ownerName: 'Anna',
    });
    expect(p).not.toMatch(/Paste this whole block/);
    expect(p).not.toMatch(/"mcpServers"/);
    expect(p).toMatch(/\*\*Endpoint\*\*: `https:\/\/abc\.supabase\.co\/functions\/v1\/mcp-server\?mode=dispatch`/);
    expect(p).toMatch(/\*\*Header\*\*: `Authorization: Bearer fwk_test`/);
  });

  it("3. the engine ranks a skill's canonical description, and both consumers build candidates through it", () => {
    const row = {
      description: 'Manage sales quotes. Use when: creating a quote for a customer.',
      tool_definition: { type: 'function', function: { name: 'manage_quote', description: 'Quote lifecycle', parameters: {} } },
    };
    expect(rankableDef(row).function.description).toBe(row.description);
    expect(rankableDef(row).function.parameters).toBe(row.tool_definition.function.parameters);
    expect(rankableDef({ description: '', tool_definition: row.tool_definition })).toBe(row.tool_definition);

    const decoy = {
      description: 'Create a return for a customer order. Use when: a customer returns goods.',
      tool_definition: { type: 'function', function: { name: 'create_return', description: 'Create a return for a customer order. Use when: a customer returns goods.' } },
    };
    const ranked = scoreSkillsByIntent([rankableDef(decoy), rankableDef(row)], 'create a quote for a customer', { maxSkills: 2 });
    expect(ranked[0].function.name).toBe('manage_quote');

    const gw = read('supabase/functions/mcp-server/index.ts');
    expect(gw.match(/matchSkills\.map\(\(s\) => rankableDef\(s\)\)/g)?.length).toBe(2);
    expect(gw).not.toMatch(/matchSkills\.map\(\(s\) => s\.tool_definition\)/);
    const fp = read('supabase/functions/_shared/pilot/reason.ts');
    expect(fp).toMatch(/dispatchDefs = \(raw\?\.skills \|\| \[\]\)\.map\(\(s: any\) => rankableDef\(s\)\)/);
    expect(fp).toMatch(/columns: 'name, description, tool_definition/);
  });

  it("3b. on the real register, the obvious asks find their skill — and a NOT-for word never fines a skill's own subject", () => {
    // The register as CI builds it before tests (the artifact-freshness guard
    // reads the same file). Ranked through rankableDef, as both consumers do.
    const art = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Array<{ description?: string; tool_definition?: unknown }> }> };
    const defs = art.modules.flatMap((m) => m.skills).map((s) => rankableDef(s as never)).filter((d) => d?.function?.name);
    const top = (q: string, n: number) => scoreSkillsByIntent(defs, q, { maxSkills: n }).map((d: { function: { name: string } }) => d.function.name);
    expect(top('create a quote for a customer', 1)).toEqual(['manage_quote']);
    expect(top('create a new lead for a company contact', 1)).toEqual(['add_lead']);
    expect(top('write and publish a blog post', 1)).toEqual(['write_blog_post']);
    // log_time: "Log time entries for projects … NOT for: project management".
    // Without the opening sentence in its own vocabulary, "project" in the ask
    // fined it out of the top three behind manage_project and its siblings.
    expect(top('log time on a project', 3)).toContain('log_time');
  });

  it('4. FlowPilot and a connected agent are told they are a pair, from live state', () => {
    const full = MISSION_TEMPLATES.find((m) => m.id === 'full-operator')!;
    expect(full.instructions).not.toMatch(/There is NO built-in agent/);
    expect(full.instructions).toMatch(/you\.works_with/);
    const gw = read('supabase/functions/mcp-server/index.ts');
    expect(gw).toMatch(/async function describeCaller\(apiKeyId: string \| null, flowpilotEnabled = false\)/);
    expect(gw).toMatch(/works_with: flowpilotEnabled/);
    expect(gw).toMatch(/describeCaller\(requestContext\.getStore\(\)\?\.callerApiKeyId \?\? null, flowpilotEnabled\)/);
  });

  it('5. a recreated peer is owned by the person who minted its key', () => {
    const gw = read('supabase/functions/mcp-server/index.ts');
    const fn = gw.slice(gw.indexOf('async function upsertInboundMcpPeer'), gw.indexOf('// ---------- load tools ----------'));
    expect(fn).toMatch(/select\("name, created_by"\)/);
    expect(fn).toMatch(/owner_user_id: ownerUserId/);
    expect(fn).not.toMatch(/\$\{keyRow\.name\} \(MCP\)/);
  });

  it('6. the wizard asks for a name and a client; owner and focus sit behind Advanced', () => {
    const w = read('src/components/admin/agents/ConnectAgentWizard.tsx');
    const form = w.slice(w.indexOf('<CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Connect an agent'));
    const advanced = form.indexOf('<Collapsible>');
    expect(advanced).toBeGreaterThan(-1);
    expect(form.indexOf('Who does it act for?')).toBeGreaterThan(advanced);
    expect(form.indexOf('<Label>Focus</Label>')).toBeGreaterThan(advanced);
    expect(form).not.toMatch(/<Label>What is it for\?<\/Label>/);
    expect(w).not.toMatch(/Peter's Hermes/);
    expect(read('src/components/admin/agents/ConnectedAgentsTable.tsx')).not.toMatch(/request_count\} calls/);
  });
});
