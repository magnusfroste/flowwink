// External MCP servers as skill sources (#862, part 2) — what the executor does.
//
//   executeMcpSourceTool   the `mcp:<source id>/<tool>` handler: one outbound
//                          tools/call, with the source's key from the vault.
//   executeManageMcpSources  the `manage_mcp_sources` skill: list the sources,
//                          look at what a server offers, choose its tools.
//
// A key never passes through here as an argument: skill arguments are written
// to the journal. An admin sets it on the Integrations page, which calls
// set_mcp_source_key(); the executor reads it back with mcp_source_key().

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { mcpCallTool, mcpListTools, McpClientError, type McpToolInfo } from '../mcp/client.ts';
import {
  MCP_MAX_TOOLS_PER_SOURCE,
  mcpAnswerEnvelope,
  parseMcpHandler,
  planMcpSkills,
  type McpSourceRow,
  type McpToolMode,
} from '../mcp/sources.ts';

type Db = SupabaseClient;
type Answer = Record<string, unknown>;

const SOURCE_COLUMNS = 'id, slug, name, url, enabled, read_only, has_key, server_name, available_tools, tools, last_checked_at, last_error';

function fail(code: string, error: string, hint: string, retryable = false): Answer {
  return { error, code, retryable, hint };
}

function clientFault(e: unknown, source: Pick<McpSourceRow, 'name'>): Answer {
  if (e instanceof McpClientError) {
    if (e.code === 'URL_NOT_ALLOWED') return fail('URL_NOT_ALLOWED', `${source.name}: ${e.message}`, 'The address of an MCP source must be a public https address.');
    if (e.code === 'UNAUTHORIZED') return fail('EXTERNAL_UNAUTHORIZED', `${source.name}: ${e.message}`, 'An admin sets a working key under Integrations → Connected MCP servers.');
    if (e.code === 'UNREACHABLE') return fail('TRANSIENT', `${source.name}: ${e.message}`, 'The external server did not answer. Try again later; if it stays down, tell the person who runs it.', true);
    return fail('EXTERNAL_BAD_ANSWER', `${source.name}: ${e.message}`, 'The server answered, but not as an MCP server should. Check the address (it must be the MCP endpoint itself).');
  }
  return fail('HANDLER_ERROR', `${source.name}: ${e instanceof Error ? e.message : String(e)}`, 'An unexpected fault in the MCP client.');
}

async function loadSource(supabase: Db, by: { id?: string; slug?: string }): Promise<McpSourceRow | null> {
  let q = supabase.from('mcp_sources').select(SOURCE_COLUMNS);
  q = by.id ? q.eq('id', by.id) : q.eq('slug', String(by.slug ?? '').toLowerCase().trim());
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`mcp_sources read failed: ${error.message}`);
  return (data as McpSourceRow | null) ?? null;
}

async function keyOf(supabase: Db, source: McpSourceRow): Promise<string | null> {
  if (!source.has_key) return null;
  const { data, error } = await supabase.rpc('mcp_source_key', { p_source_id: source.id });
  if (error) throw new Error(`the key of ${source.name} could not be read: ${error.message}`);
  return typeof data === 'string' && data ? data : null;
}

/** The `mcp:` handler. */
export async function executeMcpSourceTool(supabase: Db, handler: string, args: Record<string, unknown>): Promise<Answer> {
  const parsed = parseMcpHandler(handler);
  if (!parsed) return fail('HANDLER_ERROR', `Not an MCP handler: ${handler}`, 'An mcp: handler is mcp:<source id>/<tool>.');
  const source = await loadSource(supabase, { id: parsed.sourceId });
  if (!source) return fail('NOT_FOUND', 'The MCP source this skill belongs to no longer exists.', 'The connection was removed. An admin reconnects it under Integrations.');
  if (!source.enabled) {
    return { status: 'refused', code: 'SOURCE_DISABLED', retryable: false, hint: `${source.name} is switched off under Integrations → Connected MCP servers.` };
  }
  // The stored choice is the authority, not the skill row: a tool taken off
  // the list is not called even if its row lingers, and a source set back to
  // read-only stops its writing tools at once.
  const chosen = (source.tools ?? []).find((t) => t.name === parsed.tool);
  if (!chosen) {
    return { status: 'refused', code: 'TOOL_NOT_CHOSEN', retryable: false, hint: `"${parsed.tool}" is no longer among the tools chosen for ${source.name}.` };
  }
  if (chosen.mode === 'write' && source.read_only) {
    return { status: 'refused', code: 'SOURCE_READ_ONLY', retryable: false, hint: `${source.name} is connected read-only; "${parsed.tool}" writes.` };
  }
  // The platform's own bookkeeping keys never leave the building.
  const outbound: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) if (!key.startsWith('_')) outbound[key] = value;
  try {
    const answer = await mcpCallTool({ url: source.url, key: await keyOf(supabase, source) }, parsed.tool, outbound);
    return mcpAnswerEnvelope(source, parsed.tool, answer);
  } catch (e) {
    return clientFault(e, source);
  }
}

function publicView(source: McpSourceRow, skills: Array<{ name: string; handler: string }> = []): Answer {
  return {
    id: source.id,
    slug: source.slug,
    name: source.name,
    url: source.url,
    enabled: source.enabled,
    read_only: source.read_only,
    has_key: source.has_key,
    server_name: source.server_name ?? null,
    offered_tools: (source.available_tools ?? []).length,
    chosen_tools: (source.tools ?? []).map((t) => ({ ...t, skill: skills.find((s) => s.handler.endsWith(`/${t.name}`))?.name ?? null })),
    last_checked_at: (source as unknown as { last_checked_at?: string | null }).last_checked_at ?? null,
    last_error: (source as unknown as { last_error?: string | null }).last_error ?? null,
  };
}

async function skillsOf(supabase: Db, sourceId: string): Promise<Array<{ id: string; name: string; handler: string }>> {
  const { data, error } = await supabase.from('agent_skills').select('id, name, handler').like('handler', `mcp:${sourceId}/%`);
  if (error) throw new Error(`agent_skills read failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; name: string; handler: string }>;
}

/** Ask the server what it offers and remember the answer on the source. */
async function look(supabase: Db, source: McpSourceRow): Promise<{ tools: McpToolInfo[]; serverName: string | null } | { fault: Answer }> {
  try {
    const { tools, serverName } = await mcpListTools({ url: source.url, key: await keyOf(supabase, source) });
    const { error } = await supabase.from('mcp_sources').update({
      server_name: serverName,
      available_tools: tools.map((t) => ({ name: t.name, description: t.description.slice(0, 600), read_only_hint: t.readOnlyHint })),
      last_checked_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', source.id);
    if (error) console.warn('[mcp-sources] could not remember what the server offers:', error.message);
    return { tools, serverName };
  } catch (e) {
    const fault = clientFault(e, source);
    const { error } = await supabase.from('mcp_sources').update({ last_checked_at: new Date().toISOString(), last_error: String(fault.error).slice(0, 500) }).eq('id', source.id);
    if (error) console.warn('[mcp-sources] could not record the failed look:', error.message);
    return { fault };
  }
}

/** The `manage_mcp_sources` skill. */
export async function executeManageMcpSources(supabase: Db, args: Record<string, unknown>): Promise<Answer> {
  const action = String(args.action ?? 'list').toLowerCase().trim();

  if (action === 'list') {
    const { data, error } = await supabase.from('mcp_sources').select(SOURCE_COLUMNS).order('name');
    if (error) throw new Error(`mcp_sources read failed: ${error.message}`);
    const sources = (data ?? []) as McpSourceRow[];
    const out: Answer[] = [];
    for (const s of sources) out.push(publicView(s, await skillsOf(supabase, s.id)));
    return {
      sources: out,
      count: out.length,
      how: 'An admin connects a server under Integrations → Connected MCP servers (address + key), then chooses which of its tools the agent may use. Chosen read tools are skills named query_<source>__<tool>.',
    };
  }

  const source = await loadSource(supabase, { id: typeof args.source_id === 'string' ? args.source_id : undefined, slug: typeof args.source === 'string' ? args.source : undefined });
  if (!source) return fail('NOT_FOUND', 'No such MCP source.', 'Pass source (its short handle) or source_id — action "list" shows them.');

  if (action === 'check') {
    // What the server offers right now, and whether each tool could be a read.
    const seen = await look(supabase, source);
    if ('fault' in seen) return seen.fault;
    const plan = planMcpSkills(source, seen.tools, seen.tools.map((t) => ({ name: t.name, mode: 'read' as McpToolMode })));
    const readable = new Set(plan.skills.map((s) => s.tool));
    return {
      source: source.slug,
      server_name: seen.serverName,
      offered: seen.tools.map((t) => ({
        name: t.name,
        description: t.description.slice(0, 300),
        says_read_only: t.readOnlyHint,
        can_be_a_read: readable.has(t.name),
      })),
      count: seen.tools.length,
      chosen: source.tools ?? [],
      next: 'action "set_tools" with tools: [{ name, mode: "read" }] makes the chosen tools skills.',
    };
  }

  if (action === 'set_tools') {
    const raw = Array.isArray(args.tools) ? args.tools as unknown[] : null;
    if (!raw) return fail('MISSING_REQUIRED_PARAMETER', 'tools is required: [{ name, mode? }]', 'mode is "read" or "write"; omitted, it follows what the server says about the tool.');
    const wanted = raw
      .map((t) => (typeof t === 'string' ? { name: t } : t as { name?: unknown; mode?: unknown }))
      .filter((t) => typeof t?.name === 'string' && t.name)
      .map((t) => ({ name: String(t.name), ...(t.mode === 'read' || t.mode === 'write' ? { mode: t.mode as McpToolMode } : {}) }));
    if (wanted.length > MCP_MAX_TOOLS_PER_SOURCE) {
      return fail('INVALID_INPUT', `A source hands the agent at most ${MCP_MAX_TOOLS_PER_SOURCE} tools; ${wanted.length} were chosen.`, 'Choose the tools the agent needs — every one is a line in its prompt.');
    }
    // Always against what the server offers NOW, never against a remembered list.
    const seen = await look(supabase, source);
    if ('fault' in seen) return seen.fault;
    const plan = planMcpSkills(source, seen.tools, wanted);

    const existing = await skillsOf(supabase, source.id);
    const keep = new Set(plan.skills.map((s) => String(s.row.name)));
    const gone = existing.filter((s) => !keep.has(s.name));
    if (gone.length) {
      const { error } = await supabase.from('agent_skills').delete().in('id', gone.map((s) => s.id));
      if (error) throw new Error(`could not remove the skills of unchosen tools: ${error.message}`);
    }
    const taken: Array<{ tool: string; reason: string }> = [];
    const made: Array<{ tool: string; mode: McpToolMode; skill: string }> = [];
    for (const planned of plan.skills) {
      const name = String(planned.row.name);
      const mine = existing.find((s) => s.name === name);
      if (mine) {
        const { error } = await supabase.from('agent_skills').update(planned.row).eq('id', mine.id);
        if (error) throw new Error(`could not update the skill ${name}: ${error.message}`);
      } else {
        const { data: clash, error: clashErr } = await supabase.from('agent_skills').select('id').eq('name', name).maybeSingle();
        if (clashErr) throw new Error(`could not check the skill name ${name}: ${clashErr.message}`);
        if (clash) { taken.push({ tool: planned.tool, reason: `the skill name ${name} is already used by another skill` }); continue; }
        const { error } = await supabase.from('agent_skills').insert(planned.row);
        if (error) throw new Error(`could not create the skill ${name}: ${error.message}`);
      }
      made.push({ tool: planned.tool, mode: planned.mode, skill: name });
    }
    const { error: saveErr } = await supabase.from('mcp_sources')
      .update({ tools: made.map((m) => ({ name: m.tool, mode: m.mode })) }).eq('id', source.id);
    if (saveErr) throw new Error(`could not save the chosen tools: ${saveErr.message}`);
    return {
      source: source.slug,
      skills: made,
      removed: gone.map((s) => s.name),
      refused: [...plan.refused, ...taken],
      note: made.length
        ? 'The agent finds these like any other skill. A read tool runs by itself; a write tool waits for a person to approve each call.'
        : 'No tool is chosen: the agent has nothing from this source.',
    };
  }

  return fail('INVALID_INPUT', `Unknown action "${action}".`, 'The actions are list, check and set_tools.');
}
