import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  WebinarModuleInput,
  WebinarModuleOutput,
  webinarModuleInputSchema,
  webinarModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const WEBINARS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_webinar',
    description: 'Manage webinars and registrations. Use when: setting up a new webinar; updating webinar details; reviewing registered attendees. NOT for: managing bookings (manage_bookings); creating events (N/A).',
    category: 'communication',
    handler: 'module:webinars',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_webinar',
        description: 'Manage webinars and registrations. Use when: setting up a new webinar; updating webinar details; reviewing registered attendees. NOT for: managing bookings (manage_bookings); creating events (N/A).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'create',
                'update',
                'registrations',
              ],
            },
            webinar_id: {
              type: 'string',
            },
            title: {
              type: 'string',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_webinar
### What
Manages webinars and registrations.
### When to use
- Admin creates or manages webinar events
- Viewing webinar registrations
### Parameters
- **action**: Required. list, create, update, registrations.
- **title**: Webinar title for create.
### Edge cases
- Registrations are linked to leads when email matches.`,
  },
  {
    name: 'register_webinar',
    description: 'Register a visitor for an upcoming webinar. Use when: visitor wants to sign up for a webinar. NOT for: managing webinars (use manage_webinar).',
    category: 'communication',
    handler: 'module:webinars',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'register_webinar',
        parameters: {
          type: 'object',
          required: [
            'action',
          ],
          properties: {
            name: {
              type: 'string',
              description: 'Attendee name',
            },
            email: {
              type: 'string',
              description: 'Attendee email',
            },
            phone: {
              type: 'string',
              description: 'Optional phone',
            },
            action: {
              enum: [
                'list_upcoming',
                'register',
              ],
              type: 'string',
              default: 'list_upcoming',
            },
            webinar_id: {
              type: 'string',
              description: 'Webinar to register for',
            },
          },
        },
        description: 'Register a visitor for an upcoming webinar. Use when: visitor wants to sign up for a webinar. NOT for: managing webinars (use manage_webinar).',
      },
    },
    instructions: `## Webinar Registration
Help visitors register for upcoming webinars. Collect name, email, and optional phone.
Only show upcoming webinars. Confirm registration details.`,
  },
];

export const webinarsModule = defineModule<WebinarModuleInput, WebinarModuleOutput>({
  id: 'webinars',
  name: 'Webinars',
  version: '1.0.0',
  description: 'Plan, promote and follow up webinars and online events',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: webinarModuleInputSchema,
  outputSchema: webinarModuleOutputSchema,

  skills: [
    'manage_webinar',
    'register_webinar',
  ],
  skillSeeds: WEBINARS_SKILLS,

  async publish(input: WebinarModuleInput): Promise<WebinarModuleOutput> {
    try {
      const validated = webinarModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('webinars')
        .insert({
          title: validated.title,
          description: validated.description || null,
          agenda: validated.agenda || null,
          date: validated.date,
          duration_minutes: validated.duration_minutes,
          platform: validated.platform,
          meeting_url: validated.meeting_url || null,
          cover_image: validated.cover_image || null,
          max_attendees: validated.max_attendees || null,
          status: validated.status,
        })
        .select('id, status')
        .single();

      if (error) {
        logger.error('[WebinarsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, status: data.status };
    } catch (error) {
      logger.error('[WebinarsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
