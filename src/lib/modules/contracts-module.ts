/**
 * Contracts Module — Unified Definition
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

  skills: ['manage_contract', 'contract_renewal_check'],
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
