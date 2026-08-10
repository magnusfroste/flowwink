/**
 * Cowork Chat (internal id: workspace-chat)
 *
 * Authenticated chat for admins/employees. Two modes:
 *   - 'strict' (default): only answers from grounded workspace data, refuses trivia.
 *   - 'cowork'           : grounded in workspace data first, may then use the model's
 *                          own knowledge AND a web_search tool (if configured).
 *
 * Settings live in `site_settings` under key `cowork_chat`:
 *   {
 *     mode: 'strict' | 'cowork',
 *     allowWorldKnowledge: boolean,
 *     allowWebSearch: boolean,
 *     defaultSources: string[]
 *   }
 *
 * NOTE: Endpoint name kept as `workspace-chat` for backward compat with existing
 * frontend hooks. The user-facing brand is "Cowork Chat".
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getServiceClient, resolveCaller } from '../_shared/supabase-clients.ts';
import { resolveAiConfig, isAnthropicProvider } from '../_shared/ai-config.ts';
import { logAiUsage } from '../_shared/ai-usage-logger.ts';
import { knowledgeChunksSource, flowtableSource, type SourceCtx } from '../_shared/retrieval/sources.ts';
import { scoreSkillsByIntent } from '../_shared/skills/intent-scorer.ts';
import { isReadSkill, isReadCall, WRITE_REFUSAL } from '../_shared/skills/read-surface.ts';
import { embedQuery } from '../_shared/retrieval/embedder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SourceKey =
  | 'documents'
  | 'contracts'
  | 'kb'
  | 'pages'
  | 'crm'
  | 'employees'
  | 'wiki'
  | 'handbook'
  | 'flowtable';

const ALL_SOURCES: SourceKey[] = [
  'documents',
  'contracts',
  'kb',
  'pages',
  'crm',
  'employees',
  'wiki',
  'handbook',
  'flowtable',
];

interface Citation {
  ref: number;
  type: string;
  id: string;
  title: string;
  url?: string;
}

interface CoworkSettings {
  mode: 'strict' | 'cowork';
  allowWorldKnowledge: boolean;
  allowWebSearch: boolean;
  defaultSources: SourceKey[];
}

const DEFAULT_SETTINGS: CoworkSettings = {
  mode: 'cowork',
  allowWorldKnowledge: true,
  allowWebSearch: true,
  defaultSources: ALL_SOURCES,
};

const PER_SOURCE_LIMIT = 25;

/* ------------------------------------------------------------------ */
/* Token budget                                                        */
/* ------------------------------------------------------------------ */
// Rough char→token estimate (gpt-style): ~4 chars per token.
const CHAR_PER_TOKEN = 4;
const TOTAL_TOKEN_BUDGET = 15000;
const MIN_PER_SOURCE_TOKENS = 600;

interface ContextMeta {
  tokens_used: number;
  tokens_budget: number;
  sources_active: number;
  sources_truncated: string[];
  per_source: Record<string, number>;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHAR_PER_TOKEN);
}

function truncateBlock(block: string, maxTokens: number): { block: string; truncated: boolean } {
  const tokens = estimateTokens(block);
  if (tokens <= maxTokens) return { block, truncated: false };
  const maxChars = maxTokens * CHAR_PER_TOKEN;
  const lines = block.split('\n');
  const header = lines[0];
  let out = header;
  let used = header.length;
  for (let i = 1; i < lines.length; i++) {
    const next = '\n' + lines[i];
    if (used + next.length > maxChars - 40) break;
    out += next;
    used += next.length;
  }
  out += `\n…[truncated to fit token budget]`;
  return { block: out, truncated: true };
}

function applyTokenBudget(
  rawBlocks: Array<{ source: string; text: string }>,
): { contextText: string; meta: ContextMeta } {
  const sourcesActive = rawBlocks.length;
  if (sourcesActive === 0) {
    return {
      contextText: '',
      meta: { tokens_used: 0, tokens_budget: TOTAL_TOKEN_BUDGET, sources_active: 0, sources_truncated: [], per_source: {} },
    };
  }
  const fairShare = Math.max(MIN_PER_SOURCE_TOKENS, Math.floor(TOTAL_TOKEN_BUDGET / sourcesActive));
  const truncated: string[] = [];
  const trimmed = rawBlocks.map(({ source, text }) => {
    const r = truncateBlock(text, fairShare);
    if (r.truncated) truncated.push(source);
    return { source, text: r.block, tokens: estimateTokens(r.block) };
  });
  let used = trimmed.reduce((s, b) => s + b.tokens, 0);
  const leftover = TOTAL_TOKEN_BUDGET - used;
  if (leftover > 0 && truncated.length > 0) {
    const bonus = Math.floor(leftover / truncated.length);
    for (let i = 0; i < trimmed.length; i++) {
      if (!truncated.includes(trimmed[i].source)) continue;
      const original = rawBlocks.find((b) => b.source === trimmed[i].source)!.text;
      const r = truncateBlock(original, trimmed[i].tokens + bonus);
      trimmed[i].text = r.block;
      trimmed[i].tokens = estimateTokens(r.block);
      if (!r.truncated) {
        const idx = truncated.indexOf(trimmed[i].source);
        if (idx >= 0) truncated.splice(idx, 1);
      }
    }
  }
  const finalText = trimmed.map((b) => b.text).join('\n\n');
  const perSource: Record<string, number> = {};
  trimmed.forEach((b) => { perSource[b.source] = b.tokens; });
  return {
    contextText: finalText,
    meta: {
      tokens_used: estimateTokens(finalText),
      tokens_budget: TOTAL_TOKEN_BUDGET,
      sources_active: sourcesActive,
      sources_truncated: truncated,
      per_source: perSource,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Context builder                                                     */
/* ------------------------------------------------------------------ */
async function buildContext(
  supabase: any,
  sources: SourceKey[],
  query = '',
  // M3 (Retrieval Engine): the caller's own client + optional query vector.
  // Knowledge-shaped sources retrieve chunks WITH THE CALLER'S EYES (RLS on
  // knowledge_chunks); entity/live sources keep the service client as before.
  opts: {
    userClient?: any;
    queryEmbedding?: number[] | null;
    attachments?: Array<{ name: string; text: string }>;
  } = {},
): Promise<{ contextText: string; citations: Citation[]; meta: ContextMeta }> {
  const citations: Citation[] = [];
  const rawBlocks: Array<{ source: string; text: string }> = [];
  let ref = 1;

  // Live entity sources read with the CALLER's client too — same rule as the
  // chunk lane. They used to run on the service client, which showed every
  // employee the full contract bodies and the HR register regardless of role.
  // RLS is the role linkage; a source you may not read is simply empty.
  const live = opts.userClient ?? supabase;

  const push = (
    type: string,
    id: string,
    title: string,
    url?: string,
  ): number => {
    const r = ref++;
    citations.push({ ref: r, type, id, title, url });
    return r;
  };

  // ── Knowledge lane (Retrieval Engine M3): query-relevant chunks across the
  // selected knowledge sources (documents/kb/pages/wiki), via the
  // RetrievalSource contract. The search runs on the CALLER's client — staff
  // see internal chunks through RLS; the old "25 most-recent rows" listings
  // are replaced by relevance-ranked actual content.
  const KNOWLEDGE_TABLES: Partial<Record<SourceKey, string>> = {
    documents: 'documents',
    kb: 'kb_articles',
    pages: 'pages',
    wiki: 'wiki_pages',
    // The customer's OWN handbook module (handbook_chapters) — NOT docs_pages,
    // which is FlowWink's repo documentation synced per instance. Confusing the
    // two exposed vendor architecture notes in a customer chat once (2026-08-11).
    handbook: 'handbook_chapters',
  };
  const chunkTables = sources.map((s) => KNOWLEDGE_TABLES[s]).filter(Boolean) as string[];
  if (chunkTables.length && query) {
    try {
      const ctx: SourceCtx = {
        query,
        userClient: opts.userClient ?? supabase,
        service: supabase,
        queryEmbedding: opts.queryEmbedding,
      };
      const block = await knowledgeChunksSource(chunkTables, { k: 12, tokenBudget: 6000 }).run(ctx);
      if (block) {
        const lines = block.items.map((it) => {
          const r = push(it.type, it.id, it.title, it.url);
          return `[${r}] ${it.title}${it.url ? ` (${it.url})` : ''}\n${it.text}`;
        });
        rawBlocks.push({ source: 'knowledge', text: `${block.header}\n${lines.join('\n\n')}` });
      }
    } catch (e) {
      // Chunk index not migrated yet on this instance → lane absent, chat
      // still works from the remaining sources (Law 4).
      console.error('cowork-chat: knowledge chunk lane failed', e);
    }
  }

  if (sources.includes('contracts')) {
    const { data: contracts, error: contractsErr } = await live
      .from('contracts')
      .select('id, title, status, counterparty_name, contract_type, start_date, end_date, value_cents, currency, body_markdown, notes')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (contractsErr) console.error('cowork-chat: contracts query failed', contractsErr);
    if (contracts?.length) {
      const lines = contracts.map((c: any) => {
        const r = push('contract', c.id, c.title || 'Contract', `/admin/contracts/${c.id}`);
        const parts = [
          c.contract_type && `type=${c.contract_type}`,
          c.status && `status=${c.status}`,
          c.counterparty_name && `party=${c.counterparty_name}`,
          c.start_date && `from=${c.start_date}`,
          c.end_date && `ends=${c.end_date}`,
          c.value_cents && `value=${(c.value_cents / 100).toFixed(0)} ${c.currency || ''}`,
        ].filter(Boolean).join(', ');
        const body = c.body_markdown ? `\n  Body: ${c.body_markdown.slice(0, 400)}${c.body_markdown.length > 400 ? '…' : ''}` : '';
        const notes = c.notes ? `\n  Notes: ${c.notes.slice(0, 200)}` : '';
        return `[${r}] ${c.title || 'Contract'} (${parts})${body}${notes}`;
      });
      rawBlocks.push({ source: 'contracts', text: `### Contracts\n${lines.join('\n')}` });
    }

    const { data: empContracts, error: empErr } = await supabase
      .from('employment_contracts')
      .select('id, title, employment_type, status, start_date, end_date, monthly_salary_cents, currency, employees(name)')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (empErr) console.error('cowork-chat: employment_contracts query failed', empErr);
    if (empContracts?.length) {
      const lines = empContracts.map((c: any) => {
        const empName = c.employees?.name || 'Employee';
        const label = `${empName} — ${c.title || c.employment_type || 'Contract'}`;
        const r = push('employment_contract', c.id, label, `/admin/hr/contracts/${c.id}`);
        const salary = c.monthly_salary_cents ? `${(c.monthly_salary_cents / 100).toFixed(0)} ${c.currency || ''}/mo` : '';
        return `[${r}] ${label} status=${c.status || 'n/a'} ${c.start_date ? `from ${c.start_date}` : ''} ${c.end_date ? `to ${c.end_date}` : ''} ${salary}`;
      });
      rawBlocks.push({ source: 'employment_contracts', text: `### Employment Contracts\n${lines.join('\n')}` });
    }
  }

  // (kb + pages now ground through the knowledge chunk lane above.)

  if (sources.includes('crm')) {
    const { data: leads, error: leadsErr } = await live
      .from('leads')
      .select('id, name, email, status, score, companies ( name )')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(PER_SOURCE_LIMIT);
    if (leadsErr) console.error('cowork-chat: leads query failed', leadsErr);
    if (leads?.length) {
      const lines = leads.map((l: any) => {
        const r = push('lead', l.id, l.name || l.email || 'Lead', `/admin/leads/${l.id}`);
        const company = l.companies?.name;
        return `[${r}] ${l.name || l.email || 'Lead'} ${company ? `@ ${company}` : ''} status=${l.status || 'n/a'} score=${l.score ?? '–'}`;
      });
      rawBlocks.push({ source: 'leads', text: `### Leads (top ${leads.length} by score)\n${lines.join('\n')}` });
    }

    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, stage, value_cents, currency, expected_close, notes, leads(name, email, companies(name))')
      .order('updated_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (dealsErr) console.error('cowork-chat: deals query failed', dealsErr);
    if (deals?.length) {
      const lines = deals.map((d: any) => {
        const leadName = d.leads?.name || d.leads?.email || 'Unknown lead';
        const company = d.leads?.companies?.name;
        const label = `${leadName}${company ? ` @ ${company}` : ''}`;
        const r = push('deal', d.id, label, `/admin/deals/${d.id}`);
        const value = d.value_cents ? (d.value_cents / 100).toFixed(0) : '–';
        return `[${r}] ${label} stage=${d.stage || 'n/a'} value=${value} ${d.currency || ''} ${d.expected_close ? `close=${d.expected_close}` : ''}${d.notes ? ` — ${d.notes.slice(0, 120)}` : ''}`;
      });
      rawBlocks.push({ source: 'deals', text: `### Deals\n${lines.join('\n')}` });
    }
  }

  if (sources.includes('employees')) {
    const { data } = await live
      .from('employees')
      .select('id, full_name, email, role, department, status')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (data?.length) {
      const lines = data.map((e: any) => {
        const r = push('employee', e.id, e.full_name || e.email || 'Employee', `/admin/hr/employees/${e.id}`);
        return `[${r}] ${e.full_name || e.email} ${e.role ? `(${e.role})` : ''} ${e.department ? `— ${e.department}` : ''} status=${e.status || 'active'}`;
      });
      rawBlocks.push({ source: 'employees', text: `### Employees\n${lines.join('\n')}` });
    }
  }

  // (wiki + documents now ground through the knowledge chunk lane above.)

  if (sources.includes('flowtable')) {
    // Live lane via the RetrievalSource contract — implementation moved to
    // _shared/retrieval/sources.ts (question-driven search over
    // workspace-shared bases; structured rows are never chunk-indexed).
    const block = await flowtableSource.run({
      query,
      userClient: opts.userClient ?? supabase,
      service: supabase,
      queryEmbedding: opts.queryEmbedding,
    });
    if (block) {
      const lines = block.items.map((it) => {
        const r = push(it.type, it.id, it.title, it.url);
        return `[${r}] ${it.text}`;
      });
      rawBlocks.push({ source: 'flowtable', text: `${block.header}\n${lines.join('\n')}` });
    }
  }

  // ── Attached files: conversation-scoped context the user handed us. They
  // are citations like everything else, and they share the token budget.
  for (const att of opts.attachments ?? []) {
    const r = push('attachment', att.name, att.name);
    rawBlocks.push({ source: 'attachment', text: `### Attached file: ${att.name} [${r}]\n${att.text}` });
  }

  const { contextText, meta } = applyTokenBudget(rawBlocks);
  return { contextText, citations, meta };
}

/* ------------------------------------------------------------------ */
/* Web search tool (uses existing firecrawl-search edge function)     */
/* ------------------------------------------------------------------ */
const WEB_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description:
      'Search the public web for current/live information not present in the workspace context. Use ONLY when the answer is not in the provided workspace context and the user is asking for external/world information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Concise search query' },
        limit: { type: 'number', description: 'Max results (1-5, default 4)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

async function runWebSearch(supabaseUrl: string, serviceKey: string, query: string, limit = 4) {
  const resp = await fetch(`${supabaseUrl}/functions/v1/web-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query, limit, scrapeContent: false }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.success) {
    return { ok: false, error: json?.error || `web_search failed (${resp.status})` };
  }
  // Normalize result shape
  const results = (json.data || []).slice(0, limit).map((r: any) => ({
    title: r.title || r.metadata?.title || '',
    url: r.url || r.metadata?.sourceURL || '',
    snippet: r.description || r.snippet || (r.markdown ? String(r.markdown).slice(0, 300) : ''),
  }));
  return { ok: true, results };
}

/* ------------------------------------------------------------------ */
/* The dispatch surface — the same three tools an external operator    */
/* gets from the MCP gateway (?mode=dispatch), mounted INSIDE the      */
/* employee chat. search_skills ranks the catalog with the Skill       */
/* Relevance Engine; execute_skill runs through agent-execute so every */
/* call inherits its hardening (param hints, staged ops, activity      */
/* trail). The surface is read-only, gated fail-closed in              */
/* _shared/skills/read-surface.ts — writes become proposals, never     */
/* side effects.                                                       */
/* ------------------------------------------------------------------ */
const DISPATCH_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_skills',
      description:
        'Find live workspace data tools. Ranks the platform skill catalog by what you need (e.g. "tickets for a company", "unpaid invoices", "customer overview"). Use FIRST whenever the question concerns specific records — a named customer, order, invoice, ticket, deal — that static context cannot answer.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What data you need, in plain words' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_skill',
      description:
        'Read a skill\'s full parameter contract and instructions before executing it. Use when search_skills marked it has_instructions, or when a previous execute_skill call failed on arguments.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_skill',
      description:
        'Execute a read-only skill from search_skills and get its live result. Pass arguments matching the skill\'s parameter contract. Results are workspace facts — cite them.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          arguments: { type: 'object', description: 'Skill parameters (see search_skills / read_skill)' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
];

async function runSearchSkills(service: any, query: string) {
  const { data: skills } = await service
    .from('agent_skills')
    .select('name, description, category, instructions')
    .limit(1000);
  const readable = (skills || []).filter(
    (sk: any) => isReadSkill(sk.name) || isReadCall(sk.name, { action: 'list' }),
  );
  const ranked = scoreSkillsByIntent(readable, String(query || ''), { maxSkills: 8, alwaysInclude: ['get_customer_360'] });
  return {
    skills: ranked.map((sk: any) => ({
      name: sk.name,
      description: String(sk.description || '').slice(0, 240),
      has_instructions: !!sk.instructions,
      ...(String(sk.name).startsWith('manage_')
        ? { read_only_with: 'arguments.action must be one of list|get|search|view|check|status' }
        : {}),
    })),
    note: 'Read-only surface. manage_* skills are readable ONLY with a read action argument; anything that would CHANGE data must be proposed to the user instead.',
  };
}

async function runReadSkillTool(service: any, name: string) {
  if (!isReadCall(name, { action: 'list' })) return { error: WRITE_REFUSAL };
  const { data } = await service
    .from('agent_skills')
    .select('name, description, instructions, tool_definition')
    .eq('name', name)
    .maybeSingle();
  if (!data) return { error: `Unknown skill: ${name}. Use search_skills first.` };
  return {
    name: data.name,
    description: data.description,
    parameters: data.tool_definition?.function?.parameters ?? null,
    instructions: data.instructions || '(no extended instructions — the description is the contract)',
  };
}

async function resolveSkillName(service: any, name: string): Promise<string> {
  // Models pluralize (manage_tickets) and the catalog is singular
  // (manage_ticket). Tolerate the two obvious inflections; anything fancier
  // goes through search_skills.
  const candidates = [...new Set([
    name,
    name.replace(/ies$/, 'y'),
    name.replace(/s$/, ''),
  ])].filter(Boolean);
  const { data } = await service.from('agent_skills').select('name').in('name', candidates);
  const found = new Set((data || []).map((r: any) => r.name));
  return candidates.find((c) => found.has(c)) ?? name;
}

async function runExecuteSkill(
  service: any,
  supabaseUrl: string,
  serviceKey: string,
  rawName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<{ ok: boolean; body: unknown; name: string }> {
  const name = await resolveSkillName(service, rawName);
  if (!isReadCall(name, args)) return { ok: false, body: { error: WRITE_REFUSAL }, name };
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_name: name,
        arguments: args ?? {},
        agent_type: 'flowwork',
        caller_user_id: userId,
      }),
    });
    let body = await resp.json().catch(() => ({ error: `agent-execute returned ${resp.status}` }));
    if (!resp.ok && JSON.stringify(body).includes('Skill not found')) {
      body = { ...body, hint: 'That skill name does not exist. Call search_skills to discover the correct name — many modules expose manage_<entity> with arguments {"action":"list"}.' };
    }
    return { ok: resp.ok, body, name };
  } catch (e) {
    return { ok: false, body: { error: e instanceof Error ? e.message : 'agent-execute unreachable' }, name };
  }
}

/* ------------------------------------------------------------------ */
/* Settings loader                                                     */
/* ------------------------------------------------------------------ */
async function loadSettings(supabaseAdmin: any): Promise<CoworkSettings> {
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', 'cowork_chat')
    .maybeSingle();
  const v = (data?.value || {}) as Partial<CoworkSettings>;
  return {
    mode: v.mode === 'strict' ? 'strict' : 'cowork',
    allowWorldKnowledge: v.allowWorldKnowledge !== false,
    allowWebSearch: v.allowWebSearch !== false,
    defaultSources: Array.isArray(v.defaultSources) && v.defaultSources.length > 0
      ? (v.defaultSources.filter((s) => ALL_SOURCES.includes(s as SourceKey)) as SourceKey[])
      : ALL_SOURCES,
  };
}

/* ------------------------------------------------------------------ */
/* Main handler                                                        */
/* ------------------------------------------------------------------ */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const auth = await resolveCaller(authHeader);
    if (auth.error) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = auth.user;
    const supabaseUser = auth.client;

    const body = await req.json().catch(() => ({}));
    const messages: Array<{ role: string; content: string }> = body.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages[] required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = getServiceClient();

    // Role gate
    const { data: roleRows } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!(roles.includes('admin') || roles.includes('employee') || roles.includes('manager'))) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin or employee role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const settings = await loadSettings(supabaseAdmin);

    // Per-request overrides (UI can pass mode/sources)
    const requestedSources: SourceKey[] = Array.isArray(body.sources) && body.sources.length > 0
      ? body.sources.filter((s: string) => ALL_SOURCES.includes(s as SourceKey))
      : settings.defaultSources;
    const mode: 'strict' | 'cowork' =
      body.mode === 'strict' || body.mode === 'cowork' ? body.mode : settings.mode;
    const allowWorld = mode === 'strict' ? false : settings.allowWorldKnowledge;
    const webSearchOn = mode === 'strict' ? false : settings.allowWebSearch && !!Deno.env.get('FIRECRAWL_API_KEY');

    const attachments: Array<{ name: string; text: string }> = Array.isArray(body.attachments)
      ? body.attachments
          .filter((a: any) => a && typeof a.name === 'string' && typeof a.text === 'string' && a.text.trim())
          .slice(0, 3)
          .map((a: any) => ({ name: String(a.name).slice(0, 120), text: String(a.text).slice(0, 120_000) }))
      : [];

    const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    // Hybrid query vector (provider CONFIG via service; null → text-only).
    const queryEmbedding = await embedQuery(supabaseAdmin, String(latestUserMessage));
    const { contextText, citations, meta: contextMeta } = await buildContext(
      supabaseAdmin,
      requestedSources,
      String(latestUserMessage),
      // Chunk retrieval runs with the CALLER's eyes (auth.client), not admin.
      { userClient: supabaseUser, queryEmbedding, attachments },
    );
    console.log(`[cowork-chat] context: ${contextMeta.tokens_used}/${contextMeta.tokens_budget} tokens, ${contextMeta.sources_active} sources, truncated=[${contextMeta.sources_truncated.join(',')}]`);

    const { apiKey, apiUrl, model, provider } = await resolveAiConfig(supabaseAdmin, 'fast');
    if (isAnthropicProvider(apiUrl)) {
      return new Response(JSON.stringify({
        error: 'Anthropic provider not yet supported by Cowork Chat. Switch to OpenAI, Gemini or Local LLM in Integrations.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* -------- System prompt (mode-aware) ---------- */
    const strictRules = [
      'HARD RULES (do not break):',
      '1. Answer ONLY using facts in the CONTEXT block. Do NOT use outside / world knowledge.',
      '2. If not in context, reply with EXACTLY: "I can\'t find that in your workspace data. Try selecting more sources, or rephrase your question."',
      '3. NEVER answer general-knowledge or trivia questions.',
      '4. READ-ONLY. Point to admin pages for changes.',
      '6. You MAY use search_skills/read_skill/execute_skill — their results ARE workspace data and count as context. Cite them with [N]. Never web_search, never world knowledge.',
      '5. Cite every claim with [N] markers from the context.',
    ].join('\n');

    const coworkRules = [
      'OPERATING RULES:',
      '1. Prefer facts from the CONTEXT block — it is the user\'s own workspace data. Cite them with [N].',
      `2. You ${allowWorld ? 'MAY' : 'MUST NOT'} use your own training knowledge when context is insufficient. Be explicit when you do (e.g. "Outside your workspace: …").`,
      `3. You ${webSearchOn ? 'MAY' : 'MUST NOT'} call the web_search tool for current/live external info — but only when the answer is not in the workspace context.`,
      '4. Workspace items must be cited with [N] markers. Web results should be cited as plain markdown links.',
      '5. Tools are READ-ONLY: look up live module data freely, but never change anything. For mutations, describe the action and point to the relevant admin page.',
      '7. When the question concerns a SPECIFIC customer, company, order, invoice, ticket or deal and the CONTEXT block does not already answer it, you MUST call search_skills and then execute_skill BEFORE answering (e.g. get_customer_360 for a full customer picture, list_tickets, list_invoices). NEVER ask the user for permission to look something up, and never answer "I could not find it" without having executed at least one skill. Always call search_skills FIRST to get exact names — many modules expose manage_<entity>, readable with arguments {"action":"list", ...filters}. Max 4 tool rounds; be economical.',
      '8. HONESTY: claim "no tickets / no unpaid invoices / no X" ONLY when a skill you executed returned an empty result for exactly that entity and that company. If your executed skills did not cover something, say plainly that you could not check it. Never present a lookup of the wrong module as an answer.',
      '9. AMOUNTS: money fields in skill results are minor units — a field ending in _cents holds hundredths (total_cents: 2312500 means 23 125,00 kr). Always divide by 100 before presenting, and never invent a currency.',
      '6. Be concise, use markdown, and match the user\'s language.',
    ].join('\n');

    // Pre-rank the live tools for THIS question (Skill Relevance Engine) and
    // put them straight into the prompt — the model executes directly instead
    // of discovering the catalog one round-trip at a time.
    let rankedToolsBlock = '';
    try {
      const pre = await runSearchSkills(supabaseAdmin, String(latestUserMessage));
      if (pre.skills.length) {
        rankedToolsBlock = [
          '',
          '--- LIVE TOOLS RANKED FOR THIS QUESTION (execute_skill) ---',
          ...pre.skills.map((sk: any) =>
            `- ${sk.name}${sk.read_only_with ? ' (read via arguments {"action":"list"|"get"|"search"})' : ''}: ${sk.description}`),
          'Use exact names. For other needs, call search_skills.',
          '--- END LIVE TOOLS ---',
        ].join('\n');
      }
    } catch (e) {
      console.error('pre-rank failed (non-fatal):', e);
    }

    const systemPrompt = [
      mode === 'strict'
        ? 'You are FlowWink Workspace Chat — strictly grounded in the user\'s workspace data.'
        : 'You are FlowWink Cowork Chat — a co-working assistant for an admin/employee. You combine the user\'s workspace data with your own knowledge (and optionally the web) to give the most useful answer.',
      '',
      mode === 'strict' ? strictRules : coworkRules,
      '',
      '--- WORKSPACE CONTEXT ---',
      contextText || '(No data available for the selected sources.)',
      '--- END CONTEXT ---',
      rankedToolsBlock,
    ].join('\n');

    /* -------- Tool loop (only when web_search is on) -------- */
    const conversation: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Dispatch tools are ALWAYS mounted — they fetch workspace data, which both
    // modes want. Web search remains cowork-only and settings-gated.
    const tools = [...(webSearchOn ? [WEB_SEARCH_TOOL] : []), ...DISPATCH_TOOLS];
    const consulted: Array<{ skill: string; ok: boolean; ms: number }> = [];

    // First, run a (non-streaming) pass if tools are enabled, so we can resolve tool calls.
    // If no tools needed → switch to streaming on the second pass.
    if (tools) {
      // Up to 2 tool-call rounds to keep latency bounded.
      for (let round = 0; round < 4; round++) {
        const t0 = Date.now();
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: conversation, tools, tool_choice: 'auto' }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          console.error('AI provider error (tool pass):', resp.status, errText);
          void logAiUsage({
            supabase: supabaseAdmin, source: 'workspace-chat', provider, model,
            promptTokens: 0, completionTokens: 0, totalTokens: 0,
            latencyMs: Date.now() - t0,
            status: resp.status === 429 ? 'rate_limited' : 'error',
            error: errText.slice(0, 500), userId: user.id,
            metadata: { mode, http_status: resp.status, phase: 'tool-pass' },
          });
          return new Response(JSON.stringify({
            error: `AI provider returned ${resp.status}`, detail: errText.slice(0, 500),
          }), { status: resp.status === 429 ? 429 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const json = await resp.json();
        const usage = json?.usage || {};
        void logAiUsage({
          supabase: supabaseAdmin, source: 'workspace-chat', provider, model,
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
          latencyMs: Date.now() - t0, status: 'success', userId: user.id,
          metadata: { mode, phase: 'tool-pass', round },
        });
        const choice = json.choices?.[0];
        const toolCalls = choice?.message?.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls — we have the final assistant message. Stream it back as a single chunk.
          const finalText: string = choice?.message?.content || '';
          return streamFinal(citations, finalText, contextMeta, consulted);
        }
        // Execute tool calls
        conversation.push(choice.message);
        for (const tc of toolCalls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* */ }
          if (tc.function?.name === 'web_search') {
            const out = await runWebSearch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, args.query || '', args.limit ?? 4);
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(out),
            });
          } else if (tc.function?.name === 'search_skills') {
            const out = await runSearchSkills(supabaseAdmin, args.query || String(latestUserMessage));
            conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
          } else if (tc.function?.name === 'read_skill') {
            const out = await runReadSkillTool(supabaseAdmin, String(args.name || ''));
            conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
          } else if (tc.function?.name === 'execute_skill') {
            const t0 = Date.now();
            const out = await runExecuteSkill(
              supabaseAdmin, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
              String(args.name || ''), args.arguments ?? {}, user.id,
            );
            const skillName = out.name;
            consulted.push({ skill: skillName, ok: out.ok, ms: Date.now() - t0 });
            let refNote = '';
            if (out.ok) {
              const r = citations.length + 1;
              citations.push({ ref: r, type: 'skill', id: skillName, title: skillName });
              refNote = `Cite this result as [${r}]. `;
            }
            const raw = JSON.stringify(out.body);
            const clipped = raw.length > 3800 ? raw.slice(0, 3800) + '…[truncated]' : raw;
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: `${refNote}${clipped}`,
            });
          } else {
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ error: `Unknown tool: ${tc.function?.name}` }),
            });
          }
        }
      }
      // Force a final answer with no tools
      const tForce = Date.now();
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: conversation }),
      });
      const json = await resp.json();
      const fUsage = json?.usage || {};
      void logAiUsage({
        supabase: supabaseAdmin, source: 'workspace-chat', provider, model,
        promptTokens: fUsage.prompt_tokens || 0,
        completionTokens: fUsage.completion_tokens || 0,
        totalTokens: fUsage.total_tokens || (fUsage.prompt_tokens || 0) + (fUsage.completion_tokens || 0),
        latencyMs: Date.now() - tForce,
        status: resp.ok ? 'success' : 'error',
        userId: user.id, metadata: { mode, phase: 'force-final' },
      });
      const finalText: string = json.choices?.[0]?.message?.content || '';
      return streamFinal(citations, finalText, contextMeta, consulted);
    }

    /* -------- No tools: stream straight through -------- */
    const tStream = Date.now();
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true, messages: conversation, stream_options: { include_usage: true } }),
    });
    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      console.error('AI provider error:', upstream.status, errText);
      void logAiUsage({
        supabase: supabaseAdmin, source: 'workspace-chat', provider, model,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        latencyMs: Date.now() - tStream,
        status: upstream.status === 429 ? 'rate_limited' : 'error',
        error: errText.slice(0, 500), userId: user.id,
        metadata: { mode, http_status: upstream.status, phase: 'stream' },
      });
      return new Response(JSON.stringify({
        error: `AI provider returned ${upstream.status}`, detail: errText.slice(0, 500),
      }), { status: upstream.status === 429 ? 429 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`));
        controller.enqueue(encoder.encode(`event: context_meta\ndata: ${JSON.stringify(contextMeta)}\n\n`));
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let pTok = 0, cTok = 0, tTok = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            // Sniff usage from chunks (OpenAI/Gemini emit usage in last data: line when stream_options.include_usage)
            buf += decoder.decode(value, { stream: true });
            // Keep buf bounded
            if (buf.length > 8000) buf = buf.slice(-4000);
          }
          // Parse any "usage" object found in buf
          const matches = buf.match(/"usage"\s*:\s*\{[^}]*\}/g);
          if (matches && matches.length) {
            try {
              const lastUsage = JSON.parse(`{${matches[matches.length - 1]}}`).usage;
              pTok = lastUsage.prompt_tokens || 0;
              cTok = lastUsage.completion_tokens || 0;
              tTok = lastUsage.total_tokens || pTok + cTok;
            } catch { /* ignore */ }
          }
        } catch (e) {
          console.error('stream error:', e);
        } finally {
          controller.close();
          void logAiUsage({
            supabase: supabaseAdmin, source: 'workspace-chat', provider, model,
            promptTokens: pTok, completionTokens: cTok, totalTokens: tTok,
            latencyMs: Date.now() - tStream, status: 'success',
            userId: user.id, metadata: { mode, phase: 'stream' },
          });
        }
      },
    });
    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (e) {
    console.error('cowork-chat error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/* ------------------------------------------------------------------ */
/* Helper: emit a single-shot answer in the same SSE shape as streaming */
/* ------------------------------------------------------------------ */
function streamFinal(
  citations: Citation[],
  text: string,
  contextMeta?: ContextMeta,
  consulted?: Array<{ skill: string; ok: boolean; ms: number }>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`));
      if (contextMeta) {
        controller.enqueue(encoder.encode(`event: context_meta\ndata: ${JSON.stringify(contextMeta)}\n\n`));
      }
      if (consulted && consulted.length) {
        controller.enqueue(encoder.encode(`event: consulted\ndata: ${JSON.stringify(consulted)}\n\n`));
      }
      // Emit as a single OpenAI-style delta so the existing client parser handles it.
      const payload = { choices: [{ delta: { content: text } }] };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
