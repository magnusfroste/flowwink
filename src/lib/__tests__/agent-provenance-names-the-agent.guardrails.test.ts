import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { provenanceLabel } from '@/lib/agent-provenance';

/**
 * A row an agent wrote says WHICH agent, and the history says who.
 *
 * Before 2026-10-08 a wiki page Peter's Hermes edited read "by Magnus via
 * external agent" (the key's creator, the transport) and its revision carried
 * no editor at all (the trigger took auth.uid(), NULL under the service role).
 * Trust in agents doing administrative work rests on both halves being right,
 * on the row and in the history — these guards keep the chain intact from the
 * gateway to the screen.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const gateway = read('supabase/functions/mcp-server/index.ts');
const executor = read('supabase/functions/agent-execute/index.ts');
const migration = read('supabase/migrations/20261008130000_wikin-sager-vilken-agent.sql');

describe('the gateway names the agent', () => {
  it('passes the connected agent\'s own name to agent-execute on every execution path', () => {
    expect(gateway).toMatch(/c\.set\("apiKeyAgentName" as never, peerIdentity\.name as never\)/);
    expect(gateway).toMatch(/caller_agent_name: callerAgentName \?\? undefined/);
    // dispatch execute_skill, per-skill tools, and both REST paths
    const calls = gateway.match(/await executeSkill\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) expect(call, call).toMatch(/ctx\?\.agentName \?\? null|agentNameOf\(c\)/);
    expect(gateway).toMatch(/agentName: agentNameOf\(c\) \}, \(\) => handler\(c\.req\.raw\)\)/);
  });
});

describe('the executor stamps it server-side', () => {
  it('reads caller_agent_name only from an mcp caller and overwrites anything model-supplied', () => {
    expect(executor).toMatch(/const caller_agent_name = agent_type === 'mcp' && typeof bodyCallerAgentName === 'string'/);
    expect(executor).toMatch(/if \(caller_agent_name\) \(args as Record<string, unknown>\)\._caller_agent_name = caller_agent_name;\n\s+else delete \(args as Record<string, unknown>\)\._caller_agent_name;/);
  });

  it('wiki rows and generic db: rows prefer the agent name over the transport', () => {
    expect(executor).toMatch(/function agentStamp\(args: Record<string, unknown>\): string \| null/);
    expect(executor).toMatch(/created_by_agent: agentStamp\(args\),\n\s+updated_by_agent: agentStamp\(args\),/);
    expect(executor).toMatch(/patch\.updated_by_agent = agentStamp\(args\);/);
    expect(executor).toMatch(/cleanInsert\.created_by_agent = auditCtx\.caller_agent_name \?\? auditCtx\.agent_type/);
    expect(executor).toMatch(/cleanUpdate\.updated_by_agent = auditCtx\.caller_agent_name \?\? auditCtx\.agent_type/);
    expect(read('supabase/functions/_shared/agent-audit.ts')).toMatch(/caller_agent_name\?: string;/);
  });
});

describe('the history says who', () => {
  it('the revision trigger falls back to the row\'s editor when there is no auth.uid(), and keeps the agent', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS edited_by_agent text/);
    expect(migration).toMatch(/v_editor := COALESCE\(auth\.uid\(\), NEW\.updated_by\);\s*\n\s*v_agent := NEW\.updated_by_agent;/);
    expect(migration).toMatch(/INSERT INTO public\.wiki_page_revisions \(slug, title, content_md, revision_no, action, edited_by, edited_by_agent\)/);
  });

  it('wiki_page_history returns the editor\'s name and agent, and a human restore clears the agent stamp', () => {
    expect(migration).toMatch(/rv\.edited_by, rv\.edited_by_agent, rv\.revised_at/);
    expect(migration).toMatch(/AS edited_by_name/);
    expect(migration).toMatch(/updated_by = auth\.uid\(\), updated_by_agent = NULL/);
  });

  it('the page footer and the history sheet render the same label', () => {
    expect(read('src/pages/admin/WikiPage.tsx')).toMatch(/provenanceLabel\(userId \? authorNames\?\.get\(userId\) : null, agent\)/);
    const sheet = read('src/components/admin/wiki/WikiHistorySheet.tsx');
    expect(sheet).toMatch(/provenanceLabel\(rev\.edited_by_name, rev\.edited_by_agent\)/);
    expect(read('src/integrations/supabase/types.ts')).toMatch(/edited_by_agent: string \| null/);
  });
});

describe('provenanceLabel', () => {
  it('reads as a sentence fragment a colleague can trust', () => {
    expect(provenanceLabel('Peter', 'Hermes_peter')).toBe('Peter via Hermes_peter');
    expect(provenanceLabel('Peter', 'mcp')).toBe('Peter via external agent');
    expect(provenanceLabel(null, 'flowpilot')).toBe('FlowPilot');
    expect(provenanceLabel('Anna', null)).toBe('Anna');
    expect(provenanceLabel(null, null)).toBeNull();
  });
});
