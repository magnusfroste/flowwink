import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient, getAnonClient } from '../_shared/supabase-clients.ts';
import { loadBusinessIdentityBlock } from '../_shared/domains/business-identity-block.ts';
import { retrieve, renderContext } from '../_shared/retrieval/index.ts';
import { embedQuery } from '../_shared/retrieval/embedder.ts';
import { resolveAuthenticatedCustomer, buildCustomerContext, resolveCompanyMembership, buildCompanyContext } from '../_shared/customer-context.ts';
import {
  loadWorkspaceFiles,
  buildWorkspacePrompt,
  buildSystemPrompt,
  loadSkillTools,
} from "../_shared/agent-reason.ts";
import { scheduleAiUsageLog } from "../_shared/ai-usage-logger.ts";
import {
  type ProviderConfig,
  isOpenAiReasoningModel,
  handleN8nWebhook,
  handleAiError,
} from "../_shared/ai-providers.ts";
// AI MODEL MAP: surfaces declare a TIER, the platform map (site_settings
// key='system_ai') picks the model. Chat is the real-time surface → 'fast'.
import { resolveAiConfig } from "../_shared/ai-config.ts";
import {
  extractTextFromTiptap,
  extractTextFromBlock,
  buildKnowledgeBase,
  loadVisitorContext,
  allowsAllPages,
} from "../_shared/chat-context.ts";
// Chat-kernel helpers — formerly standalone edge functions called over HTTP
// (edge-surface B1b): now direct library imports, one hop less each.
import { routeConversationToAgent } from '../_shared/chat/support-router.ts';
import { handleConsultantCheckin } from '../_shared/chat/consultant-checkin.ts';

/**
 * Chat Completion — Visitor-facing AI chat
 *
 * Now unified with agent-reason core:
 * - Soul/Identity personality injected via buildSystemPrompt(mode='chat')
 * - External skills loaded from DB registry via loadSkillTools
 * - Multi-iteration tool loop (up to 4 rounds)
 * - All OpenAI-compatible providers (OpenAI, Gemini compat, Local) use same code path
 * - N8N remains a special webhook passthrough
 */

/**
 * Retrieval returned nothing while its sources were enabled — the index is
 * empty, not the answer. Distinct from a thrown retrieval error so the two
 * read differently in the logs; both route to full-text grounding.
 */
class EmptyIndexError extends Error {
  constructor() {
    super('knowledge index returned no chunks');
    this.name = 'EmptyIndexError';
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_TOOL_ITERATIONS = 4;

/**
 * Skills that act on the signed-in customer's own records (identity ladder
 * rung 2, dial 2). Offered ONLY when a customer is authenticated; their
 * handlers additionally enforce ownership from the verified _caller_email.
 */
const CUSTOMER_SCOPED_SKILLS = new Set(['request_return']);

/**
 * Skills that act on the signed-in contact's COMPANY records (identity ladder
 * rung 3). Offered ONLY when the contact has an ACTIVE company membership; their
 * handlers enforce isolation from the server-injected `_company_id`.
 */
// Rung-3 (B2B) skills and the MINIMUM company role each requires. Reads are open
// to any active member (viewer+); writes ascend buyer → approver → admin. The
// handlers re-enforce this from the server-injected _company_role — this map only
// keeps the OFFER surface honest (never dangle a skill a role can't use).
const COMPANY_SKILL_MIN_ROLE: Record<string, 'viewer' | 'buyer' | 'approver' | 'admin'> = {
  list_company_orders: 'viewer',
  list_company_invoices: 'viewer',
  request_company_return: 'buyer',
  reorder_company_order: 'buyer',
  request_company_quote: 'buyer',
  initiate_company_invoice_payment: 'buyer',
  approve_company_quote: 'approver',
  manage_company_contacts: 'admin',
};
const COMPANY_ROLE_RANK: Record<string, number> = { viewer: 0, buyer: 1, approver: 2, admin: 3 };
const COMPANY_SCOPED_SKILLS = new Set(Object.keys(COMPANY_SKILL_MIN_ROLE));

/** Last user message as plain text (content may be a multimodal part array). */
function extractLastUserText(messages: Array<{ role: string; content: ChatContent }>): string {
  const last = [...(messages || [])].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return (last.content || [])
    .map((p) => (p.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join(' ');
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: ChatContent;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/**
 * Chat-surface settings (site_settings key='chat').
 *
 * MODEL CHOICE IS NOT HERE. Since the AI-model-map refactor, chat declares a
 * TIER ('fast') and the platform map (site_settings key='system_ai') decides
 * which model/provider serves it; Integrations only carry credentials. The
 * model fields below (openaiModel, geminiModel, openaiBaseUrl, localEndpoint,
 * localModel, *ApiKey) are LEGACY — kept in the type and in the DB row so old
 * rows/UI don't break, but chat-completion no longer reads them for model
 * selection. Do not reintroduce reads of them here.
 *
 * The two exceptions that ARE still chat-owned:
 *  - `aiProvider === 'n8n'` — a pipeline REDIRECT (the whole completion leaves
 *    the platform for a webhook), not a model choice, so it stays on this row.
 *  - `localSupportsToolCalling` — a capability hint for a self-hosted model,
 *    used only as a fallback behind integrations.local_llm.config.toolCalling.
 */
interface ChatSettings {
  aiProvider: 'openai' | 'gemini' | 'local' | 'n8n';
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  localEndpoint?: string;
  localModel?: string;
  localApiKey?: string;
  localSupportsToolCalling?: boolean;
  n8nWebhookUrl?: string;
  n8nWebhookType?: 'chat' | 'generic';
  systemPrompt?: string;
  includeContentAsContext?: boolean;
  contentContextMaxTokens?: number;
  includedPageSlugs?: string[];
  includeKbArticles?: boolean;
  toolCallingEnabled?: boolean;
  /** Optional allow-list of skill names. Empty/undefined = all external skills. */
  allowedSkillNames?: string[];
  firecrawlSearchEnabled?: boolean;
  humanHandoffEnabled?: boolean;
  sentimentDetectionEnabled?: boolean;
  sentimentThreshold?: number;
  allowGeneralKnowledge?: boolean;
}

interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
  sessionId?: string;
  settings?: ChatSettings;
  customerEmail?: string;
  customerName?: string;
  mode?: string;
  checkinId?: string;
}

// ─── Chat-specific tool definitions ───────────────────────────────────────────

const CHAT_TOOLS: Record<string, any> = {
  firecrawl_search: {
    type: "function",
    function: {
      name: "firecrawl_search",
      description: "Search the web for current information when the user asks about topics not in your knowledge base.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    },
  },
  handoff_to_human: {
    type: "function",
    function: {
      name: "handoff_to_human",
      description: "Transfer the conversation to a human support agent when the user is frustrated, explicitly requests a human, or when you cannot help.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why handoff is needed" },
          urgency: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        },
        required: ["reason", "urgency"],
      },
    },
  },
  create_escalation: {
    type: "function",
    function: {
      name: "create_escalation",
      description: "Create a support ticket when no human agents are available.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Brief summary of the issue" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        },
        required: ["summary", "priority"],
      },
    },
  },
  save_visitor_profile: {
    type: "function",
    function: {
      name: "save_visitor_profile",
      description: "Save visitor preferences, interests, or other context to remember them in future conversations. Call when you learn something useful about the visitor.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Visitor's name if provided" },
          preferences: { type: "string", description: "Preferences learned during conversation" },
          interests: { type: "string", description: "Topics or products the visitor is interested in" },
          notes: { type: "string", description: "Any other useful context to remember" },
        },
      },
    },
  },
};

// extractTextFromTiptap, extractTextFromBlock, buildKnowledgeBase,
// loadVisitorContext are imported from ../_shared/chat-context.ts

// ─── Chat tool execution ─────────────────────────────────────────────────────

async function executeChatTool(
  supabase: any, supabaseUrl: string, serviceKey: string,
  toolName: string, args: any,
  conversationId?: string, customerEmail?: string, customerName?: string,
  // VERIFIED signed-in customer email (rung 2) — distinct from the self-declared
  // customerEmail above. Forwarded to agent-execute so customer-scoped skills
  // act on the caller's own records. Never model-supplied.
  authedCustomerEmail?: string,
  // VERIFIED active company + role (rung 3) — server-resolved from the JWT →
  // membership. Forwarded so company-scoped skills act within the caller's own
  // company. Never model-supplied.
  activeCompanyId?: string | null,
  activeCompanyRole?: string | null,
): Promise<string> {
  switch (toolName) {
    case 'firecrawl_search': {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/web-search`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: args.query, limit: 3 }),
        });
        const data = await resp.json();
        if (!data.success) return `Search failed: ${data.error}`;
        return (data.results || []).map((r: any) =>
          `**${r.title}** (${r.url})\n${r.description || r.content?.substring(0, 300) || ''}`
        ).join('\n\n') || 'No results found.';
      } catch (err: any) {
        return `Search error: ${err.message}`;
      }
    }

    case 'handoff_to_human':
    case 'create_escalation': {
      if (!conversationId) return 'Cannot create handoff without a conversation ID.';
      try {
        const data = await routeConversationToAgent({
          conversationId,
          sentiment: {
            frustrationLevel: toolName === 'handoff_to_human' ? 8 : 5,
            urgency: args.urgency || args.priority || 'normal',
            humanNeeded: true,
            trigger: args.reason || args.summary || 'User requested',
          },
        }) as Record<string, any>;
        if (data.action === 'handoff_to_agent') return `HANDOFF_SUCCESS: ${data.message}`;
        if (data.action === 'create_escalation') return `ESCALATION_CREATED: ${data.message}`;
        return data.message || 'Handoff processed.';
      } catch (err: any) {
        return `Handoff error: ${err.message}`;
      }
    }

    default: {
      // Check for visitor profile save
      if (toolName === 'save_visitor_profile') {
        if (!conversationId) return 'Cannot save profile without a conversation.';
        try {
          // Merge with existing profile
          const { data: conv } = await supabase
            .from('chat_conversations')
            .select('visitor_profile')
            .eq('id', conversationId).single();

          const existing = conv?.visitor_profile || {};
          const merged = { ...existing };
          if (args.name) merged.name = args.name;
          if (args.preferences) merged.preferences = args.preferences;
          if (args.interests) merged.interests = args.interests;
          if (args.notes) merged.notes = [existing.notes, args.notes].filter(Boolean).join('; ');

          await supabase
            .from('chat_conversations')
            .update({ visitor_profile: merged })
            .eq('id', conversationId);

          return 'Visitor profile saved. I\'ll remember this for future conversations.';
        } catch (err: any) {
          return `Could not save profile: ${err.message}`;
        }
      }

      // Agent skill — delegate to agent-execute
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skill_name: toolName,
            arguments: args,
            agent_type: 'chat',
            conversation_id: conversationId,
            // Rung-2 identity: enables customer-scoped skills to enforce
            // ownership against the caller's own account. Absent for anon.
            ...(authedCustomerEmail ? { caller_email: authedCustomerEmail } : {}),
            // Rung-3 identity: the active company + role, so company-scoped
            // skills act only within the caller's own company. Absent unless a
            // membership resolved.
            ...(activeCompanyId ? { company_id: activeCompanyId, company_role: activeCompanyRole || 'viewer' } : {}),
          }),
        });
        const data = await resp.json();
        if (data.status === 'pending_approval') return 'This action requires admin approval. Your request has been submitted.';
        if (data.error) return `Could not complete: ${data.error}`;
        return JSON.stringify(data.result || data, null, 2);
      } catch (err: any) {
        return `Action failed: ${err.message}`;
      }
    }
  }
}

// ─── Provider resolution (AI model map) ──────────────────────────────────────
// The chat surface no longer carries its own model config. It declares a TIER
// and reads the platform map via resolveAiConfig(); Integrations are credentials
// only. handleN8nWebhook still lives in ../_shared/ai-providers.ts.

/**
 * n8n is a pipeline REDIRECT, not a model: the completion leaves the platform
 * for a webhook, so no tier/model applies and the choice stays on the chat row.
 * Resolved here (rather than in the shared model layer) because chat is its
 * only surface.
 */
function resolveN8nProvider(
  settings: ChatSettings | undefined,
  integrations: any,
): ProviderConfig | null {
  const n8nConfig = integrations?.n8n?.config || {};
  const webhookUrl = settings?.n8nWebhookUrl || n8nConfig?.webhookUrl;
  if (!webhookUrl) return null;
  return {
    apiKey: '', apiUrl: '', model: '',
    supportsToolCalling: false, isN8n: true, resolvedProvider: 'n8n',
    n8nConfig: {
      webhookUrl,
      webhookType: settings?.n8nWebhookType || n8nConfig?.webhookType || 'chat',
      apiKey: Deno.env.get('N8N_API_KEY') || n8nConfig?.apiKey,
    },
  };
}

/**
 * Resolve the provider that will serve this chat turn.
 *
 * 1. aiProvider === 'n8n' → webhook passthrough (above).
 * 2. Otherwise the platform map decides: resolveAiConfig(supabase, 'fast').
 *
 * ANTHROPIC EDGE: the tool loop below speaks raw OpenAI SSE — it POSTs
 * `{model, messages, stream, tools}` to /chat/completions and parses
 * `choices[].delta.tool_calls` out of the event stream. Anthropic's
 * /v1/messages uses a different request body AND a different event protocol
 * (content_block_delta &c.), so an Anthropic config cannot be piped through
 * this loop — it would 400 upstream, or stream nothing. Rather than fail the
 * visitor-facing chat when an operator points the map at Anthropic, we
 * substitute the first OpenAI-COMPATIBLE provider whose key is in env
 * (OpenAI → Gemini's OpenAI-compat endpoint) and keep the map's model choice
 * for that provider. Fail forward, not gate (Law 4). If neither key exists we
 * throw, and the caller turns it into a clear client-facing error — silently
 * answering from a provider the operator did not configure would be worse.
 * (When the streaming loop learns Anthropic's protocol, delete this block.)
 */
async function resolveChatProvider(
  supabase: any,
  settings: ChatSettings | undefined,
  integrations: any,
): Promise<ProviderConfig> {
  if (settings?.aiProvider === 'n8n') {
    const n8n = resolveN8nProvider(settings, integrations);
    if (n8n) return n8n;
    console.warn('[chat] aiProvider=n8n but no webhook URL configured — falling back to the model map.');
  }

  const ai = await resolveAiConfig(supabase, 'fast');

  if (ai.provider === 'anthropic') {
    const { data: sysRow } = await supabase
      .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();
    const map = (sysRow?.value || {}) as Record<string, string>;

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      console.warn('[chat] Model map resolved to Anthropic; chat streams OpenAI SSE — using OpenAI instead.');
      return {
        apiKey: openaiKey,
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: map.openaiModel || 'gpt-4.1-mini',
        supportsToolCalling: true, isN8n: false, resolvedProvider: 'openai',
      };
    }
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (geminiKey) {
      console.warn('[chat] Model map resolved to Anthropic; chat streams OpenAI SSE — using Gemini instead.');
      return {
        apiKey: geminiKey,
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: map.geminiModel || 'gemini-2.5-flash',
        supportsToolCalling: true, isN8n: false, resolvedProvider: 'gemini',
      };
    }
    throw new Error(
      'Chat requires an OpenAI-compatible streaming provider, but the AI model map resolves to Anthropic ' +
      'and no OPENAI_API_KEY or GEMINI_API_KEY is available as a fallback. Set one of those keys, or point ' +
      'Settings → System AI at OpenAI, Gemini or a local OpenAI-compatible LLM.',
    );
  }

  // Self-hosted models vary: the integration's own capability flag wins, then
  // the legacy chat-row hint, else assume no tool calling.
  const supportsToolCalling = ai.provider === 'local'
    ? (integrations?.local_llm?.config?.toolCalling ?? settings?.localSupportsToolCalling ?? false)
    : true;

  return {
    apiKey: ai.apiKey,
    apiUrl: ai.apiUrl,
    model: ai.model,
    supportsToolCalling,
    isN8n: false,
    resolvedProvider: ai.provider,
  };
}

// ─── Sentiment prompt builder ────────────────────────────────────────────────

function buildSentimentPrompt(threshold: number): string {
  return `\n\n## Sentiment Analysis
Analyze each user message for emotional state. If frustration level exceeds ${threshold}/10 OR user explicitly requests human help, call the handoff_to_human tool with appropriate reason and urgency.
Be empathetic and acknowledge frustration before attempting handoff.`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, conversationId, sessionId, settings: payloadSettings, customerEmail, customerName, mode, checkinId } = await req.json() as ChatRequest;

    // Guard before any messages.filter()/spread below — a caller (e.g. the
    // draft_candidate_outreach skill via edge:chat-completion) that omits
    // messages would otherwise throw "messages is not iterable" mid-handler.
    // Check-in mode builds its own messages, so let it through.
    if (!(mode === 'checkin' && checkinId) && (!Array.isArray(messages) || messages.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'messages is required (a non-empty array of {role, content}).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Redirect check-in mode to dedicated function
    if (mode === 'checkin' && checkinId) {
      // Direct library call — the helper returns a streaming Response
      // (text/event-stream) which we pass through with our CORS headers.
      const resp = await handleConsultantCheckin(messages, checkinId);
      return new Response(resp.body, {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': resp.headers.get('Content-Type') || 'text/event-stream' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = getServiceClient();

    // routingMode is an ADMIN policy, so the DB ('chat' key) is authoritative —
    // ALWAYS load it and never let the request payload override it. A visitor's
    // chat widget can send a default 'ai_first' before its settings query has
    // resolved (or when the field is absent); trusting that silently disables
    // human_first routing, so webchat never reaches live support even though the
    // admin set human_first. (Telegram/SMS don't send routingMode at all, which
    // is why they were unaffected.) Other chat settings still merge from the
    // payload; only routingMode is pinned to the DB value.
    const { data: cs } = await supabase
      .from('site_settings').select('value').eq('key', 'chat').maybeSingle();
    const dbChat = (cs?.value as any) || {};
    // The DB row is authoritative for ALL chat settings, not just routingMode:
    // the payload is the widget's stale client cache (5-min), so an admin's
    // model/provider change would otherwise not apply until every visitor's
    // cache expired — and a crafted caller could pick its own model on our
    // API bill (found when the openaiModel bump to gpt-5.6-luna kept
    // answering as 4.1-mini, 2026-08-19). Payload fills only what the DB
    // does not define.
    // NB: the model half of that story is now moot — model choice moved to the
    // system_ai map (see ChatSettings above), so a payload can no longer name a
    // model at all. The merge still matters for the remaining chat settings
    // (routing, toggles, n8n redirect), so it stays DB-authoritative.
    const settings = { ...((payloadSettings as any) ?? {}), ...dbChat } as typeof payloadSettings;
    const routingMode: string = dbChat.routingMode || (settings as any)?.routingMode || 'ai_first';

    // Check if conversation is handled by a live agent
    if (conversationId) {
      const { data: conversation } = await supabase
        .from('chat_conversations')
        .select('conversation_status, assigned_agent_id')
        .eq('id', conversationId).single();

      if (conversation?.assigned_agent_id &&
        (conversation.conversation_status === 'with_agent' || conversation.conversation_status === 'waiting_agent')) {
        return new Response(
          JSON.stringify({ skipped: true, reason: 'Conversation is being handled by a live support agent.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Routing-mode gate (channel-agnostic). Applies BEFORE AI is invoked.
    if (routingMode === 'human_only' || routingMode === 'human_first') {
      // Count agents currently reachable
      const { count: onlineCount } = await supabase
        .from('support_agents')
        .select('id', { count: 'exact', head: true })
        .in('status', ['online', 'away']);
      const agentsOnline = (onlineCount ?? 0) > 0;

      const routeToHuman = routingMode === 'human_only' || agentsOnline;
      if (routeToHuman) {
        // Move conversation into the human queue
        if (conversationId) {
          await supabase
            .from('chat_conversations')
            .update({ conversation_status: 'waiting_agent', updated_at: new Date().toISOString() })
            .eq('id', conversationId);
          const handoffMsg = agentsOnline
            ? 'Thanks — a teammate will respond shortly.'
            : 'Thanks for your message. Our team is currently offline; we\'ll get back to you as soon as we\'re back.';
          await supabase.from('chat_messages').insert({
            conversation_id: conversationId,
            role: 'system',
            source: 'system',
            content: handoffMsg,
            metadata: { event: 'routing_mode_handoff', routing_mode: routingMode, agents_online: agentsOnline },
          });
        }
        return new Response(
          JSON.stringify({ skipped: true, reason: `routing_mode=${routingMode}`, queued_for_agent: true, agents_online: agentsOnline }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      // human_first + no agents online → fall through to AI
    }

    // Load integrations config
    const { data: integrationSettings } = await supabase
      .from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
    const integrations = integrationSettings?.value as any;

    // Resolve provider from the platform AI model map (tier 'fast'), except for
    // the n8n webhook redirect which stays a chat-surface setting. No hard
    // "enabled" gates — credentials present means it works (Law 4).
    let provider: ProviderConfig;
    try {
      provider = await resolveChatProvider(supabase, settings, integrations);
    } catch (e: any) {
      console.error('[chat] Provider resolution failed:', e?.message || e);
      return new Response(
        JSON.stringify({ error: e?.message || 'No AI provider available for chat.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Load context in parallel: workspace files, knowledge base, skills, visitor history
    const shouldLoadKB = settings?.includeContentAsContext || settings?.includeKbArticles;
    // Master switch for FlowPilot action skills (CRM, booking, etc.)
    const shouldLoadSkills = settings?.toolCallingEnabled && provider.supportsToolCalling;
    // Infrastructure tools — independent of FlowPilot/tool-calling master switch.
    // They are simple "sensor" tools that don't require agent reasoning to be useful.
    // "May the chat search the web", not "search with Firecrawl". The tool calls
    // the web-search function, which picks a provider from the central priority
    // order (SearXNG first by default, then Firecrawl, then Jina) — so gating on
    // Firecrawl specifically left chat search dead on any instance running
    // SearXNG or Jina, while the agents' search_web went through the very same
    // function without complaint. Any enabled provider opens the gate; the
    // absent-means-enabled reading matches web-search's own default.
    const anySearchProvider =
      integrations?.firecrawl?.enabled !== false ||
      integrations?.searxng?.enabled !== false ||
      integrations?.jina?.enabled !== false;
    const firecrawlActive =
      settings?.firecrawlSearchEnabled && anySearchProvider && provider.supportsToolCalling;
    const handoffActive = settings?.humanHandoffEnabled && provider.supportsToolCalling;
    const profileSaveActive = !!conversationId && provider.supportsToolCalling;
    const visitorIdentifier = customerEmail || sessionId;

    // Identity ladder rung 2 (conversation-and-retrieval.md): when the request
    // carries a VERIFIED user JWT (the authenticated portal surface, not the
    // anon public widget), inject the signed-in customer's OWN account summary.
    // Resolved strictly from the token — the body `customerEmail` is rung-1
    // visitor memory only and must never unlock another person's account.
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authedCustomer = await resolveAuthenticatedCustomer(req.headers.get('Authorization'), anonKey);
    const customerContext = authedCustomer
      ? await buildCustomerContext(supabase, authedCustomer.email).catch((e) => {
          console.error('customer context build failed:', e);
          return '';
        })
      : '';

    // Rung 3 (B2B): resolve the contact's company membership from the SAME
    // verified JWT. The active company (sole membership → auto) is what
    // company-scoped skills act on — server-derived, never a body claim.
    const companyCtx = authedCustomer
      ? await resolveCompanyMembership(supabase, req.headers.get('Authorization'), anonKey).catch((e) => {
          console.error('company membership resolve failed:', e);
          return null;
        })
      : null;

    // Knowledge grounding via the Retrieval Engine (M3): top-K query-relevant
    // chunks instead of the legacy full-KB dump. The chunk SEARCH runs with
    // the ANON client — this is the rung-0 visitor surface, and RLS on
    // knowledge_chunks guarantees only 'public' chunks can ground an answer.
    // Falls back to the legacy bulk-dump if the chunk index isn't migrated
    // yet on this instance (Law 4: degrade, never gate).
    const retrievalQueryText = extractLastUserText(messages);
    const buildRetrievedKnowledge = async (): Promise<string> => {
      const sources = [
        ...(settings?.includeContentAsContext ? ['pages'] : []),
        ...(settings?.includeKbArticles ? ['kb_articles'] : []),
      ];
      if (!sources.length || !retrievalQueryText) return '';
      const queryEmbedding = await embedQuery(supabase, retrievalQueryText);
      let chunks = await retrieve(getAnonClient(), {
        query: retrievalQueryText,
        k: 12,
        tokenBudget: Math.min(settings?.contentContextMaxTokens || 50000, 8000),
        sources,
        queryEmbedding,
      });
      // Per-article chat opt-out (kb.include_in_chat=false) — indexed for
      // other surfaces, excluded here.
      chunks = chunks.filter((c) => !(c.sourceTable === 'kb_articles' && c.metadata.include_in_chat === false));
      // Admin-curated page allowlist, when configured. `['*']` (what every
      // template ships) and `[]` both mean "every page" — see allowsAllPages.
      const slugAllowlist = settings?.includeContentAsContext ? (settings?.includedPageSlugs || []) : [];
      if (!allowsAllPages(slugAllowlist)) {
        chunks = chunks.filter((c) => c.sourceTable !== 'pages' || slugAllowlist.includes(String(c.metadata.slug)));
      }
      // Zero chunks with sources switched ON is NOT "nothing is relevant" — it
      // is "this index cannot answer yet". A brand-new instance has an empty
      // index until the first sweep, a page published a minute ago is not in
      // it, and an instance without an embedding key never fills it. Treating
      // those as "no context" makes the assistant answer from imagination —
      // exactly what happened on www.flowwink.com (2026-08-12), where it
      // invented seven process pages. Fall through to the full-text builder:
      // slower and token-hungrier, but grounded. Degrade, never gate (Law 4).
      if (!chunks.length) throw new EmptyIndexError();
      // Knowledge-gap telemetry: retrieval ran with a real embedding and the
      // best chunk still wasn't semantically close — the index probably cannot
      // answer this question. Logged fire-and-forget for the Daily Briefing's
      // "documentation candidates" section; a telemetry failure must never
      // slow or break the answer. Text-only instances (no embedding key) are
      // skipped — every semantic score is 0 there and would flag everything.
      if (queryEmbedding?.length) {
        const topSemantic = chunks.reduce((m, c) => Math.max(m, c.semanticScore ?? 0), 0);
        if (topSemantic < 0.35) {
          void supabase
            .from('knowledge_gap_log')
            .insert({
              question: retrievalQueryText.slice(0, 500),
              surface: 'public_chat',
              chunk_count: chunks.length,
              top_semantic: topSemantic,
              conversation_id: conversationId ? String(conversationId) : null,
            })
            .then(
              () => {},
              () => {},
            );
        }
      }
      return `\n\n=== WEBSITE CONTENT (retrieved by relevance to the question) ===\n${renderContext(chunks)}`;
    };

    const [{ soul, identity, agents }, knowledgeBase, skillTools, visitorContext] = await Promise.all([
      loadWorkspaceFiles(supabase),
      shouldLoadKB
        ? buildRetrievedKnowledge().catch((e) => {
            console.error(
              e instanceof EmptyIndexError
                ? 'retrieval index has nothing to offer (empty or not built yet) — grounding on full text instead'
                : `retrieval grounding failed — falling back to full-text grounding: ${e}`,
            );
            return buildKnowledgeBase(
              supabase,
              settings?.contentContextMaxTokens || 50000,
              settings?.includeContentAsContext ? (settings?.includedPageSlugs || []) : [],
              settings?.includeKbArticles || false,
            );
          })
        : Promise.resolve(''),
      shouldLoadSkills ? loadSkillTools(supabase, 'external') : Promise.resolve([]),
      visitorIdentifier ? loadVisitorContext(supabase, visitorIdentifier, conversationId) : Promise.resolve(''),
    ]);

    // Build system prompt with knowledge base context
    let chatPrompt = settings?.systemPrompt || 'You are a helpful AI assistant.';

    // One identity, many mouths (#101): the same Business Identity block that
    // grounds every generated campaign, letter and fit analysis grounds the
    // public chat — facts, claim stance and boundaries come from the identity
    // and stay current when it changes, so the instance systemPrompt can be
    // personality alone. Soft-fail: no profile → empty string, chat unchanged.
    //
    // 'core' (explicit, not by default): this is the highest-volume surface in
    // the platform — every message from every anonymous visitor — and it ANSWERS
    // rather than authors. The constitution (who we are, what we sell, to whom,
    // the claim stance and the boundaries) is what a support answer must not
    // contradict; the company's story, testimonials and headcount would be sales
    // material billed on every turn. Content authoring goes through FlowWork,
    // agent-operate or ai-task, which pass 'narrative'.
    const identityBlock = await loadBusinessIdentityBlock(supabase, 'core').catch(() => '');
    if (identityBlock) chatPrompt += identityBlock;

    // Knowledge base restrictions
    if (settings?.allowGeneralKnowledge) {
      chatPrompt += '\n\nYou have access to general knowledge and can answer questions on any topic. When the user asks about the website or its services, prioritize the website content provided below.';
    } else if (shouldLoadKB) {
      chatPrompt += '\n\nIMPORTANT: Only answer questions based on the website content provided below. If the answer is not in the content, politely say you can only help with questions about this website.';
    }

    if (knowledgeBase) chatPrompt += knowledgeBase;
    if (visitorContext) chatPrompt += visitorContext;
    if (customerContext) chatPrompt += customerContext;

    // Rung-3 context dial (§6): company summary + the disambiguation that the
    // personal block above is NOT exhaustive for company matters. Without it the
    // model treats the rung-2 list as the whole truth and never reaches for the
    // company skills (live miss: a company invoice "didn't exist").
    if (companyCtx?.activeCompanyId) {
      const companyContext = await buildCompanyContext(supabase, companyCtx).catch((e) => {
        console.error('company context build failed:', e);
        return '';
      });
      if (companyContext) chatPrompt += companyContext;
    }

    // Sentiment detection
    if (settings?.sentimentDetectionEnabled && settings?.humanHandoffEnabled) {
      chatPrompt += buildSentimentPrompt(settings?.sentimentThreshold || 7);
    }

    // Use prompt compiler — injects soul/identity personality + grounding
    const systemPrompt = buildSystemPrompt({
      mode: 'chat',
      soulPrompt: buildWorkspacePrompt(soul, identity, agents, null, null),
      agents,
      memoryContext: '',
      objectiveContext: '',
      chatSystemPrompt: chatPrompt,
    });

    // Build tools array
    const tools: any[] = [];
    const chatToolNames = new Set<string>();

    // Infrastructure tools — always available when their own flag is on (no FlowPilot dependency)
    if (firecrawlActive) {
      tools.push(CHAT_TOOLS.firecrawl_search);
      chatToolNames.add('firecrawl_search');
    }
    if (handoffActive) {
      tools.push(CHAT_TOOLS.handoff_to_human);
      tools.push(CHAT_TOOLS.create_escalation);
      chatToolNames.add('handoff_to_human');
      chatToolNames.add('create_escalation');
    }
    if (profileSaveActive) {
      tools.push(CHAT_TOOLS.save_visitor_profile);
      chatToolNames.add('save_visitor_profile');
    }

    // FlowPilot action skills — gated on master switch + optional allow-list
    if (shouldLoadSkills) {
      const allow = settings?.allowedSkillNames ?? [];
      let filteredSkillTools = allow.length > 0
        ? (skillTools as any[]).filter((t) => allow.includes(t?.function?.name))
        : (skillTools as any[]);
      // Customer-scoped "my" skills (dial 2, rung 2) are only OFFERED to an
      // authenticated customer. For anon they'd fail the ownership check anyway
      // (no verified email), but hiding them keeps the anon widget honest.
      if (!authedCustomer) {
        filteredSkillTools = filteredSkillTools.filter((t) => !CUSTOMER_SCOPED_SKILLS.has(t?.function?.name));
      }
      // Company-scoped (rung 3) skills are offered ONLY to a contact with an
      // active company membership, and only up to their role: a viewer sees the
      // reads, a buyer also sees request_company_return, an approver also
      // approve_company_quote, an admin also manage_company_contacts. Hidden
      // otherwise (they'd fail the handler _company_id/_company_role check anyway;
      // hiding keeps the surface honest).
      if (!companyCtx?.activeCompanyId) {
        filteredSkillTools = filteredSkillTools.filter((t) => !COMPANY_SCOPED_SKILLS.has(t?.function?.name));
      } else {
        const haveRank = COMPANY_ROLE_RANK[companyCtx.activeRole ?? 'viewer'] ?? 0;
        filteredSkillTools = filteredSkillTools.filter((t) => {
          const need = COMPANY_SKILL_MIN_ROLE[t?.function?.name];
          return need === undefined || haveRank >= COMPANY_ROLE_RANK[need];
        });
      }
      tools.push(...filteredSkillTools);
    }

    // Add tool instructions to system prompt
    let finalSystemPrompt = systemPrompt;
    if (tools.length > 0) {
      const toolNames = tools.map((t: any) => t.function?.name).filter(Boolean);
      let toolInstructions = `\n\nYou have access to the following tools: ${toolNames.join(', ')}.`;
      if (settings?.firecrawlSearchEnabled) {
        toolInstructions += `\nWhen the user asks for current/live information, you MUST use the firecrawl_search tool.`;
      }
      if (skillTools.length > 0) {
        toolInstructions += `\nYou can also perform actions like booking appointments, checking orders, and adding contact information. Use the appropriate tool when requested.`;
      }
      toolInstructions += `\nAlways use tools when they can help answer the user's question.`;
      finalSystemPrompt += toolInstructions;
    }

    // Keyword-based handoff fallback for non-tool-calling providers
    if (settings?.humanHandoffEnabled && !provider.supportsToolCalling) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
      const handoffKeywords = [
        'talk to a person', 'speak to a human', 'real person', 'human agent',
        'talk to human', 'speak to person', 'customer service', 'support agent',
        'prata med människa', 'riktig person', 'mänsklig support',
      ];
      if (handoffKeywords.some(kw => lastUserMessage.includes(kw)) && conversationId) {
        const result = await executeChatTool(
          supabase, supabaseUrl, serviceKey,
          'handoff_to_human', { reason: 'User explicitly requested human support', urgency: 'high' },
          conversationId, customerEmail, customerName,
        );
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: result }, finish_reason: 'stop' }] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
    }

    // N8N: webhook passthrough (no tool loop)
    if (provider.isN8n) {
      const fullMsgs: ChatMessage[] = [{ role: 'system', content: finalSystemPrompt }, ...messages];
      return handleN8nWebhook(provider.n8nConfig!, fullMsgs, conversationId, sessionId, finalSystemPrompt, corsHeaders);
    }

    // ─── Unified OpenAI-compatible tool loop ─────────────────────────────────

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

    let conversationMessages: any[] = [
      { role: 'system', content: finalSystemPrompt },
      ...messages,
    ];


    // ─── Streaming-first tool loop ───────────────────────────────────────────
    // Always streams immediately. Tool calls are detected from the stream,
    // executed transparently, and the final answer is piped to the same
    // output stream — so the client never waits for a full non-streaming round-trip.

    const sseHeaders = { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' };
    const enc = new TextEncoder();

    async function streamIteration(msgs: any[], iteration: number): Promise<Response> {
      const reqBody: any = {
        model: provider.model,
        messages: msgs,
        stream: true,
        stream_options: { include_usage: true },
      };

      if (tools.length > 0 && iteration < MAX_TOOL_ITERATIONS - 1) {
        reqBody.tools = tools;
        reqBody.tool_choice = 'auto';
      }

      // Reasoning models (gpt-5.x) reject function tools on /chat/completions
      // unless reasoning_effort is 'none'. Chat is the real-time surface, so
      // 'none' is what we want here regardless of tools — luna at zero effort
      // is still a smarter chat model than 4.1-mini, without thinking latency.
      if (provider.resolvedProvider === 'openai' && isOpenAiReasoningModel(provider.model)) {
        reqBody.reasoning_effort = 'none';
      }

      const tIter = Date.now();
      const upstream = await fetch(provider.apiUrl, { method: 'POST', headers, body: JSON.stringify(reqBody) });
      if (!upstream.ok) {
        // Capture the provider's error body — a bare http_status can't tell
        // "invalid model name" from "bad param", which is exactly the question
        // when an admin flips the model (found diagnosing gpt-5.6-luna 400s).
        let upstreamError = '';
        try { upstreamError = (await upstream.clone().text()).slice(0, 500); } catch { /* stream may be locked */ }
        scheduleAiUsageLog({
          supabase, source: 'chat-completion', provider: provider.resolvedProvider, model: provider.model,
          promptTokens: 0, completionTokens: 0, totalTokens: 0,
          latencyMs: Date.now() - tIter,
          status: upstream.status === 429 ? 'rate_limited' : 'error',
          conversationId: conversationId || null,
          metadata: { iteration, http_status: upstream.status, has_tools: tools.length > 0, upstream_error: upstreamError },
        });
        return handleAiError(upstream, corsHeaders);
      }

      // Wrap upstream stream so we can sniff the final usage chunk without changing client behaviour.
      // Parse SSE line-by-line and update token counters whenever we see a `usage` object —
      // robust to chunk boundaries and the buffer-trim bug that previously zeroed every log row.
      const sniffStream = (src: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
        const decoder = new TextDecoder();
        let lineBuf = '';
        let pTok = 0, cTok = 0, tTok = 0;
        const ingestLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) return;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          try {
            const obj = JSON.parse(payload);
            const u = obj?.usage;
            if (u && typeof u === 'object') {
              const p = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
              const c = Number(u.completion_tokens ?? u.output_tokens ?? 0);
              const t = Number(u.total_tokens ?? p + c);
              if (p || c || t) { pTok = p; cTok = c; tTok = t; }
            }
          } catch { /* non-JSON keep-alive or partial — ignore */ }
        };
        return new ReadableStream({
          async start(controller) {
            const reader = src.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
                lineBuf += decoder.decode(value, { stream: true });
                let nl: number;
                while ((nl = lineBuf.indexOf('\n')) !== -1) {
                  ingestLine(lineBuf.slice(0, nl));
                  lineBuf = lineBuf.slice(nl + 1);
                }
              }
              if (lineBuf) ingestLine(lineBuf);
            } catch (e) {
              console.error('[chat-completion] stream sniff error:', e);
            } finally {
              controller.close();
              scheduleAiUsageLog({
                supabase, source: 'chat-completion',
                provider: provider.resolvedProvider,
                model: provider.model,
                promptTokens: pTok, completionTokens: cTok, totalTokens: tTok,
                latencyMs: Date.now() - tIter, status: 'success',
                conversationId: conversationId || null,
                metadata: { iteration, has_tools: tools.length > 0 },
              });
            }
          },
        });
      };

      // No tools or last iteration — pipe directly with sniffer
      if (tools.length === 0 || iteration >= MAX_TOOL_ITERATIONS - 1) {
        return new Response(sniffStream(upstream.body!), { headers: sseHeaders });
      }

      // Open an output pipe — client starts receiving immediately
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      // Track token usage from upstream SSE so this branch also logs to ai_usage_logs.
      let pTok = 0, cTok = 0, tTok = 0;
      const captureUsage = (obj: any) => {
        const u = obj?.usage;
        if (u && typeof u === 'object') {
          const p = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
          const c = Number(u.completion_tokens ?? u.output_tokens ?? 0);
          const t = Number(u.total_tokens ?? p + c);
          if (p || c || t) { pTok += p; cTok += c; tTok += t; }
        }
      };
      let usageLogged = false;
      const logOnce = (status: string, extra: Record<string, unknown> = {}) => {
        if (usageLogged) return;
        usageLogged = true;
        scheduleAiUsageLog({
          supabase, source: 'chat-completion',
          provider: provider.resolvedProvider,
          model: provider.model,
          promptTokens: pTok, completionTokens: cTok, totalTokens: tTok,
          latencyMs: Date.now() - tIter, status,
          conversationId: conversationId || null,
          metadata: { iteration, has_tools: tools.length > 0, ...extra },
        });
      };

      // Process stream in background without blocking the Response
      (async () => {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let responseType: 'content' | 'tool_calls' | null = null;
        const tcMap: Record<number, { id: string; name: string; args: string }> = {};

        try {
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buf.indexOf('\n')) !== -1) {
              let line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (line.endsWith('\r')) line = line.slice(0, -1);
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                if (responseType !== 'tool_calls') {
                  await writer.write(enc.encode('data: [DONE]\n\n'));
                }
                await writer.close();
                break outer;
              }

              let parsed: any;
              try { parsed = JSON.parse(data); } catch { continue; }
              captureUsage(parsed);

              const delta = parsed.choices?.[0]?.delta;
              const finishReason = parsed.choices?.[0]?.finish_reason;

              // Detect response type on first meaningful delta
              if (responseType === null) {
                responseType = delta?.tool_calls ? 'tool_calls' : 'content';
              }

              if (responseType === 'content') {
                // Pipe through immediately — real streaming
                await writer.write(enc.encode(`${line}\n\n`));
              } else {
                // Accumulate tool call deltas
                for (const tc of (delta?.tool_calls ?? [])) {
                  const idx: number = tc.index ?? 0;
                  if (!tcMap[idx]) tcMap[idx] = { id: '', name: '', args: '' };
                  if (tc.id) tcMap[idx].id = tc.id;
                  if (tc.function?.name) tcMap[idx].name += tc.function.name;
                  if (tc.function?.arguments) tcMap[idx].args += tc.function.arguments;
                }

                if (finishReason === 'tool_calls') {
                  console.log(`[chat] Tool iteration ${iteration + 1}:`, Object.values(tcMap).map(t => t.name));

                  // Log this iteration's usage before recursing into the next one
                  logOnce('success', { phase: 'tool_calls' });

                  msgs.push({
                    role: 'assistant', content: null,
                    tool_calls: Object.values(tcMap).map(tc => ({
                      id: tc.id, type: 'function',
                      function: { name: tc.name, arguments: tc.args },
                    })),
                  });

                  for (const tc of Object.values(tcMap)) {
                    let fnArgs: any;
                    try { fnArgs = JSON.parse(tc.args || '{}'); } catch { fnArgs = {}; }
                    const result = await executeChatTool(
                      supabase, supabaseUrl, serviceKey,
                      tc.name, fnArgs,
                      conversationId, customerEmail, customerName,
                      authedCustomer?.email,
                      companyCtx?.activeCompanyId, companyCtx?.activeRole,
                    );
                    msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
                  }

                  // Recurse: pipe next iteration into same output stream
                  const nextResp = await streamIteration(msgs, iteration + 1);
                  const nextReader = nextResp.body!.getReader();
                  while (true) {
                    const { done: d, value: v } = await nextReader.read();
                    if (d) break;
                    await writer.write(v);
                  }
                  await writer.close();
                }
              }
            }
          }
          // Stream ended without a tool_calls handoff — log content-path usage
          logOnce('success', { phase: 'content' });
        } catch (e) {
          console.error('[chat] Stream error:', e);
          logOnce('error', { phase: 'stream_error', error: (e as any)?.message || String(e) });
          try { await writer.abort(e); } catch { /* ignore */ }
        }
      })();

      return new Response(readable, { headers: sseHeaders });
    }

    return streamIteration(conversationMessages, 0);

  } catch (err: any) {
    console.error('Chat completion error:', err);
    return new Response(JSON.stringify({ error: err.message || 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// handleAiError moved to ../_shared/ai-providers.ts (now takes corsHeaders param)
