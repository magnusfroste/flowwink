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
import { resolveAiConfig, isAnthropicProvider } from '../_shared/ai-config.ts';
import { logAiUsage } from '../_shared/ai-usage-logger.ts';

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
  | 'employees';

const ALL_SOURCES: SourceKey[] = [
  'documents',
  'contracts',
  'kb',
  'pages',
  'crm',
  'employees',
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
): Promise<{ contextText: string; citations: Citation[]; meta: ContextMeta }> {
  const citations: Citation[] = [];
  const rawBlocks: Array<{ source: string; text: string }> = [];
  let ref = 1;

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

  if (sources.includes('documents')) {
    const { data } = await supabase
      .from('documents')
      .select('id, title, description, related_entity_type, source, content_md, extraction_status, created_at')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (data?.length) {
      const lines = data.map((d: any) => {
        const r = push('document', d.id, d.title || 'Untitled', `/admin/documents/${d.id}`);
        const meta = d.related_entity_type ? ` [${d.related_entity_type}]` : '';
        const sourceTag = d.source && d.source !== 'manual' ? ` (${d.source})` : '';
        const desc = d.description ? ` — ${String(d.description).slice(0, 200)}` : '';

        // If we have a successfully extracted markdown shadow, include a slice
        // of the actual file content so the model can answer about it.
        let body = '';
        if (d.extraction_status === 'success' && d.content_md) {
          const excerpt = String(d.content_md).slice(0, 2000);
          body = `\n${excerpt}${d.content_md.length > 2000 ? '\n[…content truncated]' : ''}`;
        }

        return `[${r}] ${d.title || 'Untitled'}${sourceTag}${meta}${desc}${body}`;
      });
      rawBlocks.push({ source: 'documents', text: `### Documents\n${lines.join('\n\n')}` });
    }
  }

  if (sources.includes('contracts')) {
    const { data: contracts, error: contractsErr } = await supabase
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
      .select('id, title, employment_type, status, start_date, end_date, monthly_salary_cents, currency, employees(full_name)')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (empErr) console.error('cowork-chat: employment_contracts query failed', empErr);
    if (empContracts?.length) {
      const lines = empContracts.map((c: any) => {
        const empName = c.employees?.full_name || 'Employee';
        const label = `${empName} — ${c.title || c.employment_type || 'Contract'}`;
        const r = push('employment_contract', c.id, label, `/admin/hr/contracts/${c.id}`);
        const salary = c.monthly_salary_cents ? `${(c.monthly_salary_cents / 100).toFixed(0)} ${c.currency || ''}/mo` : '';
        return `[${r}] ${label} status=${c.status || 'n/a'} ${c.start_date ? `from ${c.start_date}` : ''} ${c.end_date ? `to ${c.end_date}` : ''} ${salary}`;
      });
      rawBlocks.push({ source: 'employment_contracts', text: `### Employment Contracts\n${lines.join('\n')}` });
    }
  }

  if (sources.includes('kb')) {
    const { data } = await supabase
      .from('kb_articles')
      .select('id, title, slug, summary, body')
      .order('updated_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (data?.length) {
      const lines = data.map((a: any) => {
        const r = push('kb_article', a.id, a.title, `/kb/${a.slug || a.id}`);
        const summary = a.summary || (a.body ? String(a.body).slice(0, 200) : '');
        return `[${r}] ${a.title} — ${summary}`;
      });
      rawBlocks.push({ source: 'kb', text: `### Knowledge Base\n${lines.join('\n')}` });
    }
  }

  if (sources.includes('pages')) {
    const { data } = await supabase
      .from('pages')
      .select('id, title, slug, status, seo_description')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (data?.length) {
      const lines = data.map((p: any) => {
        const r = push('page', p.id, p.title, `/${p.slug || ''}`);
        const desc = p.seo_description ? ` — ${p.seo_description}` : '';
        return `[${r}] ${p.title} (/${p.slug || ''})${desc}`;
      });
      rawBlocks.push({ source: 'pages', text: `### Pages\n${lines.join('\n')}` });
    }
  }

  if (sources.includes('crm')) {
    const { data: leads, error: leadsErr } = await supabase
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
    const { data } = await supabase
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
  const resp = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
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

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const messages: Array<{ role: string; content: string }> = body.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages[] required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const { contextText, citations, meta: contextMeta } = await buildContext(supabaseAdmin, requestedSources);
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
      '5. Cite every claim with [N] markers from the context.',
    ].join('\n');

    const coworkRules = [
      'OPERATING RULES:',
      '1. Prefer facts from the CONTEXT block — it is the user\'s own workspace data. Cite them with [N].',
      `2. You ${allowWorld ? 'MAY' : 'MUST NOT'} use your own training knowledge when context is insufficient. Be explicit when you do (e.g. "Outside your workspace: …").`,
      `3. You ${webSearchOn ? 'MAY' : 'MUST NOT'} call the web_search tool for current/live external info — but only when the answer is not in the workspace context.`,
      '4. Workspace items must be cited with [N] markers. Web results should be cited as plain markdown links.',
      '5. READ-ONLY: never claim to have changed data. For mutations, point to the relevant admin page.',
      '6. Be concise, use markdown, and match the user\'s language.',
    ].join('\n');

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
    ].join('\n');

    /* -------- Tool loop (only when web_search is on) -------- */
    const conversation: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const tools = webSearchOn ? [WEB_SEARCH_TOOL] : undefined;

    // First, run a (non-streaming) pass if tools are enabled, so we can resolve tool calls.
    // If no tools needed → switch to streaming on the second pass.
    if (tools) {
      // Up to 2 tool-call rounds to keep latency bounded.
      for (let round = 0; round < 2; round++) {
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
          return streamFinal(citations, finalText, contextMeta);
        }
        // Execute tool calls
        conversation.push(choice.message);
        for (const tc of toolCalls) {
          if (tc.function?.name === 'web_search') {
            let args: any = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* */ }
            const out = await runWebSearch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, args.query || '', args.limit ?? 4);
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(out),
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
      return streamFinal(citations, finalText, contextMeta);
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
function streamFinal(citations: Citation[], text: string, contextMeta?: ContextMeta): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`));
      if (contextMeta) {
        controller.enqueue(encoder.encode(`event: context_meta\ndata: ${JSON.stringify(contextMeta)}\n\n`));
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
