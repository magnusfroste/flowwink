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

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const TICKETS_SKILLS: SkillSeed[] = [
  {
    name: 'ticket_triage',
    description: 'Auto-categorize incoming tickets, match against KB articles, and propose solutions. Use when: triaging new support requests, automated ticket routing. NOT for: escalating conversations (use escalation_handler).',
    category: 'crm',
    handler: 'ticket_triage',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ticket_triage',
        parameters: {
          type: 'object',
          required: [
            'ticket_id',
          ],
          properties: {
            ticket_id: {
              type: 'string',
              description: 'UUID of the ticket to triage',
            },
            auto_respond: {
              type: 'boolean',
              description: 'Whether to auto-respond if KB match found',
            },
          },
        },
        description: 'Auto-categorize incoming tickets, match against KB articles, and propose solutions. Use when: triaging new support requests, automated ticket routing. NOT for: escalating conversations (use escalation_handler).',
      },
    },
    instructions: `You are triaging a support ticket. Follow these steps:

1. CATEGORIZE: Analyze the ticket subject and description to determine the category (bug, feature, question, billing, other) and priority (low, medium, high, urgent).

2. KB MATCH: Search the Knowledge Base for articles that match the ticket content.

3. AUTO-RESPOND: If a KB article provides a clear answer, draft a response and add it as a ticket comment. Set status to waiting.

4. ESCALATE: If no KB match or the issue is complex, set status to open and leave for human agent.

5. UPDATE: Always update the ticket with your determined category and priority.

Rules:
- Never auto-close tickets
- Always be empathetic and professional
- For billing issues, always escalate to human`,
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

  skills: [
    'ticket_triage',
  ],
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
