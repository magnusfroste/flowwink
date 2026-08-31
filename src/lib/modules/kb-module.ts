import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { generateSlug, isTiptapDocument } from './helpers';
import {
  KBArticleModuleInput,
  KBArticleModuleOutput,
  kbArticleModuleInputSchema,
  kbArticleModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const KB_SKILLS: SkillSeed[] = [
  {
    name: 'search_kb',
    description: 'Search the knowledge base across title, question and answer text — the same reach as the public KB search box, server-side. Returns published articles ranked featured-first then by views. Use when: answering a visitor/customer question from the KB; checking whether an article already covers a topic before writing a new one. NOT for: creating/updating articles (manage_kb_article).',
    category: 'content',
    handler: 'module:kb',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_kb',
        description: 'Search KB articles by text across title/question/answer. Published-only by default.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['search'], description: 'Always "search"' },
            query: { type: 'string', description: 'Search text' },
            include_unpublished: { type: 'boolean', description: 'Admins only: include drafts (default false)' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
          required: ['action', 'query'],
        },
      },
    },
    instructions: 'Call with action="search" and query. Matches title, question and answer (case-insensitive substring), published articles only unless include_unpublished. Results are ranked featured-first, then by views_count. Use manage_kb_article action=get with the returned slug to fetch full content.',
  },
  {
    name: 'manage_kb_article',
    description: 'Manage knowledge base articles: list, get, create, update, publish, unpublish. Every article has an audience: visibility="public" (visitors and the site chat) or "internal" (staff only — support playbooks, objection handling, escalation routines, anything written in the team\'s own voice rather than the customer\'s). ALWAYS pass visibility="internal" when the text says "we/our" about the business, names customers to target, or would embarrass if a prospect read it; the default is public. create saves a DRAFT unless you pass publish:true — drafts are NOT indexed and invisible to visitors and the chat, so never report an article as published unless the response says is_published:true. Articles ride the language rail: locale is the language a row is written in (stamped with the site\'s default when omitted), and translation_of on create makes a new language version of an existing article — one row per language per translation group, exactly like pages. Use when: creating a new support article; updating an existing KB entry; adding a language version of an existing article; moving an article between audiences. NOT for: analyzing KB gaps (kb_gap_analysis); managing blog posts (manage_blog_posts); translating pages (manage_page_translation).',
    category: 'content',
    handler: 'module:kb',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_kb_article',
        description: 'Manage knowledge base articles: list, get, create, update, publish, unpublish. Every article has an audience: visibility="public" (visitors and the site chat) or "internal" (staff only — support playbooks, objection handling, escalation routines, anything written in the team\'s own voice rather than the customer\'s). ALWAYS pass visibility="internal" when the text says "we/our" about the business, names customers to target, or would embarrass if a prospect read it; the default is public. create saves a DRAFT unless you pass publish:true — drafts are NOT indexed and invisible to visitors and the chat, so never report an article as published unless the response says is_published:true. Articles ride the language rail: locale is the language a row is written in (stamped with the site\'s default when omitted), and translation_of on create makes a new language version of an existing article — one row per language per translation group, exactly like pages. Use when: creating a new support article; updating an existing KB entry; adding a language version of an existing article; moving an article between audiences. NOT for: analyzing KB gaps (kb_gap_analysis); managing blog posts (manage_blog_posts); translating pages (manage_page_translation).',
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
                'publish',
                'unpublish',
              ],
            },
            article_id: {
              type: 'string',
              description: 'Article UUID. For get/update/publish/unpublish, slug or title work just as well — all three are resolved.',
            },
            slug: {
              type: 'string',
              description: 'Article slug. Identifies an existing article for get/update/publish/unpublish; names the NEW article on create.',
            },
            title: {
              type: 'string',
              description: 'Display title. On create it names the article; on get/update/publish/unpublish it also IDENTIFIES one (exact match, then unique prefix) — an ambiguous title errors rather than guessing.',
            },
            question: {
              type: 'string',
            },
            answer: {
              type: 'string',
              description: 'REQUIRED for create and for any update that changes the body. Full article body — plain text or markdown. The server mirrors this into both answer_text (search/chat) and answer_json (Tiptap doc used by the public renderer), so passing only the title leaves the public page blank. Empty strings are rejected. MARKDOWN SURVIVES the round trip: "- " lines become real bullet lists in the rendered article, so an existing article can be rewritten without flattening its structure — send the WHOLE body (update replaces it, it does not patch).',
            },
            category: {
              type: 'string',
            },
            include_in_chat: {
              type: 'boolean',
            },
            visibility: {
              type: 'string',
              enum: ['public', 'internal'],
              description: 'Who may read it. "public" (default) = visitors and the site chat. "internal" = staff only; visitors never see it and the public chat cannot ground answers in it, but staff-facing agents can. Internal articles keep the full KB shape — categories, search, helpful/needs_improvement.',
            },
            publish: {
              type: 'boolean',
              description: 'Publish immediately. Default false = DRAFT — drafts are NOT indexed and invisible to visitors and the chat.',
            },
            locale: {
              type: 'string',
              description: 'Language of THIS article: "sv", "de", "en-GB". Omit on create and the site\'s default language is stamped. On update it re-declares the language; on list it filters. Together with the translation group it forms the key — one row per language per group.',
            },
            translation_of: {
              type: 'string',
              description: 'create only: slug, id or title of an EXISTING article this one translates. Requires locale. The new article joins the source\'s translation group (created if missing) and inherits its category unless one is passed; a second version in the same language is rejected — update that article instead.',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_kb_article
### What
Manages knowledge base articles: list, get, create, update, publish, unpublish.
### When to use
- Admin asks to create or edit FAQ/KB content
- kb_gap_analysis identifies missing topics
- Chat finds questions it can't answer → create KB article
### Choosing the audience
Ask whose voice the text is in, not what it is about.
- Customer's question, answered for them → **public** (default).
- Team's own words — "how do we handle the objection that…", "which customers
  to approach first", escalation steps, pricing latitude, internal policy →
  **visibility: 'internal'**.
The same TOPIC can live in both: a public "Is private AI more expensive?" and an
internal "How we handle the cost objection". Write both rather than compromising
one article for two audiences.
Unpublishing is NOT the same as internal: an unpublished article is gone for
everyone including staff; an internal one is live for staff.
### Draft vs published — say it out loud
**create saves a DRAFT unless you pass \`publish: true\`.** A draft is NOT
indexed by the retrieval engine: visitors cannot find it, the site chat cannot
answer from it, and search returns nothing. The create response ALWAYS carries
\`is_published\`; when it is false it also carries a \`note\`.
**Never tell the user an article is published, live, or "now answerable by the
chat" unless the response said \`is_published: true\`.** If it says false,
report it as a draft and say what is needed: re-run with \`publish: true\`, call
\`action: 'publish'\`, or ask an admin. Reporting a draft as published is the
failure this parameter exists to prevent.
### One article, several languages
An article's language lives ON THE ROW: \`locale\` is the language it is written
in, and rows sharing a \`translation_group_id\` are versions of each other — one
row per language per group, the same rail pages and email templates ride.
- Omit \`locale\` on create and the site's default language is stamped — you do
  not need it for ordinary single-language work.
- To ADD a language version: \`action: 'create'\` with \`translation_of\` (the
  existing article's slug/id/title) and \`locale\` (e.g. \`"en"\`). Do NOT
  create a free-standing article named "Title (EN)" — that orphan can never be
  offered as the translation of the original. The new version inherits the
  source's category and gets its own slug (each language keeps its own address).
- A second version in the same language is rejected — \`get\` returns
  \`language_versions\` with each sibling's slug and locale, so update the
  existing row instead.
- The public site shows each visitor the version in their language; a group
  with no version in it is absent from lists rather than shown in the wrong
  language. You choose what exists, never who sees which.
- \`list\` accepts \`locale\` as a filter; rows from before the language rail
  carry no locale and are always listed.
### Parameters
- **action**: Required. list, get, create, update, publish, unpublish.
- **publish**: Boolean, create only. \`true\` = live immediately. Omitted or
  false = draft (invisible + unindexed).
- **visibility**: 'public' (default) or 'internal'. Settable on create and update.
- **title**, **question**: required for create.
- **answer**: **REQUIRED for create and for any update that changes the body.**
  Plain text or markdown. Server auto-builds the Tiptap doc the public
  page needs — empty strings are rejected to prevent blank articles.
- **include_in_chat**: Boolean — whether the article is used by chat AI.
- **locale**: Language tag ("sv", "de", "en-GB"). Optional everywhere; see the
  language section above.
- **translation_of**: create only, requires locale — see the language section.
### Edge cases
- Articles with include_in_chat=true are embedded into chat context.
- Always set a clear question field for chat matching.`,
  },
  {
    name: 'kb_article_history',
    description:
      'Version history for KB articles: list revisions, read an old revision, restore one. Every title/question/answer edit and every delete is captured automatically. Use when: reviewing what changed in an article, recovering overwritten or deleted content, auditing edits. NOT for: current content (manage_kb_article get) or wiki pages (wiki_page_history).',
    category: 'content',
    handler: 'rpc:kb_article_history',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'kb_article_history',
        description:
          'list (per slug or article_id, newest first) / get (full revision body incl. answer_json) / restore (write a revision back — recreates deleted articles as drafts).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'get', 'restore'] },
            p_slug: { type: 'string', description: 'Article slug (list)' },
            p_article_id: { type: 'string', format: 'uuid', description: 'Alternative to slug (list) — survives slug changes' },
            p_revision_id: { type: 'string', format: 'uuid', description: 'Revision id (get/restore)' },
            p_limit: { type: 'integer', default: 20, description: 'list: max revisions (max 100)' },
          },
        },
      },
    },
    instructions:
      'Revisions store the PREVIOUS state before each edit (metadata-only changes like publish toggles or feedback counts do not create revisions). restore on a deleted article recreates it UNPUBLISHED — review and publish via manage_kb_article. Restoring also snapshots the current state first, so nothing is lost.',
  },
  {
    name: 'kb_feedback_report',
    description:
      'KB article feedback analytics: which articles get thumbs up/down from readers, which are auto-flagged as needing improvement, and clearing the flag after a rewrite. Use when: prioritizing KB rework, "which help articles are failing users", content quality review. NOT for: reading article content (manage_kb_article) or chat-answer feedback (chat analytics).',
    category: 'analytics',
    handler: 'rpc:kb_feedback_report',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'kb_feedback_report',
        description:
          'report (all articles with feedback, worst first, + totals) / list_flagged (needs_improvement=true) / clear_flag (mark an article fixed). Feedback comes from the public "Was this helpful?" buttons.',
        parameters: {
          type: 'object',
          properties: {
            p_action: { type: 'string', enum: ['report', 'list_flagged', 'clear_flag'], default: 'report' },
            p_slug: { type: 'string', description: 'Article slug (clear_flag)' },
            p_limit: { type: 'integer', default: 50 },
          },
        },
      },
    },
    instructions:
      'needs_improvement is auto-set by the public feedback RPC when an article gets >=3 negatives or >30% negative ratio (min 5 votes). Typical loop: list_flagged → rewrite the article (manage_kb_article update) → clear_flag. negative_ratio in report is the key sort signal.',
  },
];

export const kbModule = defineModule<KBArticleModuleInput, KBArticleModuleOutput>({
  id: 'knowledgeBase',
  name: 'Knowledge Base',
  version: '1.0.0',
  processes: ['content-to-conversion', 'support-to-resolution'],
  maturity: 'L3',
  description: 'Create knowledge base articles',
  capabilities: ['content:receive', 'data:write'],
  tier: 'standard',
  inputSchema: kbArticleModuleInputSchema,
  outputSchema: kbArticleModuleOutputSchema,

  skills: [
    'manage_kb_article',
    'search_kb',
  ],
  data: {
    tables: ['kb_articles', 'kb_categories'],
  },
  skillSeeds: KB_SKILLS,

  webhookEvents: [
    { event: 'kb_article.published', description: 'An article was published' },
    { event: 'kb_article.updated', description: 'An article was updated' },
  ],

  async publish(input: KBArticleModuleInput): Promise<KBArticleModuleOutput> {
    try {
      const validated = kbArticleModuleInputSchema.parse(input);
      const baseSlug = validated.slug || generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = validated.slug ? baseSlug : `${baseSlug}-${timestamp}`;

      let answerJson: Record<string, unknown> | null = null;
      let answerText: string | null = null;

      if (typeof validated.answer === 'string') {
        answerText = validated.answer;
        answerJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: validated.answer }] }] };
      } else if (isTiptapDocument(validated.answer)) {
        answerJson = validated.answer as Record<string, unknown>;
        answerText = JSON.stringify(validated.answer);
      }

      const articleData = {
        title: validated.title,
        question: validated.question,
        slug,
        category_id: validated.category_id,
        answer_json: answerJson as Json,
        answer_text: answerText,
        is_published: validated.options?.is_published ?? true,
        is_featured: validated.options?.is_featured ?? false,
        include_in_chat: validated.options?.include_in_chat ?? true,
        meta_json: validated.meta ? {
          source_module: validated.meta.source_module,
          source_id: validated.meta.source_id,
          seo_title: validated.meta.seo_title,
          seo_description: validated.meta.seo_description,
        } as Json : null,
      };

      const { data, error } = await supabase
        .from('kb_articles')
        .insert(articleData)
        .select('id, slug')
        .single();

      if (error) {
        logger.error('[KBModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, slug: data.slug, url: `/kb/${data.slug}` };
    } catch (error) {
      logger.error('[KBModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
