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
import { isOpenAiReasoningModel } from '../_shared/ai-providers.ts';
import { logAiUsage } from '../_shared/ai-usage-logger.ts';
import { knowledgeChunksSource, flowtableSource, type SourceCtx } from '../_shared/retrieval/sources.ts';
import { scoreSkillsByIntent } from '../_shared/skills/intent-scorer.ts';
import { isDiscoverableSkill, classifyCall, WRITE_REFUSAL, STAGE_NOTICE } from '../_shared/skills/read-surface.ts';
import { ownerModuleOf } from '../_shared/skills/skill-modules.ts';
import { loadBusinessIdentityBlock } from '../_shared/domains/business-identity-block.ts';
import { embedQuery } from '../_shared/retrieval/embedder.ts';
import { preflightBlockArgs } from '../_shared/normalize-blocks.ts';
import { buildUnknownParameterBounce } from '../_shared/skills/parameter-contract.ts';
import {
  resolveContextWindow,
  planHistoryWindow,
  enforceHardCap,
  estimateMessagesTokens,
  estimateTokens as estimatePromptTokens,
  CHAR_PER_TOKEN as WINDOW_CHAR_PER_TOKEN,
  RESPONSE_RESERVE_TOKENS,
  type ChatMsg,
} from '../_shared/context-window.ts';

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
  // ── History-window half (Model Context Window Guard) ──
  /** Estimated total prompt: system + soul + retrieval + history (~chars/4). */
  prompt_tokens_est?: number;
  /** The resolved model's context window (conservative when unknown). */
  window_tokens?: number;
  /** False when the window is the conservative default guess — UI shows "~". */
  window_known?: boolean;
  /** True when older turns were compressed into a session distillate. */
  history_distilled?: boolean;
  /** Raw messages dropped (oldest first) by the hard cap. */
  history_dropped?: number;
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
        'Execute a skill from search_skills. READS return their live result immediately — cite it. WRITES (create/update/send/book) are automatically STAGED for the user\'s approval and never run directly, so calling this for a write is always safe: it produces an approval card, not a side effect.',
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

/**
 * What the CALLER may be offered, expressed as module grants.
 *
 * `null` means "everything" (admin). Otherwise it is the set of module ids the
 * caller's roles hold in role_module_access — the same matrix can_access_module
 * reads, batched into one pair of queries instead of 500 RPCs.
 */
async function loadCallerModules(service: any, userId: string): Promise<Set<string> | null> {
  const { data: isAdmin } = await service.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (isAdmin === true) return null;
  const { data: roles } = await service.from('user_roles').select('role').eq('user_id', userId);
  const roleNames = (roles || []).map((r: { role?: string }) => r.role).filter(Boolean);
  if (!roleNames.length) return new Set<string>();
  const { data: grants } = await service
    .from('role_module_access').select('module_id').in('role', roleNames);
  return new Set<string>((grants || []).map((g: { module_id?: string }) => g.module_id).filter(Boolean) as string[]);
}

/**
 * Is this skill worth showing to THIS caller? Two independent questions:
 *
 *  1. Is it proposable at all — read or stage tier? (deny stays hidden.)
 *  2. Would the executor let this caller run it — is the skill's owning module
 *     granted to their role? A skill they cannot execute must not be offered:
 *     the loop stages it, an approval card appears, a human clicks it, and the
 *     click 403s. Three of those were burned in one QA session; the model looked
 *     competent right up to the moment the human paid for it.
 *
 * Mirrors agent-execute's own gate exactly, including its fail-closed edges:
 * platform-owned and unmapped skills are admin-only.
 */
function isOfferable(name: string, callerModules: Set<string> | null): boolean {
  if (!isDiscoverableSkill(name)) return false;
  if (callerModules === null) return true; // admin
  const owner = ownerModuleOf(name);
  if (!owner || owner === 'platform') return false;
  return callerModules.has(owner);
}

async function runSearchSkills(service: any, query: string, callerModules: Set<string> | null) {
  const { data: skills } = await service
    .from('agent_skills')
    .select('name, description, category, instructions, tool_definition')
    .limit(1000);
  // The surface is what the caller can READ or STAGE — not what executes
  // immediately. See isDiscoverableSkill for why that distinction cost 328
  // skills of reach.
  const readable = (skills || []).filter((sk: any) => isOfferable(sk.name, callerModules));
  // Compound anchoring: Swedish (and German, and …) glues entity words
  // together — "supportticket" hides "ticket" from word-level scoring, and the
  // scorer demonstrably ranked manage_ticket outside top-8 for exactly that
  // message. If a catalog name TOKEN appears inside a query word, that skill
  // is always in the list. Pure string containment against the catalog — no
  // intent routing (Law 1).
  const queryWords = String(query || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length >= 5);
  // The anchor is a ranking aid, not an exemption — it goes through the same
  // offer gate as everything else.
  const anchors = new Set<string>(
    isOfferable('get_customer_360', callerModules) ? ['get_customer_360'] : [],
  );
  for (const sk of readable) {
    const tokens = String(sk.name).split('_').filter((t: string) => t.length >= 4);
    if (tokens.some((t: string) => queryWords.some((w) => w.includes(t)))) {
      anchors.add(sk.name);
      if (anchors.size >= 6) break;
    }
  }
  // The scorer expects OpenAI tool shape (skill.function.name) — feeding it
  // raw catalog rows scored EMPTY STRINGS for every skill and turned the whole
  // ranking into noise (observed live: get_agent_trace topping a ticket
  // question). Wrap rows before scoring.
  const scorable = readable.map((sk: any) => ({
    ...sk,
    function: { name: sk.name, description: sk.description },
  }));
  const ranked = scoreSkillsByIntent(scorable, String(query || ''), { maxSkills: 8, alwaysInclude: [...anchors] });
  return {
    skills: ranked.map((sk: any) => {
      // Parameter NAMES up front: a bounced call costs a whole tool round, and
      // weak models burn their patience on rounds. Contract-first beats
      // guess-and-bounce.
      const props = sk.tool_definition?.function?.parameters?.properties;
      const params = props && typeof props === 'object' ? Object.keys(props).slice(0, 20).join(', ') : undefined;
      const required = sk.tool_definition?.function?.parameters?.required;
      return {
        name: sk.name,
        description: String(sk.description || '').slice(0, 240),
        has_instructions: !!sk.instructions,
        ...(params ? { params } : {}),
        // Required names, up front, for the same reason params are: the
        // preflight now bounces a missing required field, and a bounce the
        // model could have avoided is a wasted round.
        ...(Array.isArray(required) && required.length ? { required: required.join(', ') } : {}),
        ...(String(sk.name).startsWith('manage_')
          ? { actions: 'read with {"action":"list"|"get"|"search"}; a write action (create/update/…) STAGES the change for user approval' }
          : { tier: classifyCall(sk.name, {}) === 'stage' ? 'write — STAGES for user approval' : 'read — executes immediately' }),
      };
    }),
    note: 'This list is scoped to what YOU may do here: reads execute immediately, writes are staged for the user\'s approval and never executed directly. A write skill appearing in this list is a write you are meant to propose — call execute_skill with the write arguments; the approval card is the confirmation.',
  };
}

async function runReadSkillTool(service: any, name: string, callerModules: Set<string> | null) {
  if (!isOfferable(name, callerModules)) return { error: WRITE_REFUSAL };
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

interface StagedAction {
  operation_id: string;
  skill: string;
  args: Record<string, unknown>;
  reinvoke_args: Record<string, unknown>;
  preview?: unknown;
  /** Server-side name→uuid substitutions, shown on the card. */
  resolved?: string[];
}

async function runExecuteSkill(
  service: any,
  supabaseUrl: string,
  serviceKey: string,
  rawName: string,
  rawArgs: Record<string, unknown>,
  userId: string,
  callerModules: Set<string> | null,
): Promise<{ ok: boolean; body: unknown; name: string; staged?: StagedAction }> {
  const name = await resolveSkillName(service, rawName);

  // The model must NEVER hold the approval pen. These flags are how a human
  // click executes a staged operation — strip them from model-supplied args so
  // a prompt injection cannot self-approve.
  const args: Record<string, unknown> = { ...(rawArgs ?? {}) };
  delete (args as any)._approved;
  delete (args as any)._approved_operation_id;
  delete (args as any).force_staged;

  // Refusals and pre-flight bounces MUST leave a trail. Svante's bento attempt
  // (2026-08-19) bounced here invisibly — no agent_activity row, no staged op —
  // and the model's paraphrase ("schema accepted not the structure") was the
  // only record. Self-report is not evidence; log what was actually sent.
  //
  // AWAITED, not fire-and-forget. `void insert()` produced exactly zero rows in
  // this table, ever: an edge isolate is torn down when the handler's response
  // resolves, and an un-awaited insert is still in flight at that moment. The
  // trail we built to replace self-reporting was itself a self-report. Anything
  // that must survive the response has to be awaited before it.
  const logGateOutcome = async (kind: string, errorMessage: string) => {
    const { error } = await service.from('agent_activity').insert({
      agent: 'flowwork', skill_name: name, input: args,
      status: 'failed', error_message: `[${kind}] ${errorMessage}`.slice(0, 500),
    });
    if (error) console.error('[cowork-chat] gate-outcome log failed:', error.message);
  };

  const tier = classifyCall(name, args);
  if (tier === 'deny') {
    await logGateOutcome('write-refusal', WRITE_REFUSAL);
    return { ok: false, body: { error: WRITE_REFUSAL }, name };
  }

  // The module gate, applied HERE and not only at discovery. workspace-chat
  // calls agent-execute with the service key, which agent-execute trusts as an
  // internal caller and therefore does NOT run its can_access_module check
  // against — so the executor cannot catch this for us. Without this branch a
  // skill named directly by the model (rather than found through search) still
  // stages, and the 403 lands on the human who clicks approve.
  if (!isOfferable(name, callerModules)) {
    const owner = ownerModuleOf(name);
    const why = owner && owner !== 'platform'
      ? `your role has not been granted the "${owner}" module (Users → Role Permissions)`
      : 'this skill is platform-level and requires the admin role';
    await logGateOutcome('module-refusal', `${name}: ${why}`);
    return {
      ok: false,
      name,
      body: {
        error: `Not staged: you may not run "${name}" — ${why}.`,
        hint: 'Do not retry this skill or look for a synonym of it. Tell the user plainly that this action is outside their permissions here, and who can grant it.',
      },
    };
  }

  // A write must match the skill's parameter contract BEFORE a human is asked
  // to approve it. A model that grabs the wrong skill and invents parameters
  // (manage_automations with entity_type:'ticket', observed live) would
  // otherwise stage garbage that LOOKS approvable. Unknown keys → bounce with
  // the real contract so the model self-corrects — the PGRST202 philosophy,
  // applied pre-flight.
  if (tier === 'stage') {
    const { data: skillRow } = await service
      .from('agent_skills')
      .select('tool_definition, instructions')
      .eq('name', name)
      .maybeSingle();
    const props = skillRow?.tool_definition?.function?.parameters?.properties;
    if (props && typeof props === 'object') {
      const valid = new Set(Object.keys(props));
      const unknown = Object.keys(args).filter((k) => !valid.has(k));
      if (unknown.length) {
        // The bounce has to carry its own fix. Naming only the error made the
        // UNGUARDED path more attractive than the guarded one: manage_page
        // bounced on `is_published` at 19:40:44 and the model was building a
        // worse page with landing_page_compose by 19:41:21 — it never tried to
        // correct the parameter. buildUnknownParameterBounce names the nearest
        // valid parameter (or the enum value that expresses the same intent),
        // lists what IS valid, and points at read_skill when the skill has
        // instructions. Same file for every caller — one contract, one voice.
        const bounce = buildUnknownParameterBounce({
          skillName: name,
          unknown,
          args,
          properties: props as Record<string, unknown>,
          hasInstructions: typeof skillRow?.instructions === 'string'
            && skillRow.instructions.trim() !== '',
        });
        await logGateOutcome('preflight-bounce', bounce.summary);
        return { ok: false, name, body: bounce.body };
      }

      // The other half of the contract. Checking only for UNKNOWN keys reads
      // the schema with one eye: manage_return_item was staged with no
      // `action`, the handler defaulted to `list`, the call returned "success",
      // and the chat reported that the restocking fee had been set. Nothing had
      // been set. A silent false success is worse than a bounce, so a missing
      // required field is a bounce.
      const declaredRequired: string[] = Array.isArray(
        skillRow?.tool_definition?.function?.parameters?.required,
      ) ? skillRow.tool_definition.function.parameters.required.map(String) : [];
      // Several schemas also declare per-action requirements
      // (`x-action-required`: {create: ['return_id'], …}) — the action the
      // model actually chose decides which of those apply.
      const perAction = skillRow?.tool_definition?.function?.parameters?.['x-action-required'];
      const chosenAction = String(args.action ?? '').trim();
      const actionRequired: string[] = perAction && chosenAction && Array.isArray(perAction[chosenAction])
        ? perAction[chosenAction].map(String) : [];
      const isBlank = (v: unknown) =>
        v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
      const missing = [...new Set([...declaredRequired, ...actionRequired])]
        .filter((k) => isBlank(args[k]));
      if (missing.length) {
        await logGateOutcome('preflight-bounce', `missing required parameter(s) ${missing.join(', ')}`);
        return {
          ok: false,
          name,
          body: {
            error: `Not staged: missing required parameter(s) ${missing.join(', ')} for skill "${name}"${chosenAction ? ` (action "${chosenAction}")` : ''}.`,
            required_parameters: [...new Set([...declaredRequired, ...actionRequired])],
            valid_parameters: [...valid],
            hint: 'Supply every required field explicitly — do NOT rely on a handler default. '
              + 'If you do not know a value yet, read it with a list/get call first, then stage again.'
              + (typeof skillRow?.instructions === 'string' && skillRow.instructions.trim() !== ''
                ? ` This skill has instructions: call read_skill({ name: "${name}" }) for the full contract.`
                : '')
              + ' Fix the arguments and call this skill again — do not switch to a different skill because of this bounce.',
          },
        };
      }

      // Reference args must be REFERENCES. A name in an _id field ("company_id":
      // "Nordisk Fiber AB", observed live) passes the key check, gets approved
      // by a human, and then dies on the uuid cast — the card ends up wearing
      // an error a lookup would have prevented. Bounce it pre-stage instead.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      // `id` counts as a reference key. It was excluded — the suffix test read
      // "_id" — so manage_flowtable_record{id: "<a product name>"} sailed
      // through the guard, through a human approval, and died on the uuid cast
      // (QA, 2026-08-20). A bare `id` is the most common reference key there is.
      const isRefKey = (k: string) => k === 'id' || k.endsWith('_id');
      const badRefs = Object.entries(args).filter(([k, v]) =>
        isRefKey(k) && typeof v === 'string' && v.trim() !== '' && !UUID_RE.test(v.trim()));
      // A name in an _id field is usually RESOLVABLE: company_id="Nordisk
      // Fiber AB" names exactly one row in companies. Resolve it server-side —
      // deterministic, and the approval card shows the substitution. Only an
      // ambiguous or unknown name bounces back to the model. (Weak models
      // repeatedly promised "jag skapar den nu…" instead of doing this lookup
      // themselves; eleven live smokes said stop asking them to.)
      const resolvedNotes: string[] = [];
      for (const [k, v] of badRefs) {
        // A bare `id` names no entity, so there is no table to look the value
        // up in — we can only say that it is not an id. That is enough: the
        // alternative is letting a product NAME through as a record id.
        if (k === 'id') {
          await logGateOutcome('ref-bounce', `id="${v}" is not a UUID`);
          return {
            ok: false,
            name,
            body: {
              error: `Not staged: id="${v}" is not a UUID — "id" identifies an existing row and must be the row's real id.`,
              hint: 'Look the row up first (a list/get/search action on the same skill, filtered by the name you have), then stage again with the id it returned. If you meant to CREATE a row, omit id and pass the field values instead.',
            },
          };
        }
        const entity = k.slice(0, -3);
        // Pages have no `name` column and agents address them by URL path —
        // page_id="/blocks" (FlowWork live, 2026-08-19) died in the generic
        // name-lookup below. Resolve pages by slug (slash-tolerant), then
        // title, mirroring agent-execute's own resolvePageId.
        if (entity === 'page') {
          const slug = String(v).trim().replace(/^\/+/, '');
          const { data: bySlug } = await service
            .from('pages').select('id').eq('slug', slug).is('deleted_at', null).limit(2);
          let match = bySlug?.length === 1 ? bySlug[0] : null;
          if (!match) {
            const { data: byTitle } = await service
              .from('pages').select('id').ilike('title', slug).is('deleted_at', null).limit(2);
            match = byTitle?.length === 1 ? byTitle[0] : null;
          }
          if (match) {
            args[k] = match.id;
            resolvedNotes.push(`${k}: "${v}" → ${match.id}`);
            continue;
          }
          await logGateOutcome('ref-bounce', `page_id="${v}" matched no page by slug or title`);
          return {
            ok: false,
            name,
            body: {
              error: `Not staged: page_id="${v}" matched no page by slug or title.`,
              hint: 'Call manage_page list to see available slugs, then stage again with the slug or the page UUID.',
            },
          };
        }
        const table = entity.endsWith('y') ? `${entity.slice(0, -1)}ies` : `${entity}s`;
        try {
          const { data: matches } = await service
            .from(table).select('id, name').ilike('name', String(v).trim()).limit(2);
          if (matches?.length === 1) {
            args[k] = matches[0].id;
            resolvedNotes.push(`${k}: "${v}" → ${matches[0].id}`);
            continue;
          }
          await logGateOutcome('ref-bounce', `${k}="${v}" ${matches?.length ? 'ambiguous' : 'no match'} in ${table}`);
          return {
            ok: false,
            name,
            body: {
              error: `Not staged: ${k}="${v}" ${matches?.length ? 'matches several rows' : `has no match in ${table}`} — an _id parameter needs a UUID.`,
              hint: 'Look the id up (e.g. a list/search skill for that entity, or get_customer_360), then stage again with the real id — or omit the field if it is optional.',
            },
          };
        } catch {
          await logGateOutcome('ref-bounce', `${k}="${v}" lookup in ${table} threw`);
          return {
            ok: false,
            name,
            body: {
              error: `Not staged: ${k}="${v}" is not a UUID and could not be resolved.`,
              hint: 'Look the id up first, then stage again — or omit the field if optional.',
            },
          };
        }
      }

      // A well-formed UUID is not automatically the RIGHT uuid. An order id
      // passed as `return_id` (QA, 2026-08-20) has the shape the guard above
      // tests for, so it passed, staged, and was approved by a human before
      // the foreign key rejected it. Shape is not identity: probe the target
      // table and let the model correct itself while correcting is still free.
      //
      // Fail-OPEN on anything we cannot check (a key whose table we cannot
      // derive, a table that does not exist or is not readable): this guard
      // exists to catch a confident mistake, not to invent new refusals.
      for (const [k, v] of Object.entries(args)) {
        if (!isRefKey(k) || k === 'id') continue; // bare `id` names no table
        if (typeof v !== 'string' || !UUID_RE.test(v.trim())) continue;
        const entity = k.slice(0, -3);
        const table = entity === 'page'
          ? 'pages'
          : entity.endsWith('y') ? `${entity.slice(0, -1)}ies` : `${entity}s`;
        try {
          const { data: row, error: probeErr } = await service
            .from(table).select('id').eq('id', v.trim()).maybeSingle();
          if (probeErr) continue; // unknown/unreadable table — not evidence
          if (row) continue;
          await logGateOutcome('ref-bounce', `${k}=${v} is not a row in ${table}`);
          return {
            ok: false,
            name,
            body: {
              error: `Not staged: ${k}=${v} is a valid UUID but there is no such row in ${table} — this looks like the id of a different entity.`,
              hint: `Fetch the ${entity} first (a list/get/search skill for ${entity}s) and use the id from that result. An id you got from another entity's record is not interchangeable.`,
            },
          };
        } catch {
          continue; // probe failed — fail open
        }
      }

      if (resolvedNotes.length) (args as any).__resolved = resolvedNotes;
    }

    // The parameter contract is only the TOP level of the argument object. A
    // page write carries its real payload one level down, in the blocks — and
    // those have contracts of their own that agent-execute enforces at WRITE
    // time, i.e. after the approval click. Verified live 2026-08-22: a
    // manage_page create whose hero block had no `title` passed this preflight
    // (action and title were present at the top level), staged, got a human's
    // approval, and only then died on
    //   'Block validation dropped 2 block(s): "hero" block: missing required
    //    field [title]; … Fix the named fields and retry — nothing was written.'
    // That message is WRITTEN to be self-correcting, and in FlowPilot's ReAct
    // loop it works: the refusal returns as a tool result and the model fixes
    // the field next turn. The approval gate breaks that loop — the model is
    // gone by the time the error exists, and the error lands on the human who
    // just approved a doomed write.
    //
    // So the bounce moves in front of the staging. Same contracts, same call
    // order, imported from the same file the executor uses — never re-stated
    // here, because two copies of a contract are two contracts.
    const blockCheck = preflightBlockArgs(name, args);
    if (blockCheck.errors.length) {
      await logGateOutcome('preflight-bounce', `block contract: ${blockCheck.errors.join('; ')}`);
      return {
        ok: false,
        name,
        body: {
          error: `Not staged: ${blockCheck.errors.length} block(s) would be rejected at write time — `
            + `${blockCheck.errors.join('; ')}. Nothing was written and nothing was sent for approval.`,
          block_errors: blockCheck.errors,
          hint: 'Fix the named fields and call this skill again — do NOT ask the user to approve this version. '
            + 'Call describe_blocks({ block_type: "<type>" }) for a block\'s exact field contract if the error does not already name the field you need.',
        },
      };
    }
  }

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_name: name,
        arguments: (() => { const a = { ...args }; delete (a as any).__resolved; return a; })(),
        agent_type: 'flowwork',
        caller_user_id: userId,
        // Writes NEVER execute from chat: they stage, and the approval card's
        // human click is the initiative transfer.
        ...(tier === 'stage' ? { force_staged: true } : {}),
      }),
    });
    let body: any = await resp.json().catch(() => ({ error: `agent-execute returned ${resp.status}` }));

    if (tier === 'stage' && body?.staged === true && body?.operation_id) {
      const resolved = (args as any).__resolved as string[] | undefined;
      delete (args as any).__resolved;
      const staged: StagedAction = {
        operation_id: String(body.operation_id),
        skill: name,
        args,
        ...(resolved ? { resolved } : {}),
        reinvoke_args: body?.next?.reinvoke_args ?? { _approved_operation_id: body.operation_id },
        preview: body?.preview,
      };
      return { ok: true, body: { status: 'staged', operation_id: staged.operation_id, note: STAGE_NOTICE }, name, staged };
    }

    if (!resp.ok && JSON.stringify(body).includes('Skill not found')) {
      body = { ...body, hint: 'That skill name does not exist. Call search_skills to discover the correct name — many modules expose manage_<entity> with arguments {"action":"list"}.' };
    }
    return { ok: resp.ok, body, name };
  } catch (e) {
    return { ok: false, body: { error: e instanceof Error ? e.message : 'agent-execute unreachable' }, name };
  }
}

/* ------------------------------------------------------------------ */
/* Rolling history distillate                                          */
/* ------------------------------------------------------------------ */
/**
 * Compress older turns into one dense session summary (the same
 * distill-to-survive pattern the flowpilot-lifecycle uses for its own
 * memory). Called only when the estimated prompt crosses ~85% of the model
 * window. Returns null on any failure — the hard cap then trims raw turns
 * instead (Law 4: fail forward, the session must never die on a provider
 * context overflow because a summarizer hiccuped).
 */
async function distillHistory(opts: {
  apiUrl: string;
  apiKey: string;
  model: string;
  provider: string;
  reasoningParams: Record<string, unknown>;
  toDistill: ChatMsg[];
  windowTokens: number;
  supabaseAdmin: any;
  userId: string;
  mode: string;
}): Promise<string | null> {
  const t0 = Date.now();
  try {
    let transcript = opts.toDistill
      .map((m) => `${m.role === 'assistant' ? 'ASSISTANT' : 'USER'}: ${m.content}`)
      .join('\n\n');
    // The distiller runs on the same model — its own input must fit the same
    // window. Clip the transcript head-first: the tail is closest to the raw
    // turns we keep, so the oldest content is what a clip should cost.
    const maxChars = Math.max(8_000, (opts.windowTokens - RESPONSE_RESERVE_TOKENS - 2_000) * WINDOW_CHAR_PER_TOKEN);
    if (transcript.length > maxChars) {
      transcript = `…[oldest turns omitted]\n\n${transcript.slice(transcript.length - maxChars)}`;
    }
    const resp = await fetch(opts.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        // OpenAI reasoning models 400 on `max_tokens` — they take
        // `max_completion_tokens`; every other OpenAI-compatible endpoint
        // (incl. Gemini's compat layer and local LLMs) takes `max_tokens`.
        ...(opts.provider === 'openai' && isOpenAiReasoningModel(opts.model)
          ? { max_completion_tokens: 900 }
          : { max_tokens: 900 }),
        messages: [
          {
            role: 'system',
            content: [
              'You compress chat history. Summarize the conversation below into ONE dense session summary that a colleague model will use as its only memory of these turns.',
              'KEEP: decisions made, facts and figures established, entity names and ids (customers, orders, invoices, tickets), links/slugs, actions staged or approved, and open questions still unanswered.',
              'DROP: greetings, repetition, and anything restated later in the conversation.',
              'Write in the conversation\'s own language. Plain prose or tight bullets, max ~400 words. Output ONLY the summary.',
            ].join('\n'),
          },
          { role: 'user', content: transcript },
        ],
        ...opts.reasoningParams,
      }),
    });
    if (!resp.ok) {
      console.error('[cowork-chat] distill call failed', resp.status, (await resp.text()).slice(0, 300));
      return null;
    }
    const json = await resp.json();
    const usage = json?.usage || {};
    await logAiUsage({
      supabase: opts.supabaseAdmin, source: 'workspace-chat', provider: opts.provider, model: opts.model,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      latencyMs: Date.now() - t0, status: 'success', userId: opts.userId,
      metadata: { mode: opts.mode, phase: 'history-distill', distilled_messages: opts.toDistill.length },
    });
    const summary = String(json.choices?.[0]?.message?.content || '').trim();
    return summary || null;
  } catch (e) {
    console.error('[cowork-chat] distill failed', e);
    return null;
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

    // Role gate — the MATRIX decides, not a hardcoded role list (Svante-fynd
    // #3, 2026-08-17: sales/marketing had the workspaceChat module granted in
    // Role Permissions and were still refused by an admin/employee/manager
    // literal from the pre-matrix era). FlowWork is everyone's workroom: any
    // staff role the matrix has given the module to belongs here. Customers
    // stay out the same way they stay out of every staff surface — the matrix
    // has no workspaceChat grant for them.
    const { data: allowed } = await supabaseAdmin
      .rpc('can_access_module', { _user_id: user.id, _module_id: 'workspaceChat' });
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden — your role has not been granted the FlowWork module (Role Permissions → workspaceChat)' }), {
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
    // Reasoning models (gpt-5.x) reject function tools on /chat/completions
    // unless reasoning_effort is 'none' — and FlowWork is a real-time surface,
    // so zero thinking latency is what we want on every pass anyway. Found
    // live: Svante's FlowWork bento request 400:ade when the map moved to luna.
    const reasoningParams = provider === 'openai' && isOpenAiReasoningModel(model)
      ? { reasoning_effort: 'none' } : {};
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
      '5. Reads execute immediately. WRITES never execute from chat: when the user asks you to DO something (create, update, send, book), call execute_skill with complete arguments RIGHT AWAY — the platform stages it and shows an approval card, and THE CARD IS THE CONFIRMATION. Do NOT ask "shall I?" first when the request already contains the details; staging is safe by construction. If a staging attempt bounces (unknown parameters / wrong skill), do NOT give up: call search_skills with the entity word (ticket, invoice, …) and stage again with the correct skill — you have tool rounds left. IDs you learned from earlier tool results (a company_id from manage_company or get_customer_360) are yours to use — never ask the user for an id a tool already gave you. And NEVER end your reply with a promise (\'jag genomför det nu\') — either the tool call happens in THIS turn, or you say the action awaits approval.',
      '7. When the question concerns a SPECIFIC customer, company, order, invoice, ticket or deal and the CONTEXT block does not already answer it, you MUST call search_skills and then execute_skill BEFORE answering (e.g. get_customer_360 for a full customer picture, list_tickets, list_invoices). NEVER ask the user for permission to look something up, and never answer "I could not find it" without having executed at least one skill. Always call search_skills FIRST to get exact names — many modules expose manage_<entity>, readable with arguments {"action":"list", ...filters}. Max 6 tool rounds; be economical.',
      '8. HONESTY: claim "no tickets / no unpaid invoices / no X" ONLY when a skill you executed returned an empty result for exactly that entity and that company. If your executed skills did not cover something, say plainly that you could not check it. Never present a lookup of the wrong module as an answer.',
      '9. AMOUNTS: money fields in skill results are minor units — a field ending in _cents holds hundredths (total_cents: 2312500 means 23 125,00 kr). Always divide by 100 before presenting, and never invent a currency.',
      '6. Be concise, use markdown, and match the user\'s language.',
    ].join('\n');

    // What THIS colleague may be offered. Loaded once per request and passed
    // down: discovery, read_skill and execute_skill must all answer the same
    // question the executor will answer when the approval card is clicked.
    const callerModules = await loadCallerModules(supabaseAdmin, user.id).catch((e) => {
      console.error('[cowork-chat] module grants unreadable — failing closed:', e);
      return new Set<string>();
    });

    // Pre-rank the live tools for THIS question (Skill Relevance Engine) and
    // put them straight into the prompt — the model executes directly instead
    // of discovering the catalog one round-trip at a time.
    let rankedToolsBlock = '';
    try {
      const pre = await runSearchSkills(supabaseAdmin, String(latestUserMessage), callerModules);
      if (pre.skills.length) {
        rankedToolsBlock = [
          '',
          '--- LIVE TOOLS RANKED FOR THIS QUESTION (execute_skill) ---',
          ...pre.skills.map((sk: any) =>
            `- ${sk.name}: ${sk.description}`
            + (sk.params ? `\n  params: ${sk.params}` : '')
            + (sk.required ? `\n  required: ${sk.required}` : '')
            + (sk.actions ? `\n  ${sk.actions}` : sk.tier ? `\n  ${sk.tier}` : '')),
          'Use exact names. These are already scoped to what you are allowed to do here — a write in this list is a write you may propose. For other needs, call search_skills.',
          '--- END LIVE TOOLS ---',
        ].join('\n');
      }
    } catch (e) {
      console.error('pre-rank failed (non-fatal):', e);
    }

    // The COMPANY's identity — same grounding as the public chat and the
    // ReAct engine (one identity, every mouth). Without it, "our products"
    // resolves to the model's prior about the platform itself.
    //
    // 'narrative': FlowWork is the AUTHORING surface. When it is asked for a
    // landing page the knowledge sources are switched off on purpose (a landing
    // page rests on the Business Identity, not on chunks of internal wiki), so
    // here the identity is not one source among several — it is the entire
    // input. The narrow projection made that task impossible, not merely worse:
    // nine assertions, none of the company's 1 284 characters of story.
    const businessIdentity = await loadBusinessIdentityBlock(supabaseAdmin, 'narrative').catch(() => '');

    // TODAY. A model's sense of "now" is its training cutoff, and the loop
    // stages real records with real dates: asked for a due date "in 30 days"
    // it produced one two years in the past, and the approval card looked
    // perfectly reasonable (QA, 2026-08-20). Nothing else in the prompt can
    // supply this — it is the one fact the model cannot infer from context.
    const now = new Date();
    const todayBlock = [
      `TODAY IS ${now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}, ${now.toISOString().slice(0, 10)} (UTC).`,
      'Every relative date the user gives ("today", "next Friday", "in 30 days", "last quarter") resolves against THAT date, not against your training data. When a skill takes a date, compute it from today and pass an explicit ISO date (YYYY-MM-DD) — never a relative phrase, and never a year you assumed.',
    ].join('\n');

    const systemPrompt = [
      mode === 'strict'
        ? 'You are FlowWink Workspace Chat — strictly grounded in the user\'s workspace data.'
        : 'You are FlowWink Cowork Chat — a co-working assistant for an admin/employee. You combine the user\'s workspace data with your own knowledge (and optionally the web) to give the most useful answer.',
      '',
      todayBlock,
      '',
      mode === 'strict' ? strictRules : coworkRules,
      '',
      businessIdentity,
      businessIdentity
        ? 'CONTENT GROUNDING RULE: outward-facing content grounds ONLY in the business identity above and in data fetched via skills. The platform and its features are your tools, never the company\'s products.'
        : '',
      '',
      '--- WORKSPACE CONTEXT ---',
      contextText || '(No data available for the selected sources.)',
      '--- END CONTEXT ---',
      rankedToolsBlock,
    ].join('\n');

    /* -------- History window (Model Context Window Guard) ----------- */
    // The source half of the prompt is budgeted above (TOTAL_TOKEN_BUDGET);
    // this is the HISTORY half. The client sends the full session every turn,
    // so without a window a long session grows until the provider rejects the
    // request outright. Resolve the model's window (stingy default for
    // unknown models; per-instance override via system_ai.contextWindows),
    // distill older turns at ~85%, and hard-cap what we send to
    // window − response reserve — trimming oldest raw turns first, never the
    // system prompt (soul/identity/retrieval).
    const { data: sysAiRow } = await supabaseAdmin
      .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();
    const windowOverrides = (sysAiRow?.value as any)?.contextWindows ?? null;
    const win = resolveContextWindow(provider, model, windowOverrides);

    const systemTokens = estimatePromptTokens(systemPrompt);
    let history: ChatMsg[] = messages.map((m) => ({ role: m.role, content: String(m.content ?? '') }));
    let historyDistilled = false;

    const plan = planHistoryWindow({ history, systemTokens, windowTokens: win.tokens });
    if (plan.needsDistillation) {
      const summary = await distillHistory({
        apiUrl, apiKey, model, provider, reasoningParams,
        toDistill: plan.toDistill, windowTokens: win.tokens,
        supabaseAdmin, userId: user.id, mode,
      });
      if (summary) {
        history = [
          {
            role: 'system',
            content: `SESSION SUMMARY — the older turns of this conversation were compressed to fit the model's context window. Treat this as established conversation history:\n\n${summary}`,
          },
          ...plan.keepRaw,
        ];
        historyDistilled = true;
      }
      // summary === null → fail forward: the hard cap below trims raw turns.
    }

    const capped = enforceHardCap({
      history, systemTokens, windowTokens: win.tokens,
      protectedHead: historyDistilled ? 1 : 0,
    });
    history = capped.history;

    const promptTokensEst = systemTokens + estimateMessagesTokens(history);
    contextMeta.prompt_tokens_est = promptTokensEst;
    contextMeta.window_tokens = win.tokens;
    contextMeta.window_known = win.known;
    contextMeta.history_distilled = historyDistilled;
    contextMeta.history_dropped = capped.droppedCount;
    console.log(`[cowork-chat] prompt window: ~${promptTokensEst}/${win.tokens} tokens (known=${win.known}), distilled=${historyDistilled}, dropped=${capped.droppedCount}`);

    /* -------- Tool loop (only when web_search is on) -------- */
    const conversation: any[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    // Dispatch tools are ALWAYS mounted — they fetch workspace data, which both
    // modes want. Web search remains cowork-only and settings-gated.
    const tools = [...(webSearchOn ? [WEB_SEARCH_TOOL] : []), ...DISPATCH_TOOLS];
    const consulted: Array<{ skill: string; ok: boolean; ms: number; error?: string }> = [];
    const stagedActions: StagedAction[] = [];
    // Weak models fetch the missing id and then EXIT with "jag skapar den nu…"
    // — a promise, no call. Mechanical backstop: if a write bounced and nothing
    // got staged, the first attempt to finalize earns exactly one reminder
    // round. Counts, not text-sniffing.
    let bouncedStage = false;
    let nudged = false;

    // First, run a (non-streaming) pass if tools are enabled, so we can resolve tool calls.
    // If no tools needed → switch to streaming on the second pass.
    if (tools) {
      // Up to 2 tool-call rounds to keep latency bounded.
      // 6 rounds, not 4: locate→read→write against a wiki/page costs three tool
      // rounds before the staged write — QA run died holding the full page
      // content one round short of the update (D2, 2026-08-19). Latency stays
      // bounded: most turns still use 1-2 rounds.
      for (let round = 0; round < 6; round++) {
        const t0 = Date.now();
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: conversation, tools, tool_choice: 'auto', ...reasoningParams }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          console.error('AI provider error (tool pass):', resp.status, errText);
          await logAiUsage({
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
        await logAiUsage({
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
          if (bouncedStage && stagedActions.length === 0 && !nudged && round < 3) {
            nudged = true;
            conversation.push(choice.message);
            conversation.push({
              role: 'system',
              content: 'Nothing has been staged. If the user asked for a write, call execute_skill NOW with the corrected arguments (use ids from your tool results). If you truly cannot, say exactly what is missing. Do not promise future action.',
            });
            continue;
          }
          // No tool calls — we have the final assistant message. Stream it back as a single chunk.
          const finalText: string = choice?.message?.content || '';
          return streamFinal(citations, finalText, contextMeta, consulted, stagedActions);
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
            const out = await runSearchSkills(supabaseAdmin, args.query || String(latestUserMessage), callerModules);
            conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
          } else if (tc.function?.name === 'read_skill') {
            const out = await runReadSkillTool(supabaseAdmin, String(args.name || ''), callerModules);
            conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
          } else if (tc.function?.name === 'execute_skill') {
            const t0 = Date.now();
            let out: Awaited<ReturnType<typeof runExecuteSkill>>;
            if (stagedActions.length >= 2 && classifyCall(String(args.name || ''), args.arguments ?? {}) === 'stage') {
              // Two proposals per turn is plenty — more reads as spam, and each
              // card demands a human decision.
              out = { ok: false, body: { error: 'Max 2 staged actions per message. Summarize what is already staged.' }, name: String(args.name || '') };
            } else {
              out = await runExecuteSkill(
                supabaseAdmin, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                String(args.name || ''), args.arguments ?? {}, user.id, callerModules,
              );
            }
            if (out.staged) stagedActions.push(out.staged);
            if (!out.ok && classifyCall(out.name, args.arguments ?? {}) === 'stage') bouncedStage = true;
            const skillName = out.name;
            // A failed consult carries WHY. The trace row used to say only
            // `ok:false`, so a bounce and a genuine empty result were the same
            // pixel — and the only account of what went wrong was the model's
            // own paraphrase of it in the answer text.
            const failReason = out.ok
              ? undefined
              : String((out.body as { error?: unknown })?.error ?? 'unknown error').slice(0, 300);
            consulted.push({ skill: skillName, ok: out.ok, ms: Date.now() - t0, ...(failReason ? { error: failReason } : {}) });
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
            // The classic 3-tool-surface mistake: the model calls a SKILL name
            // (manage_page) as if it were a tool, instead of
            // execute_skill({ name: 'manage_page', arguments: {…} }). Naming
            // only the error leaves it to guess the same shape again or drop
            // the write — the same dead-end class as the parameter bounce.
            // mcp-server already answers this with `available_tools`; same
            // answer here.
            const attempted = String(tc.function?.name || '');
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({
                error: `Unknown tool: ${attempted}. This surface has exactly three tools.`,
                available_tools: DISPATCH_TOOLS.map((t) => t.function.name),
                hint: `Skills are not tools here. If "${attempted}" is a skill, call `
                  + `execute_skill({ name: "${attempted}", arguments: { … } }) — and read_skill({ name: "${attempted}" }) `
                  + `first if you are unsure of its parameters. If it is not a skill, call search_skills to find the right one. `
                  + `Do not abandon the task over this.`,
              }),
            });
          }
        }
      }
      // Force a final answer with no tools
      const tForce = Date.now();
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: conversation, ...reasoningParams }),
      });
      const json = await resp.json();
      const fUsage = json?.usage || {};
      await logAiUsage({
        supabase: supabaseAdmin, source: 'workspace-chat', provider, model,
        promptTokens: fUsage.prompt_tokens || 0,
        completionTokens: fUsage.completion_tokens || 0,
        totalTokens: fUsage.total_tokens || (fUsage.prompt_tokens || 0) + (fUsage.completion_tokens || 0),
        latencyMs: Date.now() - tForce,
        status: resp.ok ? 'success' : 'error',
        userId: user.id, metadata: { mode, phase: 'force-final' },
      });
      const finalText: string = json.choices?.[0]?.message?.content || '';
      return streamFinal(citations, finalText, contextMeta, consulted, stagedActions);
    }

    /* -------- No tools: stream straight through -------- */
    const tStream = Date.now();
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true, messages: conversation, stream_options: { include_usage: true }, ...reasoningParams }),
    });
    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      console.error('AI provider error:', upstream.status, errText);
      await logAiUsage({
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
          await logAiUsage({
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
  consulted?: Array<{ skill: string; ok: boolean; ms: number; error?: string }>,
  staged?: StagedAction[],
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
      if (staged && staged.length) {
        controller.enqueue(encoder.encode(`event: staged\ndata: ${JSON.stringify(staged)}\n\n`));
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
