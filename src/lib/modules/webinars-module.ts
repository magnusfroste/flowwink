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
    description: 'Register a visitor for an upcoming webinar. Auto-links to existing lead by email or creates a new lead with source=webinar (+15 score). Use when: visitor wants to sign up for a webinar. NOT for: managing webinars (use manage_webinar).',
    category: 'communication',
    handler: 'rpc:register_for_webinar',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'register_webinar',
        description: 'Register a visitor for an upcoming webinar.',
        parameters: {
          type: 'object',
          required: ['p_webinar_id', 'p_name', 'p_email'],
          properties: {
            p_webinar_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_email: { type: 'string', format: 'email' },
            p_phone: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Collect name + email (phone optional). Only published/live webinars accept registrations.',
  },
  // ── Lifecycle skills (SECURITY DEFINER RPCs) ──
  {
    name: 'publish_webinar',
    description: 'Publish a draft webinar so it becomes visible and registrable. Emits webinar.published event.',
    category: 'communication',
    handler: 'rpc:publish_webinar',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'publish_webinar',
        description: 'Publish a draft webinar.',
        parameters: { type: 'object', required: ['p_webinar_id'], properties: { p_webinar_id: { type: 'string', format: 'uuid' } } },
      },
    },
  },
  {
    name: 'start_webinar',
    description: 'Manually flip a webinar to live status. Normally automatic via cron when date passes.',
    category: 'communication',
    handler: 'rpc:start_webinar',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'start_webinar',
        description: 'Mark a webinar as live.',
        parameters: { type: 'object', required: ['p_webinar_id'], properties: { p_webinar_id: { type: 'string', format: 'uuid' } } },
      },
    },
  },
  {
    name: 'complete_webinar',
    description: 'Close a webinar after it has run. Optionally attach the recording URL. Emits webinar.completed event.',
    category: 'communication',
    handler: 'rpc:complete_webinar',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'complete_webinar',
        description: 'Mark a webinar as completed.',
        parameters: {
          type: 'object',
          required: ['p_webinar_id'],
          properties: {
            p_webinar_id: { type: 'string', format: 'uuid' },
            p_recording_url: { type: 'string', format: 'uri' },
          },
        },
      },
    },
  },
  {
    name: 'cancel_webinar',
    description: 'Cancel a webinar. Emits webinar.cancelled event so automations can notify registrants.',
    category: 'communication',
    handler: 'rpc:cancel_webinar',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'cancel_webinar',
        description: 'Cancel a webinar.',
        parameters: {
          type: 'object',
          required: ['p_webinar_id'],
          properties: { p_webinar_id: { type: 'string', format: 'uuid' }, p_reason: { type: 'string' } },
        },
      },
    },
  },
  {
    name: 'mark_webinar_attendance',
    description: 'Flag a registration as attended (or not). Boosts lead score +10 on attended=true. Emits webinar.attended event.',
    category: 'communication',
    handler: 'rpc:mark_webinar_attendance',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'mark_webinar_attendance',
        description: 'Mark webinar attendance.',
        parameters: {
          type: 'object',
          required: ['p_registration_id'],
          properties: {
            p_registration_id: { type: 'string', format: 'uuid' },
            p_attended: { type: 'boolean', default: true },
          },
        },
      },
    },
  },
  {
    name: 'generate_blog_from_webinar',
    description: 'Turn a completed webinar into a blog post draft (title, slug, excerpt, markdown body, tags) and insert it as a draft in blog_posts. Use when: a webinar is completed and we want evergreen content from it. NOT for: editing existing blogs (use manage_blog), publishing live (admin reviews and publishes manually).',
    category: 'content',
    handler: 'edge:ai-task',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_blog_from_webinar',
        description: 'Generate a blog draft from a completed webinar. Inserts blog_posts row as status=draft.',
        parameters: {
          type: 'object',
          required: ['webinar_id'],
          properties: {
            webinar_id: { type: 'string', format: 'uuid' },
            source_text: { type: 'string', description: 'Optional transcript or notes. If omitted, the model writes from the webinar metadata only.' },
          },
        },
      },
    },
    instructions: 'Pre-condition: webinar must be in status=completed (recording_url is helpful but not required). Posts the result as a blog draft for admin review — never auto-publishes. Routed via edge:ai-task with task=generate_blog_from_webinar.',
  },
];

export const webinarsModule = defineModule<WebinarModuleInput, WebinarModuleOutput>({
  id: 'webinars',
  name: 'Webinars',
  version: '1.2.0',
  description: 'Plan, promote, run and follow up webinars — lifecycle, lead-loop, reminders and content-loop',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: webinarModuleInputSchema,
  outputSchema: webinarModuleOutputSchema,

  skills: [
    'manage_webinar',
    'register_webinar',
    'publish_webinar',
    'start_webinar',
    'complete_webinar',
    'cancel_webinar',
    'mark_webinar_attendance',
    'generate_blog_from_webinar',
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
