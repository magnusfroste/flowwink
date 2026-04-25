import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { renderToHtml } from '@/lib/tiptap-utils';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  NewsletterModuleInput,
  NewsletterModuleOutput,
  newsletterModuleInputSchema,
  newsletterModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const NEWSLETTER_SKILLS: SkillSeed[] = [
  {
    name: 'send_newsletter',
    description: 'Create a newsletter draft. Use when: starting a new email campaign; composing content for an upcoming newsletter; setting up subscriber update structure. NOT for: sending the newsletter (execute_newsletter_send); managing existing newsletters (manage_newsletters).',
    category: 'communication',
    handler: 'module:newsletter',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_newsletter',
        description: 'Create a newsletter draft. Use when: starting a new email campaign; composing content for an upcoming newsletter; setting up subscriber update structure. NOT for: sending the newsletter (execute_newsletter_send); managing existing newsletters (manage_newsletters).',
        parameters: {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'Newsletter subject line',
            },
            content: {
              type: 'string',
              description: 'HTML content',
            },
            schedule_at: {
              type: 'string',
              description: 'ISO datetime to schedule (optional)',
            },
          },
          required: [
            'subject',
            'content',
          ],
        },
      },
    },
    instructions: `## send_newsletter
### What
Creates a newsletter draft (does NOT send immediately). Requires approval.
### When to use
- User asks to create/draft a newsletter
- Part of content pipeline: research → write → newsletter
- NOT for sending — use execute_newsletter_send after approval
### Parameters
- **subject**: Required. Newsletter subject line.
- **content**: Required. HTML content for the newsletter body.
- **schedule_at**: Optional ISO datetime. If set, newsletter is scheduled for future send.
### Edge cases
- Always creates as draft. Sending requires execute_newsletter_send (separate approval gate).
- HTML must be well-formed for email rendering.
- Check subscriber count with manage_newsletter_subscribers before drafting.`,
  },
  {
    name: 'execute_newsletter_send',
    description: 'Actually send a prepared newsletter to all confirmed subscribers via email. Use when: newsletter is approved and ready to send; executing a scheduled send; distributing content to subscriber list. NOT for: creating newsletters (manage_newsletters); managing subscribers (manage_newsletter_subscribers).',
    category: 'communication',
    handler: 'edge:newsletter-send',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'execute_newsletter_send',
        description: 'Actually send a prepared newsletter to all confirmed subscribers via email. Use when: newsletter is approved and ready to send; executing a scheduled send; distributing content to subscriber list. NOT for: creating newsletters (manage_newsletters); managing subscribers (manage_newsletter_subscribers).',
        parameters: {
          type: 'object',
          properties: {
            newsletter_id: {
              type: 'string',
              description: 'Newsletter UUID to send',
            },
          },
          required: [
            'newsletter_id',
          ],
        },
      },
    },
    instructions: `## execute_newsletter_send
### What
Actually sends a prepared newsletter to all confirmed subscribers via email. Requires approval.
### When to use
- After a newsletter has been created and reviewed via manage_newsletters
- NEVER call without explicit admin approval
- Final step in newsletter workflow
### Parameters
- **newsletter_id**: Required. UUID of the newsletter to send.
### Edge cases
- DESTRUCTIVE: Cannot unsend once sent. Always confirm with admin.
- Only sends to confirmed subscribers.
- Check subscriber count before sending to set expectations.`,
  },
  {
    name: 'manage_newsletter_subscribers',
    description: 'Manage newsletter subscribers: list, search, count, remove. Use when: reviewing subscriber list; finding a specific subscriber; removing unsubscribed users. NOT for: sending newsletters (execute_newsletter_send); creating newsletter content (manage_newsletters).',
    category: 'communication',
    handler: 'module:newsletter',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_newsletter_subscribers',
        description: 'Manage newsletter subscribers: list, search, count, remove. Use when: reviewing subscriber list; finding a specific subscriber; removing unsubscribed users. NOT for: sending newsletters (execute_newsletter_send); creating newsletter content (manage_newsletters).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'search',
                'count',
                'remove',
              ],
            },
            search: {
              type: 'string',
            },
            status: {
              type: 'string',
            },
            email: {
              type: 'string',
            },
            limit: {
              type: 'number',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_newsletter_subscribers
### What
Manages newsletter subscribers: list, search, count, remove.
### When to use
- Admin asks about subscriber count or list
- Before sending newsletters (verify audience)
- Unsubscribe requests
### Parameters
- **action**: Required. list, search, count, remove.
- **search**: Text search across email/name.
- **email**: Specific email for remove.
### Edge cases
- Remove is permanent. No undo.
- Count is useful before newsletter sends to set expectations.`,
  },
  {
    name: 'manage_newsletters',
    description: 'Manage newsletters: list, get, create, update, delete. Full CRUD on newsletter drafts and scheduled sends. Use when: creating a new newsletter campaign; editing planned newsletter content; deleting an outdated newsletter. NOT for: sending a newsletter (execute_newsletter_send); managing subscribers (manage_newsletter_subscribers).',
    category: 'content',
    handler: 'module:newsletter',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_newsletters',
        description: 'Manage newsletters: list, get, create, update, delete. Full CRUD on newsletter drafts and scheduled sends. Use when: creating a new newsletter campaign; editing planned newsletter content; deleting an outdated newsletter. NOT for: sending a newsletter (execute_newsletter_send); managing subscribers (manage_newsletter_subscribers).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'create',
                'update',
                'delete',
              ],
            },
            newsletter_id: {
              type: 'string',
              description: 'Newsletter UUID (for get/update/delete)',
            },
            subject: {
              type: 'string',
              description: 'Newsletter subject line',
            },
            content_html: {
              type: 'string',
              description: 'HTML content (optional if topic or blog_content provided)',
            },
            topic: {
              type: 'string',
              description: 'Topic for AI-generated content. Use instead of content_html to auto-generate.',
            },
            blog_content: {
              type: 'string',
              description: 'Blog post text to adapt into newsletter format. Use for blog→newsletter chains.',
            },
            tone: {
              type: 'string',
              description: 'Writing tone (default: professional)',
            },
            language: {
              type: 'string',
              description: 'Content language code (default: en)',
            },
            status: {
              type: 'string',
              description: 'Filter by status (for list) or set status (for update)',
            },
            schedule_at: {
              type: 'string',
              description: 'ISO date to schedule send',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20)',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `# manage_newsletters

## What
Full CRUD management of newsletters with optional AI content generation.

## When
- User asks to create, edit, list, or delete newsletters
- As part of a content campaign chain (research → blog → newsletter → social)
- When FlowPilot autonomously creates newsletter drafts from content

## AI Generation (create action)
Three modes for creating newsletters:
1. **From topic**: Pass \`topic\` — AI generates full newsletter HTML automatically
2. **From blog**: Pass \`blog_content\` — AI adapts the blog text into email format
3. **Manual**: Pass \`content_html\` directly (bypasses AI)

Priority: content_html > blog_content > topic

## Actions
| Action | Required fields | Result |
|--------|----------------|--------|
| list   | (optional: status, limit) | Array of newsletters with metrics |
| get    | newsletter_id  | Full newsletter with content |
| create | subject + (topic OR blog_content OR content_html) | New draft newsletter |
| update | newsletter_id + fields | Updated newsletter |
| delete | newsletter_id  | Deleted newsletter |

## Chaining Example
\`\`\`
write_blog_post(topic="AI trends") → get excerpt → manage_newsletters(action=create, subject="This Week: AI Trends", blog_content=excerpt)
\`\`\`

## Edge Cases
- Always create as 'draft' unless schedule_at is provided
- Use execute_newsletter_send to actually send (separate skill with approval gate)
- AI generation requires GEMINI_API_KEY or OPENAI_API_KEY`,
  },
  {
    name: 'lead_nurture_sequence',
    description: 'Create automated email nurture sequences for new leads. Use when: setting up drip campaigns, automating lead follow-up emails. NOT for: sending single emails (use send_email), managing leads (use manage_leads).',
    category: 'crm',
    handler: 'module:newsletter',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'lead_nurture_sequence',
        parameters: {
          type: 'object',
          required: [
            'lead_id',
            'sequence_type',
          ],
          properties: {
            lead_id: {
              type: 'string',
              description: 'Lead UUID',
            },
            email_count: {
              type: 'number',
              description: 'Number of emails',
            },
            sequence_type: {
              enum: [
                'welcome',
                're-engage',
                'upsell',
              ],
              type: 'string',
              description: 'Sequence type',
            },
          },
        },
        description: 'Create automated email nurture sequences for new leads. Use when: setting up drip campaigns, automating lead follow-up emails. NOT for: sending single emails (use send_email), managing leads (use manage_leads).',
      },
    },
    instructions: 'Welcome: 3 emails over 7 days (intro, value prop, CTA). Re-engage: 2 emails. Upsell: 2 emails. Use company context from sales intelligence. Personalize with lead name.',
  },
  {
    name: 'newsletter_subscribe',
    description: 'Subscribe a visitor to the newsletter. Use when: visitor wants to sign up for emails, newsletter opt-in. NOT for: managing subscribers (use manage_newsletter_subscribers), sending newsletters (use execute_newsletter_send).',
    category: 'communication',
    handler: 'edge:newsletter-subscribe',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'newsletter_subscribe',
        parameters: {
          type: 'object',
          required: [
            'email',
          ],
          properties: {
            name: {
              type: 'string',
              description: 'Optional subscriber name',
            },
            email: {
              type: 'string',
              description: 'Email address to subscribe',
            },
          },
        },
        description: 'Subscribe a visitor to the newsletter. Use when: visitor wants to sign up for emails, newsletter opt-in. NOT for: managing subscribers (use manage_newsletter_subscribers), sending newsletters (use execute_newsletter_send).',
      },
    },
    instructions: `## Newsletter Subscribe
When a visitor wants to subscribe to the newsletter, collect their email and optionally name.
Confirm the subscription was successful.`,
  },
];

export const newsletterModule = defineModule<NewsletterModuleInput, NewsletterModuleOutput>({
  id: 'newsletter',
  name: 'Newsletter',
  version: '1.0.0',
  description: 'Create newsletter drafts for sending',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: newsletterModuleInputSchema,
  outputSchema: newsletterModuleOutputSchema,

  skills: [
    'send_newsletter',
    'manage_newsletters',
    'execute_newsletter_send',
    'manage_newsletter_subscribers',
    'newsletter_subscribe',
  ],
  skillSeeds: NEWSLETTER_SKILLS,

  webhookEvents: [
    { event: 'newsletter.subscribed', description: 'A new subscriber joined' },
    { event: 'newsletter.unsubscribed', description: 'A subscriber left' },
  ],

  async publish(input: NewsletterModuleInput): Promise<NewsletterModuleOutput> {
    try {
      const validated = newsletterModuleInputSchema.parse(input);

      let contentHtml: string | null = null;
      let contentJson: Json | null = null;

      if (validated.content_html) {
        contentHtml = validated.content_html;
      } else if (validated.content_tiptap) {
        contentHtml = renderToHtml(validated.content_tiptap);
        contentJson = validated.content_tiptap as Json;
      } else if (validated.content_json) {
        contentJson = validated.content_json as Json;
      }

      const status = validated.options?.status || 'draft';
      const { data, error } = await supabase
        .from('newsletters')
        .insert({
          subject: validated.subject,
          content_html: contentHtml,
          content_json: contentJson,
          status,
          scheduled_at: validated.options?.send_at || null,
        })
        .select('id, status')
        .single();

      if (error) {
        logger.error('[NewsletterModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, status: data.status };
    } catch (error) {
      logger.error('[NewsletterModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
