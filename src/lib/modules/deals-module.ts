import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { updateLeadStatus } from '@/lib/lead-utils';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  DealModuleInput,
  DealModuleOutput,
  dealModuleInputSchema,
  dealModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const DEALS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_deal',
    description: 'Manage deals: list, create, update, move stage. Use when: creating a new sales opportunity; updating deal progress; moving a deal to next pipeline stage. NOT for: managing leads (manage_leads); creating CRM tasks (crm_task_create).',
    category: 'crm',
    handler: 'module:deals',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_deal',
        description: 'Manage deals: list, create, update, move stage. Use when: creating a new sales opportunity; updating deal progress; moving a deal to next pipeline stage. NOT for: managing leads (manage_leads); creating CRM tasks (crm_task_create).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'create',
                'update',
                'move_stage',
              ],
            },
            deal_id: {
              type: 'string',
            },
            value_cents: {
              type: 'number',
            },
            stage: {
              type: 'string',
            },
            lead_id: {
              type: 'string',
              description: 'Existing lead UUID. Required for create UNLESS company_id or company_name is supplied (then a lead is auto-created/reused).',
            },
            company_id: {
              type: 'string',
              description: 'Optional: when creating a deal company-centrically, supply company_id (or company_name) and a lead will be auto-created.',
            },
            company_name: {
              type: 'string',
              description: 'Optional: company name to fuzzy-match instead of company_id.',
            },
            product_id: {
              type: 'string',
            },
            expected_close: {
              type: 'string',
              description: 'Date YYYY-MM-DD',
            },
            notes: {
              type: 'string',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_deal
### What
Manages sales deals: list, create, update, move between stages.
### When to use
- Admin asks to create or manage deals
- Moving deals through the pipeline (lead → proposal → negotiation → won/lost)
- After lead qualification suggests a deal
### Parameters
- **action**: Required. list, create, update, move_stage.
- **lead_id**: Required for create.
- **stage**: Deal stage (for create/update/move_stage).
- **value_cents**: Deal value in cents.
### Edge cases
- Moving to 'won' or 'lost' sets closed_at automatically.
- Deals link to leads and optionally to products.`,
  },
  {
    name: 'deal_stale_check',
    description: 'Identifies deals that have stalled and suggests actions. Use when: heartbeat pipeline review, finding stuck deals. NOT for: managing deals directly (use manage_deal).',
    category: 'crm',
    handler: 'module:deals',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'deal_stale_check',
        parameters: {
          type: 'object',
          properties: {
            stale_days: {
              type: 'number',
            },
            stage_filter: {
              type: 'string',
            },
          },
        },
        description: 'Identifies deals that have stalled and suggests actions. Use when: heartbeat pipeline review, finding stuck deals. NOT for: managing deals directly (use manage_deal).',
      },
    },
    instructions: 'Find deals stuck in a stage. Suggest follow-up or re-engagement strategies.',
  },
];

export const dealsModule = defineModule<DealModuleInput, DealModuleOutput>({
  id: 'deals',
  name: 'Deals',
  version: '1.0.0',
  description: 'Create and manage sales deals/opportunities',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: dealModuleInputSchema,
  outputSchema: dealModuleOutputSchema,

  skills: [
    'manage_deal',
    'deal_stale_check',
  ],
  skillSeeds: DEALS_SKILLS,

  webhookEvents: [
    { event: 'deal.created', description: 'A deal was created' },
    { event: 'deal.updated', description: 'A deal was updated' },
    { event: 'deal.stage_changed', description: 'A deal changed stage' },
    { event: 'deal.won', description: 'A deal was won' },
    { event: 'deal.lost', description: 'A deal was lost' },
  ],

  async publish(input: DealModuleInput): Promise<DealModuleOutput> {
    try {
      const validated = dealModuleInputSchema.parse(input);

      const dealData: {
        lead_id: string; value_cents: number; currency: string;
        stage: 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
        product_id: string | null; expected_close: string | null; notes: string | null;
      } = {
        lead_id: validated.lead_id,
        value_cents: validated.value_cents,
        currency: validated.currency,
        stage: validated.stage,
        product_id: validated.product_id || null,
        expected_close: validated.expected_close || null,
        notes: validated.notes || null,
      };

      const { data, error } = await supabase
        .from('deals')
        .insert(dealData)
        .select('id, stage, value_cents')
        .single();

      if (error) {
        logger.error('[DealsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      try {
        await updateLeadStatus(validated.lead_id, 'opportunity', { onlyIfCurrentStatus: 'lead' });
      } catch (updateError) {
        logger.warn('[DealsModule] Lead status update failed:', updateError);
      }

      return { success: true, id: data.id, stage: data.stage, value_cents: data.value_cents };
    } catch (error) {
      logger.error('[DealsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
