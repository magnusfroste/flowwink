/**
 * Contracts Module — Unified Definition
 *
 * SCOPE NOTE (2026-04-20): Currently a "legal contract archive" — agreements with
 * counterparties, status flow, renewal alerts, linked documents (via documents
 * module + related_entity_type='contract').
 *
 * FUTURE SCOPE (planned, not implemented):
 *   - Recurring/subscription contracts that auto-generate invoices (Odoo-style sale.subscription)
 *   - MRR/ARR tracking + churn signals
 *   - "Convert quote → contract" flow when a deal closes
 *   - E-signature integration (DocuSign / Scrive)
 *
 * Documents are linked via the documents table:
 *   related_entity_type='contract', related_entity_id=<contract.id>
 * Use the `list_contract_documents` skill from MCP to enumerate them.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const contractsInputSchema = z.object({
  action: z.enum(['create', 'update', 'list', 'get']),
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  counterparty_name: z.string().optional(),
  counterparty_email: z.string().email().optional(),
  contract_type: z.enum(['service', 'nda', 'employment', 'lease', 'other']).optional(),
  status: z.enum(['draft', 'pending_signature', 'active', 'expired', 'terminated']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  value_cents: z.number().int().optional(),
  notes: z.string().optional(),
});

const contractsOutputSchema = z.object({
  success: z.boolean(),
  contract_id: z.string().optional(),
  message: z.string().optional(),
});

type ContractsInput = z.infer<typeof contractsInputSchema>;
type ContractsOutput = z.infer<typeof contractsOutputSchema>;

const CONTRACT_SKILLS: SkillSeed[] = [
  {
    name: 'manage_contract',
    description: 'Create, list, update, or search contracts. Use when: admin wants to create an agreement, find a contract by counterparty, change status, or update terms. NOT for: invoicing (use manage_invoice), project management (use manage_projects).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_contract',
        description: 'CRUD for contracts and agreements. NOTE: action=create REQUIRES counterparty_name (NOT NULL in DB).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'search'] },
            contract_id: { type: 'string', description: 'Required for action=update' },
            title: { type: 'string', description: 'Optional — defaults to "Contract — {counterparty_name}"' },
            contract_type: { type: 'string', enum: ['service', 'nda', 'employment', 'lease', 'other'] },
            status: { type: 'string', enum: ['draft', 'pending_signature', 'active', 'expired', 'terminated'] },
            counterparty_name: { type: 'string', description: 'REQUIRED for action=create — name of the other party (person or company). NOT NULL in DB.' },
            counterparty_email: { type: 'string' },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            end_date: { type: 'string', description: 'YYYY-MM-DD' },
            renewal_type: { type: 'string', enum: ['none', 'auto', 'manual'] },
            renewal_notice_days: { type: 'number' },
            value_cents: { type: 'number' },
            currency: { type: 'string', description: 'ISO 4217, defaults to SEK' },
            notes: { type: 'string' },
            search_query: { type: 'string', description: 'Free-text search in title/counterparty' },
          },
          required: ['action'],
          allOf: [
            {
              if: { properties: { action: { const: 'create' } } },
              then: { required: ['action', 'counterparty_name'] },
            },
          ],
        },
      },
    },
    instructions: 'Contracts track agreements with external parties. Status flow: draft → pending_signature → active → expired/terminated. When creating, default currency to SEK. For search, match against title and counterparty_name. Swedish: "avtal", "kontrakt", "NDA", "tjänsteavtal".',
  },
  {
    name: 'contract_renewal_check',
    description: 'Check for contracts expiring soon and alert. Use when: autonomous heartbeat checks for renewal deadlines, or admin asks "vilka avtal går ut snart?". NOT for: creating contracts (use manage_contract).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'contract_renewal_check',
        description: 'Find contracts expiring within a given number of days',
        parameters: {
          type: 'object',
          properties: {
            days_ahead: { type: 'number', description: 'Days to look ahead (default 30)' },
            include_auto_renew: { type: 'boolean', description: 'Include auto-renewing contracts' },
          },
        },
      },
    },
    instructions: 'Query active contracts where end_date is within the specified window. Group by urgency: critical (<7 days), warning (<30 days), notice (<90 days). For auto-renew contracts, check if renewal_notice_days has passed. Swedish: "förnyelse", "utgående avtal", "uppsägningstid".',
  },
  {
    name: 'get_contract_content',
    description: 'Fetch the full markdown body of a contract for LLM consumption. Use when: external operator (ClawWink) or agent needs to read, summarize, or analyze the actual agreement text — not just metadata. Returns title, counterparty, status, value and the entire body_markdown. NOT for: listing contracts (use manage_contract action=list) or attached PDFs (use list_contract_documents).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_contract_content',
        description: 'Return contract metadata + full markdown body — LLM-friendly, no parsing required.',
        parameters: {
          type: 'object',
          properties: {
            contract_id: { type: 'string', description: 'UUID of the contract' },
          },
          required: ['contract_id'],
        },
      },
    },
    instructions: 'Query public.contracts by id. Return id, title, counterparty_name, counterparty_email, status, contract_type, value_cents, currency, start_date, end_date, signed_at, version and body_markdown. The body_markdown field is the source of truth for the agreement text — pass it directly to the LLM context, do not summarize unless asked.',
  },
  {
    name: 'search_contracts',
    description: 'Free-text search across contracts (title, counterparty, body content). Use when: admin or operator asks "hitta avtalet med X", "vilka avtal nämner Y-klausulen?", "sök NDA med ACME". Uses pg_trgm for fuzzy matching. NOT for: filtering by status only (use manage_contract action=list with status).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_contracts',
        description: 'Trigram + ILIKE search across title, counterparty_name and body_markdown. Returns matching contracts with score.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search terms — fuzzy matching on title, counterparty and body content' },
            limit: { type: 'number', description: 'Max results (default 10)' },
            status: { type: 'string', enum: ['draft', 'pending_signature', 'active', 'expired', 'terminated'], description: 'Optional status filter' },
          },
          required: ['query'],
        },
      },
    },
    instructions: 'Use pg_trgm similarity + ILIKE on title, counterparty_name and body_markdown. Sort by similarity DESC. Return id, title, counterparty_name, status, snippet (first 200 chars of matching body section). For exact clause lookup, fall back to ILIKE on body_markdown.',
  },
  {
    name: 'send_contract_for_signature',
    description: 'Generate a public signing link for a contract and mark it as pending_signature. Use when: admin or operator wants to send a finished contract to the counterparty for signing. Snapshots the current version, returns a /contract/:token URL the counterparty can visit to accept/reject without logging in. NOT for: creating contracts (use manage_contract) or signing on behalf of someone (signing must be done by the actual signer).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_contract_for_signature',
        description: 'Issue a public signing token + URL for a contract that has body_markdown filled in.',
        parameters: {
          type: 'object',
          properties: {
            contract_id: { type: 'string', description: 'UUID of the contract' },
          },
          required: ['contract_id'],
        },
      },
    },
    instructions: 'Verify contract.body_markdown is non-empty (refuse if blank — "write the agreement first"). Snapshot to contract_versions, generate accept_token if missing, set status=pending_signature, sent_at=now(). Return { url, token, version }. The URL pattern is {site_origin}/contract/{token}.',
  },
  {
    name: 'list_contract_documents',
    description: 'List all documents linked to a specific contract. Use when: admin or agent asks "vilka dokument finns på avtal X?", or wants to verify that a signed PDF is attached. NOT for: uploading new documents (use manage_document with related_entity_type=contract).',
    category: 'commerce',
    handler: 'db:contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_contract_documents',
        description: 'Return documents from the central archive that are linked to a contract via related_entity_type=contract.',
        parameters: {
          type: 'object',
          properties: {
            contract_id: { type: 'string', description: 'UUID of the contract' },
          },
          required: ['contract_id'],
        },
      },
    },
    instructions: 'Query public.documents WHERE related_entity_type=\'contract\' AND related_entity_id=<contract_id>. Return id, title, file_name, category, created_at. Files themselves live in the private "documents" storage bucket — generate a signed URL only on explicit request.',
  },
];

const CONTRACT_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Contract Renewal Alert',
    description: 'Every weekday at 08:00, FlowPilot checks for contracts expiring within 30 days and alerts the admin.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 8 * * 1-5', expression: '0 8 * * 1-5' },
    skill_name: 'contract_renewal_check',
    skill_arguments: { days_ahead: 30 },
  },
];

export const contractsModule = defineModule<ContractsInput, ContractsOutput>({
  id: 'contracts',
  name: 'Contracts',
  version: '1.0.0',
  description: 'Contract lifecycle management with renewal tracking and document storage',
  capabilities: ['data:write', 'data:read'],
  inputSchema: contractsInputSchema,
  outputSchema: contractsOutputSchema,

  skills: ['manage_contract', 'contract_renewal_check', 'get_contract_content', 'search_contracts', 'send_contract_for_signature', 'list_contract_documents'],
  skillSeeds: CONTRACT_SKILLS,
  automations: CONTRACT_AUTOMATIONS,

  async publish(input: ContractsInput): Promise<ContractsOutput> {
    const validated = contractsInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.counterparty_name) return { success: false, message: 'counterparty_name is required' };
      const { data, error } = await supabase
        .from('contracts')
        .insert({
          title: validated.title || `Contract — ${validated.counterparty_name}`,
          counterparty_name: validated.counterparty_name!,
          counterparty_email: validated.counterparty_email,
          contract_type: validated.contract_type || 'other',
          status: validated.status || 'draft',
          start_date: validated.start_date, end_date: validated.end_date,
          value_cents: validated.value_cents, notes: validated.notes,
        })
        .select('id')
        .single();
      if (error) { logger.error('[contracts] create failed', error); return { success: false, message: error.message }; }
      return { success: true, contract_id: data.id, message: 'Contract created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase.from('contracts').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Found ${data.length} contracts` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
