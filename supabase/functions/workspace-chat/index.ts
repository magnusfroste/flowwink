/**
 * Workspace Chat — Internal RAG/CAG endpoint
 *
 * Authenticated chat for admins/employees to ask questions about their own
 * FlowWink data (documents, contracts, KB, pages, leads, deals, employees).
 *
 * - Uses the same AI provider resolved by `system_ai` settings (Integrations).
 * - Pure read/RAG: NO mutations, NO tool calls.
 * - Streams SSE back to the client, prepending a single `event: citations` frame.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { resolveAiConfig, isAnthropicProvider } from '../_shared/ai-config.ts';

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

const PER_SOURCE_LIMIT = 25;

async function buildContext(
  supabase: any,
  sources: SourceKey[],
): Promise<{ contextText: string; citations: Citation[] }> {
  const citations: Citation[] = [];
  const blocks: string[] = [];
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

  // --- Documents ---
  if (sources.includes('documents')) {
    const { data } = await supabase
      .from('documents')
      .select('id, title, description, related_entity_type, created_at')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (data?.length) {
      const lines = data.map((d: any) => {
        const r = push('document', d.id, d.title || 'Untitled', `/admin/documents/${d.id}`);
        const meta = d.related_entity_type ? ` [${d.related_entity_type}]` : '';
        const desc = d.description ? ` — ${String(d.description).slice(0, 200)}` : '';
        return `[${r}] ${d.title || 'Untitled'}${meta}${desc}`;
      });
      blocks.push(`### Documents\n${lines.join('\n')}`);
    }
  }

  // --- Contracts (legal) + Employment contracts ---
  if (sources.includes('contracts')) {
    const { data: contracts } = await supabase
      .from('contracts')
      .select('id, title, status, counterparty, renewal_date, end_date')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (contracts?.length) {
      const lines = contracts.map((c: any) => {
        const r = push('contract', c.id, c.title || 'Contract', `/admin/contracts/${c.id}`);
        const parts = [
          c.status && `status=${c.status}`,
          c.counterparty && `party=${c.counterparty}`,
          c.renewal_date && `renews=${c.renewal_date}`,
          c.end_date && `ends=${c.end_date}`,
        ].filter(Boolean).join(', ');
        return `[${r}] ${c.title || 'Contract'} (${parts})`;
      });
      blocks.push(`### Contracts\n${lines.join('\n')}`);
    }

    const { data: empContracts } = await supabase
      .from('employment_contracts')
      .select('id, employee_name, role, status, start_date, end_date')
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (empContracts?.length) {
      const lines = empContracts.map((c: any) => {
        const r = push('employment_contract', c.id, `${c.employee_name || 'Employee'} — ${c.role || 'role'}`, `/admin/hr/contracts/${c.id}`);
        return `[${r}] ${c.employee_name || ''} ${c.role ? `(${c.role})` : ''} status=${c.status || 'n/a'} ${c.start_date ? `from ${c.start_date}` : ''}`;
      });
      blocks.push(`### Employment Contracts\n${lines.join('\n')}`);
    }
  }

  // --- Knowledge Base ---
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
      blocks.push(`### Knowledge Base\n${lines.join('\n')}`);
    }
  }

  // --- Pages ---
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
      blocks.push(`### Pages\n${lines.join('\n')}`);
    }
  }

  // --- CRM (leads + deals) ---
  if (sources.includes('crm')) {
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, name, email, status, score, companies ( name )')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(PER_SOURCE_LIMIT);
    if (leadsErr) console.error('workspace-chat: leads query failed', leadsErr);
    if (leads?.length) {
      const lines = leads.map((l: any) => {
        const r = push('lead', l.id, l.name || l.email || 'Lead', `/admin/leads/${l.id}`);
        const company = l.companies?.name;
        return `[${r}] ${l.name || l.email || 'Lead'} ${company ? `@ ${company}` : ''} status=${l.status || 'n/a'} score=${l.score ?? '–'}`;
      });
      blocks.push(`### Leads (top ${leads.length} by score)\n${lines.join('\n')}`);
    }

    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, title, stage, value, currency, close_date')
      .order('updated_at', { ascending: false })
      .limit(PER_SOURCE_LIMIT);
    if (dealsErr) console.error('workspace-chat: deals query failed', dealsErr);
    if (deals?.length) {
      const lines = deals.map((d: any) => {
        const r = push('deal', d.id, d.title || 'Deal', `/admin/deals/${d.id}`);
        return `[${r}] ${d.title || 'Deal'} stage=${d.stage || 'n/a'} value=${d.value ?? '–'} ${d.currency || ''} ${d.close_date ? `close=${d.close_date}` : ''}`;
      });
      blocks.push(`### Deals\n${lines.join('\n')}`);
    }
  }

  // --- Employees ---
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
      blocks.push(`### Employees\n${lines.join('\n')}`);
    }
  }

  return {
    contextText: blocks.join('\n\n'),
    citations,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;

    // Parse body
    const body = await req.json().catch(() => ({}));
    const messages: Array<{ role: string; content: string }> = body.messages || [];
    const requestedSources: SourceKey[] = Array.isArray(body.sources) && body.sources.length > 0
      ? body.sources.filter((s: string) => ALL_SOURCES.includes(s as SourceKey))
      : ALL_SOURCES;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages[] required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service-role client for context building (bypasses RLS — admin/employee context)
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the user has admin or employee role before exposing internal data
    const { data: roleRows } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    const allowed = roles.includes('admin') || roles.includes('employee') || roles.includes('manager');
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin or employee role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build context
    const { contextText, citations } = await buildContext(supabaseAdmin, requestedSources);

    // Resolve AI provider
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabaseAdmin, 'fast');

    if (isAnthropicProvider(apiUrl)) {
      // Anthropic uses a different format — not supported in this v1.
      return new Response(JSON.stringify({
        error: 'Anthropic provider not yet supported by Workspace Chat. Switch to OpenAI, Gemini or Local LLM in Integrations.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = [
      'You are FlowWink Workspace Chat — an internal assistant strictly grounded in the user\'s own business data shown in the CONTEXT block below.',
      '',
      'HARD RULES (do not break under any circumstances):',
      '1. Answer ONLY using facts present in the CONTEXT block. Do NOT use outside / world knowledge.',
      '2. If the answer is not in the context, reply with EXACTLY: "I can\'t find that in your workspace data. Try selecting more sources, or rephrase your question."',
      '3. NEVER answer general-knowledge or trivia questions (e.g. "what is London", "who is X", "explain Y"). For those, use rule #2.',
      '4. You are READ-ONLY. If the user asks you to change something, point them to the relevant admin page instead.',
      '5. Cite every claim with [N] markers matching the reference numbers in the context. Only cite sources you actually used.',
      '6. Match the user\'s language. Be concise. Use markdown.',
      '',
      '--- CONTEXT (your ONLY allowed knowledge for this conversation) ---',
      contextText || '(No data available for the selected sources.)',
      '--- END CONTEXT ---',
    ].join('\n');

    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      console.error('AI provider error:', upstream.status, errText);
      return new Response(JSON.stringify({
        error: `AI provider returned ${upstream.status}`,
        detail: errText.slice(0, 500),
      }), {
        status: upstream.status === 429 ? 429 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream back: prepend a citations frame as the first SSE event
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        // Custom event for citations
        controller.enqueue(encoder.encode(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`));

        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          console.error('stream error:', e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    console.error('workspace-chat error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
