import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  composioActionInputSchema,
  composioActionOutputSchema,
  type ComposioActionInput,
  type ComposioActionOutput,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const COMPOSIO_SKILLS: SkillSeed[] = [
  {
    name: 'composio_execute',
    description: 'Execute an action in a connected external app via Composio. Use when: you have found the right tool via composio_search_tools and want to run it. NOT for: searching tools (use composio_search_tools first). Requires a specific action_name from search results.',
    category: 'system',
    handler: 'edge:composio-proxy',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'composio_execute',
        parameters: {
          type: 'object',
          required: [
            'action_name',
          ],
          properties: {
            input: {
              type: 'object',
              description: 'Input parameters for the action',
            },
            entity_id: {
              type: 'string',
              description: 'Optional: Composio entity ID (defaults to default)',
            },
            action_name: {
              type: 'string',
              description: 'The Composio action identifier from search results (e.g. GMAIL_SEND_EMAIL)',
            },
          },
        },
        description: 'Execute an action in a connected external app via Composio. Use when: you have found the right tool via composio_search_tools and want to run it. NOT for: searching tools (use composio_search_tools first). Requires a specific action_name from search results.',
      },
    },
    instructions: 'Execute a Composio action. You must first use composio_search_tools to find the action_name. Pass the action_name and input parameters. The entity_id maps to the user/lead context.',
  },
  {
    name: 'composio_gmail_read',
    description: 'Read recent emails from Gmail via Composio. Use when: FlowPilot needs context about recent communication with a lead/customer, or needs to check for replies. NOT for: processing high-volume inboxes.',
    category: 'communication',
    handler: 'edge:composio-proxy',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'composio_gmail_read',
        parameters: {
          type: 'object',
          required: [],
          properties: {
            query: {
              type: 'string',
              description: 'Gmail search query (e.g. from:user@example.com or subject:proposal)',
            },
            max_results: {
              type: 'integer',
              default: 5,
              description: 'Max emails to return (default 5)',
            },
          },
        },
        description: 'Read recent emails from Gmail via Composio. Use when: FlowPilot needs context about recent communication with a lead/customer, or needs to check for replies. NOT for: processing high-volume inboxes.',
      },
    },
    instructions: `Read emails from the connected Gmail account via Composio OAuth. Use the 'query' parameter with standard Gmail search syntax (e.g. "from:user@example.com", "subject:proposal", "is:unread"). Returns subject, sender, date, and snippet for each match. Requires an active Composio Gmail connection. If no query is provided, returns the most recent emails.`,
  },
  {
    name: 'composio_gmail_send',
    description: 'Send an email via Gmail through Composio. Use when: FlowPilot needs to send a follow-up, confirmation, or outreach email to a lead/customer. NOT for: bulk newsletters (use Resend/newsletter module instead).',
    category: 'communication',
    handler: 'edge:composio-proxy',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'composio_gmail_send',
        parameters: {
          type: 'object',
          required: [
            'to',
            'subject',
            'body',
          ],
          properties: {
            cc: {
              type: 'string',
              description: 'CC recipients (comma-separated)',
            },
            to: {
              type: 'string',
              description: 'Recipient email address',
            },
            bcc: {
              type: 'string',
              description: 'BCC recipients (comma-separated)',
            },
            body: {
              type: 'string',
              description: 'Email body (plain text or HTML)',
            },
            subject: {
              type: 'string',
              description: 'Email subject line',
            },
          },
        },
        description: 'Send an email via Gmail through Composio. Use when: FlowPilot needs to send a follow-up, confirmation, or outreach email to a lead/customer. NOT for: bulk newsletters (use Resend/newsletter module instead).',
      },
    },
    instructions: "Send an email from the connected Gmail account via Composio OAuth. Requires 'to' (recipient), 'subject', and 'body' (plain text or HTML). Optional: 'cc' and 'bcc' for additional recipients. Use for individual follow-ups, confirmations, or outreach — NOT for bulk sends or newsletters (use the newsletter module instead). Requires an active Composio Gmail connection.",
  },
  {
    name: 'composio_search_tools',
    description: 'Search for available tools and actions across 1000+ connected apps using intent-based discovery. Use when: user wants to perform an action in an external app (Gmail, Slack, HubSpot, Sheets, etc.) and you need to find the right tool. NOT for: internal FlowWink operations.',
    category: 'system',
    handler: 'edge:composio-proxy',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'composio_search_tools',
        parameters: {
          type: 'object',
          required: [
            'intent',
          ],
          properties: {
            app: {
              type: 'string',
              description: 'Optional: filter by specific app name (e.g. gmail, slack, hubspot)',
            },
            intent: {
              type: 'string',
              description: 'Natural language description of what you want to do',
            },
          },
        },
        description: 'Search for available tools and actions across 1000+ connected apps using intent-based discovery. Use when: user wants to perform an action in an external app (Gmail, Slack, HubSpot, Sheets, etc.) and you need to find the right tool. NOT for: internal FlowWink operations.',
      },
    },
    instructions: 'Search Composio for available tools matching an intent. Pass a natural language description of what you want to do. Returns matching actions with their parameters. Always search before executing.',
  },
];

export const composioModule = defineModule<ComposioActionInput, ComposioActionOutput>({
  id: 'composio',
  name: 'Composio',
  version: '1.0.0',
  description: 'Connect to 1000+ external apps via managed OAuth and intent-based tool resolution',
  capabilities: ['data:read', 'data:write', 'webhook:trigger'],
  inputSchema: composioActionInputSchema,
  outputSchema: composioActionOutputSchema,

  skills: [
    'composio_execute',
    'composio_search_tools',
    'composio_gmail_read',
    'composio_gmail_send',
  ],
  skillSeeds: COMPOSIO_SKILLS,

  async publish(input: ComposioActionInput): Promise<ComposioActionOutput> {
    try {
      const validated = composioActionInputSchema.parse(input);

      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: validated,
      });

      if (error) throw error;

      logger.log(`[ComposioModule] Action executed: ${validated.action}`);

      return {
        success: true,
        action: validated.action,
        result: data?.result ?? null,
      };
    } catch (err) {
      logger.error('[ComposioModule] Failed:', err);
      return {
        success: false,
        action: input.action,
        result: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
});
