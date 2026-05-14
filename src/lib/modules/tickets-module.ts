import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const ticketModuleInputSchema = z.object({
  subject: z.string().min(1).max(300),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  category: z.enum(['bug', 'feature', 'question', 'billing', 'other']).default('other'),
  contact_email: z.string().email().optional(),
  contact_name: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  source: z.string().default('manual'),
});

const ticketModuleOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  error: z.string().optional(),
});

type TicketModuleInput = z.infer<typeof ticketModuleInputSchema>;
type TicketModuleOutput = z.infer<typeof ticketModuleOutputSchema>;

// ── Bundled skill definitions ──
const TICKETS_SKILLS: SkillSeed[] = [
  {
    name: 'ticket_triage',
    description:
      'Auto-classify a helpdesk ticket: set priority + category, attach up to 3 relevant KB article suggestions, write a 1-sentence internal summary. Use when: a new ticket needs triage, an existing ticket changed and needs re-classification, or a human asks "what is this ticket about?". NOT for: drafting a customer-facing reply (that is a separate ai-task), or bulk re-triaging the queue (loop calls per ticket).',
    category: 'crm',
    handler: 'ai-task:ticket_triage',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ticket_triage',
        description:
          'Triage a single ticket. Loads the ticket + a small KB index, then writes back priority, category and suggested_kb_article_ids on the tickets row.',
        parameters: {
          type: 'object',
          properties: {
            ticket_id: { type: 'string', description: 'UUID of the ticket to triage' },
          },
          required: ['ticket_id'],
          additionalProperties: false,
        },
      },
    },
  },
];

export const ticketsModule = defineModule<TicketModuleInput, TicketModuleOutput>({
  id: 'tickets',
  name: 'Tickets',
  version: '1.0.0',
  description: 'Helpdesk ticket management with Kanban pipeline',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: ticketModuleInputSchema,
  outputSchema: ticketModuleOutputSchema,

  skills: ['suggest_kb_for_ticket'],
  skillSeeds: TICKETS_SKILLS,

  async publish(input: TicketModuleInput): Promise<TicketModuleOutput> {
    try {
      const validated = ticketModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('tickets')
        .insert([{
          subject: validated.subject,
          description: validated.description || null,
          priority: validated.priority,
          category: validated.category,
          contact_email: validated.contact_email || null,
          contact_name: validated.contact_name || null,
          lead_id: validated.lead_id || null,
          company_id: validated.company_id || null,
          source: validated.source,
        }])
        .select('id')
        .single();

      if (error) {
        logger.error('[TicketsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id };
    } catch (error) {
      logger.error('[TicketsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
