/**
 * Platform Seeds
 *
 * Skills and automations that are part of the FlowWink platform itself,
 * NOT owned by any opt-in module. They must exist on every instance
 * regardless of which modules are enabled.
 *
 * Examples: the daily briefing (deterministic metric aggregation + LLM summary
 * — a SaaS automation, not an agent action), platform health checks, etc.
 *
 * Design rule: only put things here that are required for the *platform* to
 * function. Anything that adds value to a specific business domain should live
 * in the corresponding module under `src/lib/modules/`.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

export const PLATFORM_SKILLS: SkillSeed[] = [
  {
    name: 'run_daily_briefing',
    description:
      "Generate the daily business briefing: health score, key metrics (visitors, leads, orders, revenue), AI summary and action items. Writes to flowpilot_briefings + admin FlowChat. Use when: scheduled daily run; admin requests today's briefing. NOT for: weekly review (weekly_business_digest); ad-hoc analytics (analyze_analytics).",
    category: 'analytics',
    handler: 'edge:flowpilot-lifecycle',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_daily_briefing',
        description:
          'Generate the daily business briefing as a platform SaaS automation. Deterministic metric aggregation + a single LLM summary. NOT a ReAct loop.',
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Trigger source label (cron, manual, automation).' },
          },
        },
      },
    },
    instructions: `## run_daily_briefing
### What
Platform SaaS automation. Deterministic metric aggregation + one LLM call for narrative summary. NOT a ReAct loop, NOT a FlowPilot skill.
### When
Scheduled daily 07:00 UTC via the "Daily Briefing" automation in /admin/automations. Also runnable on demand by an admin.
### Output
- Row in flowpilot_briefings (consumed by BusinessPulseWidget)
- System message in the admin FlowChat
- Email to the owner if Resend is configured`,
  },
  {
    name: 'get_agent_trace',
    description:
      "Read the harness Trace — the decision log of autonomous runs. Call with no arguments to list recent runs (heartbeat, cron, chat, gateway), each summarised with health, step count and skills touched; call with a run's trace_id for its full ordered steps, each carrying the verbatim arguments the caller sent, the result, outcome and any approval it was gated to. Read-only. Use when: debugging why FlowPilot did something; auditing an autonomous action; reviewing what an agent actually ran (not what it claims). NOT for: live metrics (analyze_analytics); integration status (check_integrations).",
    category: 'system',
    handler: 'internal:get_agent_trace',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_agent_trace',
        description:
          'Read-only view over the harness\'s own run logs. No args → list recent runs; {trace_id} → one run with ordered steps and verbatim inputs. The evidence trail, not the model\'s account.',
        parameters: {
          type: 'object',
          properties: {
            trace_id: { type: 'string', description: 'A run id (e.g. hb_… from a listing). Omit to list recent runs.' },
            agent: { type: 'string', description: 'Filter the listing by driver: heartbeat, cron, chat, mcp, flowpilot, automation.' },
            limit: { type: 'integer', description: 'Max runs to list (default 40, max 200).' },
            since_hours: { type: 'integer', description: 'Look-back window in hours for the listing (default 72).' },
          },
        },
      },
    },
    instructions: `## get_agent_trace
### What
The read-only Trace over agent_activity, grouped into RUNS by trace_id. A run is one harness execution — a heartbeat, a cron fire, a chat turn, or a gateway session — and its steps all share the trace_id the reason loop stamps.
### When to use
- "Why did FlowPilot do X?" — find the run, read the ordered steps.
- Auditing an autonomous action for a human ("show me what the agent actually did").
- Debugging a failure: the step's \`input\` is the VERBATIM arguments the caller sent — read it, never ask the agent what it sent.
### Two shapes
- **No arguments** → recent runs, newest first: { trace_id, agent, health (ok/degraded/failed), step_count, skills[] }.
- **{ trace_id }** → that run in full, with \`steps[]\` in order (skill, status, input, output, error, outcome, approval link).
### Why it exists
The harness records everything; this is the surface that makes it legible. It renders what already happened — it never changes a run. See docs/architecture/agent-harness.md.`,
  },
  {
    name: 'describe_blocks',
    description:
      "Return the CMS block vocabulary: every block type the platform renders, the exact field contract for one of them, and the composition rules for choosing between them. Call with no argument for the catalogue (56 types with one-line descriptions), then with block_type=<type> for that block's full Data spec BEFORE writing its data. It answers two questions, not one: which FIELDS a block has, and which BLOCK a piece of content belongs in — 'text' is the last resort (three claims belong in 'features' or 'stats', an argument in steps in 'timeline', questions in 'accordion'), and a page alternates block weight instead of repeating it. Use when: ALWAYS before authoring or editing block content — call it first on every page write (manage_page content_json, create_page_block, manage_page_blocks) and on every site template, and never write a block type or field name from memory. Types are kebab-case ('two-column', never 'two_column'); a guessed type or field is refused at write time or stored and never rendered. NOT for: reading a page's current blocks (manage_page_blocks action=get); NOT for site-wide settings.",
    category: 'system',
    handler: 'internal:describe_blocks',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'describe_blocks',
        description:
          'Block-type catalogue, per-block field contract, and the composition rules for choosing between types (text is the last resort; three claims are features or stats, steps are timeline, Q&A is accordion). Call BEFORE every block write — never author a block from memory. Read-only reference; costs nothing to call.',
        parameters: {
          type: 'object',
          properties: {
            block_type: {
              type: 'string',
              description:
                "Exact block type, e.g. 'hero', 'two-column', 'features'. Omit to list every type first.",
            },
          },
        },
      },
    },
    instructions: `## describe_blocks
### What
The block vocabulary, served on demand. Two levels: no argument returns every block type with a one-line description (choose from this); block_type=<type> returns that block's full field contract verbatim.
### Why it exists
manage_page_blocks tells you to ask for a block's schema rather than guess — this is what you ask. Guessing field names is the single most common cause of a page that saves but renders empty: the block ignores keys it does not know, silently.
### The rule that catches most agents
Fields shown as a Tiptap JSON doc must be OBJECTS ({"type":"doc","content":[…]}), never strings. Sending markdown or plain text into a Tiptap field produces a block that stores your text and renders nothing.
### The second rule: the type strings are kebab-case
"two-column", "sticky-scroll", "bento-grid", "announcement-bar" — never snake_case ("two_column", "sticky_story") and never a name you invented. Copy the type string from this catalogue verbatim.
### Choosing the block — the half that is not a field contract
Knowing every field of \`text\` still gets you an essay. Measured over the 11 shipped templates (70 hand-built pages, 444 blocks): \`text\` is 13 blocks — 2.9% of everything. 57 of the 70 pages contain none, and NOT ONE page anywhere contains two. Where it does appear it is usually the WHOLE page (privacy policy, terms). On a page a visitor is meant to act on, \`text\` is the last resort, not the default:
- three claims in a row → \`features\` (icon cards) or \`bento-grid\` (varied spans)
- a number, a proof point → \`stats\`; the top three → \`hero.heroStats\`
- an argument in steps, a "how it works" → \`timeline\`, or \`sticky-scroll\` for a long walkthrough
- questions and objections → \`accordion\`
- one claim beside an image → \`two-column\`
- someone else's words → \`testimonials\`, \`quote\`, \`logos\`, \`social-proof\`
- a row of destinations → \`quick-links\`; the ask → \`cta\`
If you have written a paragraph and cannot name which of these it is, the paragraph is the wrong shape. Reshape it — do not ship it as \`text\`.
### Rhythm
Shipped pages open on \`hero\` (55/70) and close on \`cta\` (32/70); the middle ALTERNATES visual weight instead of repeating it. Template home pages run 6–25 blocks (median 14), subpages 6–8. Two blocks of the same type back to back — above all two \`text\` — is the signal that one of them wanted to be something else. \`section-divider\`, \`parallax-section\` and \`marquee\` are breathers between heavy sections, never content in their own right.
### Workflow
1. describe_blocks() — pick the types the page needs (see "Choosing the block": a page is a composition, not an essay with headings)
2. describe_blocks({ block_type }) — for each one you will write
3. manage_page (content_json) / create_page_block / manage_page_blocks / manage_site_template — write data using exactly those field names. A missing required field fails the write closed (manage_page refuses the WHOLE page, nothing partial is stored), so the lookup is always cheaper than the retry.
### Source of truth
Generated from src/lib/block-reference.ts, so it is always what the renderer actually supports. If a field is not listed here, the renderer does not read it.`,
  },
  {
    // describe_blocks' other half. That one answers "what can I build";
    // this one answers "what did I build". Platform, not FlowPilot: eleven
    // modules write pages, and the consumers are FlowPilot's ReAct loop,
    // FlowWork, external agents on the MCP gateway, and the template /
    // migration path. Behind the FlowPilot toggle it would be invisible to
    // three of the four.
    name: 'inspect_rendered_page',
    description:
      "Read back a page that has ALREADY been written and report what actually renders: (1) every field stored that no renderer reads, with the correct field name where one exists, (2) every block that renders as an empty section because its content-bearing field is missing, (3) the page's composition — block count, text share, two same-type blocks in a row, how many blocks carry an image/video/logo. Static comparison against the generated block field catalogue: read-only, no browser, cannot fail in production, costs nothing to call. Use when: ALWAYS straight after writing or editing a page — manage_page, manage_page_blocks, create_page_block, install_template, migrate_url — because a block silently stores keys it does not know, so \"saved\" is not \"rendered\" and this is the only call that tells the two apart; also when a page looks thin, a section shows up blank, or you are about to report a page complete. NOT for: which fields a block SUPPORTS before writing (describe_blocks); NOT for reading a page's block content back (manage_page_blocks action=get); NOT for SEO/meta, site settings or link checking.",
    category: 'system',
    handler: 'internal:inspect_rendered_page',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'inspect_rendered_page',
        description:
          'What a written page actually renders: fields stored that nothing reads (with the right name), blocks that render as an empty section, and the page composition. Call after every page write — saving is not rendering. Read-only.',
        parameters: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: "Page slug, e.g. 'agentic'. A leading/trailing slash is accepted.",
            },
            page_id: { type: 'string', description: 'Page UUID — use instead of slug when you have it.' },
            locale: { type: 'string', description: "Optional locale, e.g. 'sv'. Omit for the most recently updated match." },
          },
          anyOf: [{ required: ['slug'] }, { required: ['page_id'] }],
        },
      },
    },
    instructions: `## inspect_rendered_page
### What it is
The sensor for your own page writes. You write blocks into content_json and you never see the result — content_json is JSON, it accepts any key, and a block ignores what it does not recognise without a word. This call is the eyes.
### The failure it was built for
On a real site an agent wrote a hero with \`primary_cta\`, \`secondary_cta\` and \`subheadline\`. HeroBlock reads \`primaryButton\`, \`secondaryButton\` and \`subtitle\`. All three saved. None rendered. A third of the block's content sat in the database, the page looked thin, and the agent reported it complete. Nothing anywhere said otherwise.
### Call it
\`inspect_rendered_page({ slug })\` — or \`{ page_id }\`. Read-only; call it as often as you like.
### The three answers, and what to do with each
1. **\`unread_fields\`** — you wrote it, nothing reads it. Each entry carries \`block_type\`, \`field\`, \`value_preview\` and \`likely_meant\` (the catalogued field you probably meant). FIX: rewrite that block with the right field name and move the value across. Do NOT just delete the key — the content in \`value_preview\` is content you intended to publish.
2. **\`empty_blocks\`** — every field name is spelled right and the block still renders a blank band, because the field that carries its content is missing. \`missing\` names exactly which field (or which of several alternatives) would fill it. FIX: fill it, or remove the block. A blank section reads as a broken site.
3. **\`composition\`** + \`composition.notes\` — the page as a whole: \`order\`, \`type_counts\`, \`text_block_count\`, \`text_share_pct\`, \`adjacent_repeats\`, \`blocks_with_media\`, \`opens_with\`, \`closes_with\`. Notes are measured against the 70 shipped template pages: they open on \`hero\`, close on \`cta\`, and not one contains two \`text\` blocks. Two blocks of the same type in a row means one of them wanted to be something else — see describe_blocks for which.
Also: **\`unknown_block_types\`** — a type the renderer has no case for. Those render as literally nothing; \`did_you_mean\` names the closest real types.
### Reading the verdict
\`ok\` (nothing stored invisibly, nothing blank, composition clean) · \`renders_but_thin\` (everything renders, but the composition notes say it is an essay, not a page) · \`needs_attention\` (content is invisible or blank — fix before reporting the page done).
### Workflow
1. describe_blocks({ block_type }) — before writing
2. manage_page / manage_page_blocks / create_page_block — write
3. **inspect_rendered_page({ slug }) — after writing, every time**
4. Fix what it names, then call it again. A page is not finished until this returns \`ok\` or you can say why the remaining notes are deliberate.
### Honest limit
It compares your data against the generated field catalogue (block-reference.ts → block-tools.ts), not against a live browser render. It cannot see layout, contrast or overflow — it sees, exactly and cheaply, which of your content the renderer will never look at. The data-driven blocks (products, cart, kb-hub, kb-search, kb-featured, kb-accordion, smart-booking, handbook, consultant-matcher) fetch their own rows, so an empty \`data\` on those is correct and is never flagged.`,
  },
  {
    name: 'check_integrations',
    description:
      "Probe every enabled integration (SearXNG, Firecrawl, Resend, OpenAI, Gemini, Unsplash, Composio, local LLM) that something in this instance actually consumes, with a cheap live call, and report per-integration ok/fail/unused with a diagnostic. An integration nothing points at is reported 'unused', never as a fault. Use when: an integration-backed feature behaves oddly (search falls back, mail not sending); after changing integration config or rotating a key; a scheduled health sweep. NOT for: testing AI chat quality (test_ai_connection); full platform test suites (run_platform_tests).",
    category: 'system',
    handler: 'internal:check_integrations',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_integrations',
        description:
          'Probe every enabled integration that something in this instance consumes, with a cheap live call (auth check / trivial read, never a billable write), and report per-integration status (ok/fail/unused/skipped) with a diagnostic and likely fix. Read-only sensor.',
        parameters: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: "Trigger source label. When 'automation', failures are posted to admin FlowChat.",
            },
          },
        },
      },
    },
    instructions: `## check_integrations
### What
Read-only sensor: probes each ENABLED integration from site_settings.integrations that something in this instance actually CONSUMES, with a bounded (6s) live call. Returns { healthy, summary, failing[], unused[], integrations[] } where every entry has status ok/fail/unused/skipped plus a diagnostic detail.
### When to use
- An integration-backed feature misbehaves (web search silently falling back to another provider, mail not arriving, image search empty)
- After editing integration config or rotating an API key — verify before moving on
- Scheduled: the "Integration health check" automation runs this daily and raises a notification when something fails
### Reading the result
- Diagnostics name the likely fix when the failure shape is known, e.g. SearXNG "403 on format=json" → enable the json format in the instance's settings.yml; "0 results" → the engines block the server's IP, enable qwant/mojeek.
- 'skipped' means disabled in settings or nothing server-side to probe (google_analytics is a client-side snippet) — not a failure.
- 'unused' means nothing in this instance consumes it, so it was not probed at all: an unconfigured local LLM on a site whose system_ai.provider is 'openai' is a normal state, not a fault. The entry says which map was consulted (system_ai.provider, email-send's transport chain, web-search's provider chain). Never report an 'unused' entry as a problem.
- A 'fail' on a consumed integration names what depends on it ("IN USE BY: …") — that is the one to act on.
### Origin
Built after the 2026-07-22 incident where the fleet's SearXNG was misconfigured for days and web search silently fell back to Firecrawl — the failure was invisible until someone read provider fields in agent_activity.`,
  },
  {
    name: 'reset_sandbox',
    description:
      "DEMO INSTANCE ONLY — destroy and rebuild this instance: wipe all content/transaction data (seeded layers, config and the shared admin survive), reset the shared admin password, reinstall the template named in the Demo Mode toggle. Hard-gated on site_settings.demo_mode (the ONE switch that makes an instance disposable; legacy sandbox_mode honored); refuses on any other instance. Use when: the nightly demo-cycle rebuild runs; an operator wants a fresh demo instance now. NOT for: clearing one module's demo data (reset_module_data via demo-cycle); uninstalling a template (install_template).",
    category: 'system',
    handler: 'internal:reset_sandbox',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reset_sandbox',
        description:
          'Destroy-and-rebuild for a demo instance. Triple-gated (demo_mode toggle, SQL confirm token, service/admin caller); a non-demo instance always refuses. Wipes content + extra users, resets the shared admin credential, reinstalls the configured template.',
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Trigger source label (cron, manual).' },
          },
        },
      },
    },
    instructions: `## reset_sandbox
### What
Full rebuild: sandbox_reset_wipe() truncates every public table except the seeded layers (agent_skills, agent_automations, chart_of_accounts, account_roles, accounting_templates, locale_packs), config (site_settings), identity (profiles, user_roles) and api_keys — then deletes every auth user except the shared demo admin, resets its password to the published demo credential, and reinstalls the template named by the Demo Mode toggle (site_settings.demo_mode.template_id; legacy sandbox_template honored; default flowwink-platform).
### Gates (why it is safe to exist fleet-wide)
- site_settings.demo_mode must be enabled — the visible Demo Mode toggle in System settings, the ONE switch that makes an instance disposable (legacy sandbox_mode honored until the old sandbox retires); everywhere else the skill answers with a refusal.
- The SQL function additionally requires the literal confirm token and a service_role/admin caller, and is atomic: a wipe that would damage a keep-table rolls back entirely.
### When to use
- Scheduled nightly rebuild (cron on the sandbox)
- An operator wants a clean sandbox immediately
### After a reset
FlowPilot objectives re-seed via auto-bootstrap on the next heartbeat. demo-cycle re-seeds its module scenario on its next run.`,
  },
  {
    name: 'sync_skills_from_code',
    description:
      "Reconcile this instance's skill registry against the deployed code's bundled seed artifact: inserts missing skills, refreshes definition fields (description, instructions, handler, tool_definition) on drifted ones for enabled modules + platform. Never touches trust_level, so runtime trust overrides survive. Short-circuits when the instance already carries the deploy's artifact hash. Use when: after a deploy, skills look stale or missing; a fresh install shows only a handful of skills; an operator wants the 4th deploy layer applied without database credentials. NOT for: enabling/disabling modules (manage_site_settings); changing one skill's trust (that is a runtime dial).",
    category: 'system',
    handler: 'internal:sync_skills_from_code',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sync_skills_from_code',
        description:
          "Reconcile agent_skills against the deploy's bundled seed artifact — insert missing, refresh drifted definition fields, never touch trust_level. Idempotent; hash-gated (pass force to re-apply).",
        parameters: {
          type: 'object',
          properties: {
            force: { type: 'boolean', description: 'Re-apply even when the artifact hash matches site_settings.skills_artifact_sha.' },
          },
        },
      },
    },
    instructions: `## sync_skills_from_code
### What
The 4th deploy layer. A GitHub push deploys schema, edge functions and frontend — this skill applies the fourth: agent_skills rows, reconciled from the seed artifact bundled into the deployed agent-execute function. Semantics mirror bootstrapModule/sync-skills.ts: only ENABLED modules (+ platform, always); INSERT missing skills complete (trust from seed, default notify); UPDATE existing rows' definition fields only — NEVER trust_level.
### Hash gate
The artifact's sha256 is stored in site_settings.skills_artifact_sha on success. A repeat call with the same deploy answers {"status":"unchanged"} in one settings read. Pass {"force": true} after manual DB surgery to re-assert the seeds.
### When to use
- After any deploy, as the standard 4th-layer step (cron or bootstrap calls it automatically)
- A fresh install shows only migration-seeded skills (the 5-skills symptom)
### Reading the result
"inserted"/"updated" counts plus the first 40 names of each. modules_skipped_disabled counts modules whose skills were left alone because the module is off — enable the module and re-run to pick them up.`,
  },
  {
    name: 'email_admins',
    description:
      "Email every instance admin (resolved from user_roles at send time) through the provider-agnostic email gateway. Use when: an automation or agent needs to alert the humans running this instance (new booking, failed sweep, threshold crossed). NOT for: customer-facing mail (send_email); lead outreach (send_email_to_lead); newsletters (send_newsletter).",
    category: 'communication',
    handler: 'internal:email_admins',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'email_admins',
        description:
          'Deliver one finished message to all instance admins. Recipients come from user_roles at send time — never pass addresses. Outcomes are kept apart: sent / simulated (no provider) / blocked_by_allowlist (pilot guard, logged) / failed.',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Email subject line.' },
            html: { type: 'string', description: 'HTML body — compose the full message before calling.' },
            source: { type: 'string', description: 'Originating label for outbound_communications (default "email_admins").' },
          },
          required: ['subject', 'html'],
        },
      },
    },
    instructions: `## email_admins
### What
One message → every admin (user_roles role='admin', emails via auth at send time). Routed through email-send: provider-agnostic, allowlist-guarded, every outcome logged to outbound_communications.
### When
Automations reacting to platform events (booking.created and friends) and agents that must reach the instance operators. Not a customer channel.
### Read the result honestly
{sent, blocked, failed, detail[]} — 'blocked' is the outbound allowlist doing its job on pilot instances and is neither success nor failure; report it as withheld. Born from the booking incident where a skipped confirmation left zero trace.`,
  },
  {
    name: 'search_web',
    description: 'Search the web for information. Supports Firecrawl and Jina providers. Use when: researching a topic; finding current information; answering questions requiring web data. NOT for: scraping a specific URL (scrape_url); fetching login-walled content (browser_fetch).',
    category: 'search',
    handler: 'edge:web-search',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for information. Supports Firecrawl and Jina providers. Use when: researching a topic; finding current information; answering questions requiring web data. NOT for: scraping a specific URL (scrape_url); fetching login-walled content (browser_fetch).',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 5)',
            },
            preferred_provider: {
              type: 'string',
              enum: [
                'auto',
                'firecrawl',
                'jina',
              ],
              description: 'Provider selection: auto (free first), firecrawl (paid, deep), jina (fast, free)',
            },
          },
          required: [
            'query',
          ],
        },
      },
    },
    instructions: `# Web Search — Provider Knowledge

## Providers Available
- **Firecrawl** (paid): Premium search quality, includes scraped content from results, best for deep research where you need full page content alongside results. Costs credits per search.
- **Jina Search** (free tier available): Fast, lightweight web search. Free tier has rate limits. Good for quick lookups, trend checks, and simple queries.

## When to Use Which
| Scenario | Provider | Why |
|----------|----------|-----|
| Quick fact check | jina | Free, fast, sufficient |
| Prospect/company research | firecrawl | Richer results with scraped content |
| Content trend research | jina | Volume of searches, cost-efficient |
| Deep competitive analysis | firecrawl | Needs full page content |
| General knowledge lookup | auto | Let the system decide |

## Decision Framework
1. **Default to auto** — the system tries free providers first, then paid
2. **Use preferred_provider='jina'** when you want speed and cost savings
3. **Use preferred_provider='firecrawl'** when result quality and depth matter more than cost
4. If a free search returns poor/empty results, retry with firecrawl before giving up

## Parameters
- query: Search query (required)
- limit: Max results (default 5)
- preferred_provider: 'auto' | 'firecrawl' | 'jina' (default 'auto')`,
  },
  {
    name: 'search_knowledge',
    description: "Hybrid semantic + keyword search over the site's indexed knowledge (pages, KB articles, wiki, docs, extracted documents). Returns relevance-ranked text chunks with titles and URLs for citation. Use when: answering questions from company/site knowledge; finding which page or article covers a topic; grounding a reply in existing content. NOT for: structured or transactional rows like orders, invoices or Flowtable records (use query_flowtable or the module's list_/get_ skills); searching the public web (search_web).",
    category: 'search',
    handler: 'internal:search_knowledge',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_knowledge',
        description: "Hybrid semantic + keyword search over the site's indexed knowledge (pages, KB articles, wiki, docs, extracted documents). Returns relevance-ranked text chunks with titles and URLs for citation. Use when: answering questions from company/site knowledge; finding which page or article covers a topic; grounding a reply in existing content. NOT for: structured or transactional rows like orders, invoices or Flowtable records (use query_flowtable or the module's list_/get_ skills); searching the public web (search_web).",
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural-language question or topic to search for',
            },
            limit: {
              type: 'number',
              description: 'Max chunks to return (default 8, max 20)',
            },
            sources: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['pages', 'kb_articles', 'wiki_pages', 'docs_pages', 'documents'],
              },
              description: 'Restrict to specific knowledge sources (default: all)',
            },
          },
          required: ['query'],
        },
      },
    },
    instructions: `# Search Knowledge — the Retrieval Engine gateway surface

Searches the knowledge_chunks index (kept fresh automatically: write-triggers
+ a 5-minute sweeper). Ranking is hybrid RRF: tsvector keyword + pgvector
semantic when an embedding provider is configured; degrades to keyword-only
otherwise (check the "ranking" field in the response).

## Parameters (exact names)
- query: natural-language question or topic (required)
- limit: max chunks, default 8, max 20
- sources: array subset of pages | kb_articles | wiki_pages | docs_pages | documents

## Result shape
results[]: { source, entity_id, title, url, content, score }. The title
carries the heading trail ("Refund policy › Partial refunds") and url is the
canonical citation link.

## Boundaries (two-lane rule)
This is the KNOWLEDGE lane — prose content. Structured/transactional data
(orders, invoices, Flowtable rows) is the LIVE lane: use query_flowtable or
the owning module's list_/get_ skills. Paraphrase freely: semantic ranking
finds "how do I get my money back" → refund policy without keyword overlap.`,
  },
  {
    name: 'scrape_url',
    description: 'Scrape a single URL and extract content as markdown. Supports Firecrawl and Jina Reader. Use when: extracting content from a public webpage; converting web pages to markdown; needing text from an accessible URL. NOT for: accessing login-walled sites (browser_fetch); searching multiple pages (search_web).',
    category: 'search',
    handler: 'edge:web-scrape',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'scrape_url',
        description: 'Scrape a single URL and extract content as markdown. Supports Firecrawl and Jina Reader. Use when: extracting content from a public webpage; converting web pages to markdown; needing text from an accessible URL. NOT for: accessing login-walled sites (browser_fetch); searching multiple pages (search_web).',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to scrape',
            },
            max_length: {
              type: 'number',
              description: 'Max content chars (default 10000)',
            },
            preferred_provider: {
              type: 'string',
              enum: [
                'auto',
                'firecrawl',
                'jina',
              ],
              description: 'Provider: auto (free first), firecrawl (JS rendering, paid), jina (fast, free)',
            },
          },
          required: [
            'url',
          ],
        },
      },
    },
    instructions: `# Web Scrape — Provider Knowledge

## Providers Available
- **Firecrawl** (paid): Full JS rendering, handles SPAs, dynamic content, anti-bot bypassing. Best for modern web apps, LinkedIn pages, JS-heavy sites. Costs credits per scrape.
- **Jina Reader** (free tier available): Converts URLs to clean markdown. Works great for static content, blogs, documentation, news articles. Free tier has rate limits.

## When to Use Which
| Scenario | Provider | Why |
|----------|----------|-----|
| Blog post / article | jina | Free, clean markdown output |
| LinkedIn page | firecrawl | Needs JS rendering + anti-bot |
| Documentation page | jina | Static content, free is fine |
| SPA / dynamic web app | firecrawl | JS rendering required |
| Company about page | auto | Try free first |
| Landing page analysis | firecrawl | Better at extracting full layout |

## Decision Framework
1. **Default to auto** — tries free first, falls back to paid
2. **Use preferred_provider='jina'** for static content (blogs, docs, news)
3. **Use preferred_provider='firecrawl'** for JS-heavy sites, SPAs, LinkedIn, or when jina returns empty/garbage
4. If content looks truncated or broken, retry with firecrawl

## Parameters
- url: URL to scrape (required)
- max_length: Max content length in chars (default 10000)
- preferred_provider: 'auto' | 'firecrawl' | 'jina' (default 'auto')`,
  },
  {
    name: 'manage_site_settings',
    description: 'Read and update site settings including module configuration, site name, theme, etc. Use when: retrieving global configurations; changing website name; enabling or disabling modules. NOT for: updating site branding (site_branding_update); managing global blocks (manage_global_blocks).',
    category: 'system',
    handler: 'db:site_settings',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_site_settings',
        description: 'Read and update site settings including module configuration, site name, theme, etc. Use when: retrieving global configurations; changing website name; enabling or disabling modules. NOT for: updating site branding (site_branding_update); managing global blocks (manage_global_blocks).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'get',
                'get_all',
                'update',
              ],
            },
            key: {
              type: 'string',
              description: 'Settings key to read/update',
            },
            value: {
              type: 'object',
              description: 'New value (for update)',
            },
          },
          required: [
            'action',
          ],
          'x-action-required': {
            update: ['key', 'value'],
          },
        },
      },
    },
    instructions: `## manage_site_settings
### What
Reads and updates site settings including module configuration, site name, theme, AI config, chat config.
### When to use
- Admin asks to change site settings
- System configuration queries
- Module enable/disable
### Parameters
- **action**: Required. get, get_all, update.
- **key**: Settings key (modules, site_name, theme, ai_config, chat_config, etc.).
- **value**: New value for update.
### Edge cases
- Some settings changes require page reload to take effect.
- ai_config controls which AI provider FlowPilot uses.
- Be careful with module toggles — disabling a module hides its UI.`,
  },
  {
    name: 'update_skill_instructions',
    description:
      'Apply a reviewed improvement to one skill\'s instructions (and optionally description) in the live skill catalog. Use when: a Skill Curator proposal was approved, an admin asks to fix a skill\'s guidance after repeated agent mistakes. NOT for: creating skills, changing handlers/parameters (code change), disabling skills (manage via admin UI).',
    category: 'system',
    handler: 'internal:update_skill_instructions',
    scope: 'internal',
    // Skill self-modification is the one dial that never opens implicitly:
    // 'approve' here + an agent_trust_policies row (migration 20260712...)
    // keeps it human-gated even in 'proving' posture.
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'update_skill_instructions',
        description: 'Update instructions/description on one agent_skills row. Returns the previous text for audit/undo.',
        parameters: {
          type: 'object',
          required: ['skill_name'],
          properties: {
            skill_name: { type: 'string', description: 'Exact name of the skill to update' },
            instructions: { type: 'string', description: 'The full new instructions text (replaces the old)' },
            description: { type: 'string', description: 'Optional new description (replaces the old)' },
            reason: { type: 'string', description: 'Why — evidence summary shown to the approver' },
          },
        },
      },
    },
    instructions:
      'Replaces the WHOLE instructions text — include everything that should remain, not just the delta. The previous text is returned and logged in the activity output; to undo, re-run with that text. NB: a code-seed resync restores the bundled text — promote accepted improvements into the module seed (src/lib/modules/*) to make them permanent.',
  },
  {
    name: 'run_skill_curator',
    description:
      'Run the Skill Curator sweep: observe how skills failed recently (failed activities, human-rejected approvals, negative outcomes), draft instruction improvements for the worst offenders, and stage each as an approval in /admin/approvals. Never edits a skill directly. Use when: daily curator cron, "why does the agent keep failing at X — propose a fix", after a QA round produced repeated skill failures. NOT for: applying an improvement (update_skill_instructions after approval), business insights (run_daily_briefing).',
    category: 'system',
    handler: 'edge:flowpilot-lifecycle',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_skill_curator',
        description: 'Evidence sweep → AI-drafted instruction improvements → staged approvals. Bounded: max 3 proposals/run, 14-day cooldown per skill.',
        parameters: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean', description: 'Draft but do NOT stage approvals — returns previews. Default false.' },
          },
        },
      },
    },
    instructions:
      'Deterministic and bounded: evidence window 7 days, threshold ≥3 failures or ≥1 human rejection, max 3 proposals per run, 14-day cooldown per skill. Proposals land in /admin/approvals (update_skill_instructions, trust=approve — policy-pinned even in proving posture); flowpilot-followthrough applies them after approval. Returns { observed_skills, candidates, proposals: [{skill, staged, approval_request_id, rationale}] }.',
  },
  {
    name: 'cron_health_report',
    description:
      'Report the real health of this instance\'s scheduled jobs — the truth pg_cron\'s own status hides. Use when: verifying scheduled work actually runs (newsletters, bookkeeping sweeps, page publishing, reminders); investigating "X never happened"; a routine health check. Flags jobs pointing at the WRONG instance (foreign_host), jobs that never ran, stale last-run times, and recent HTTP errors from cron-dispatched calls. NOT for: application error logs; skill failures (run_skill_curator).',
    category: 'system',
    handler: 'rpc:cron_health_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'cron_health_report',
        description: 'Health of scheduled (pg_cron) jobs: per-job foreign_host/never_ran/last_status/last_run_age + recent HTTP errors. Read-only, no args.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    instructions:
      'Read-only, takes no arguments. Returns { self_host, jobs: [{jobname, schedule, active, target_host, foreign_host, never_ran, last_status, last_run, last_run_age_seconds}], http_errors_recent: [{status_code, url, created, error}], flags: {jobs_total, jobs_never_ran, jobs_foreign_host, http_errors_24h} }. THE KEY SIGNAL is foreign_host=true — the job targets a different <ref>.supabase.co than this instance (a hardcoded-URL bug: it fires against another instance, not its own). last_status="succeeded" only means pg_cron DISPATCHED the command — an HTTP 404/401 still reads as succeeded there, so cross-check http_errors_recent. Anything in flags > 0 (except jobs_total) warrants a look; report the offending jobnames. If cron_available=false the instance has no pg_cron.',
  },

  {
    name: 'test_ai_connection',
    description: 'Validate an AI provider credential (OpenAI/Gemini/Anthropic/local) by making a probe call. Use when: an admin adds or rotates an AI key and wants to confirm it works. NOT for: sending a real completion (chat-completion).',
    category: 'system',
    handler: 'internal:test_ai_connection',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'test_ai_connection',
        parameters: {
          type: 'object',
          required: ["provider"],
          properties: {
            provider: { type: 'string', description: 'openai | gemini | anthropic | local' },
            config: { type: 'object', description: 'Provider config (apiKey, model, apiUrl)' },
          },
        },
      },
    },
  },
];

export const PLATFORM_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Daily Briefing',
    description:
      'Platform automation. Generates the daily business briefing every morning at 07:00 UTC and posts it to admin FlowChat. Runs deterministically (no ReAct).',
    trigger_type: 'cron',
    trigger_config: { cron: '0 7 * * *', timezone: 'UTC' },
    skill_name: 'run_daily_briefing',
    skill_arguments: { source: 'automation' },
    executor: 'platform',
  },
  {
    name: 'Integration Health Check',
    description:
      'Platform automation. Probes every enabled integration daily at 06:30 UTC (before the briefing) and updates the integration health state on System → Observability. Only a CHANGE — healthy→failing, a new failure, or a recovery — raises an acknowledgeable notice in the header bell; "still failing, third day" is silent. Born from the 2026-07-22 SearXNG incident (a broken integration must never fail silently behind a fallback) and reshaped 2026-08-27, when the sweep\'s old habit of posting into admin FlowChat had left nine unresolvable assistant messages and turned the alarm into wallpaper.',
    trigger_type: 'cron',
    trigger_config: { cron: '30 6 * * *', timezone: 'UTC' },
    skill_name: 'check_integrations',
    skill_arguments: { source: 'automation' },
    executor: 'platform',
  },
  {
    name: 'Skill Curator',
    description:
      'Platform automation. Daily at 04:00 UTC (after distill) the Skill Curator reviews how skills failed, drafts instruction improvements and stages them for human approval in /admin/approvals. Deterministic, bounded (max 3 proposals, 14-day cooldown per skill).',
    trigger_type: 'cron',
    trigger_config: { cron: '0 4 * * *', timezone: 'UTC' },
    skill_name: 'run_skill_curator',
    skill_arguments: { source: 'automation' },
    executor: 'platform',
  },
];

/**
 * The platform skill FLOOR: every instance must carry all of these, whatever
 * its module toggles say. Derived from PLATFORM_SKILLS so the floor can never
 * drift from the seeds it describes.
 */
export const PLATFORM_SKILL_NAMES: readonly string[] = PLATFORM_SKILLS.map((s) => s.name);

/**
 * Which platform skills this instance is missing.
 *
 * This is the self-heal CONDITION, kept pure so it can be tested without a DB.
 * It is a *completeness* check over the whole platform layer — deliberately not
 * the presence/absence of one named skill.
 *
 * Why that matters (regression this replaces): the old self-heal fired only when
 * `run_daily_briefing` was ABSENT. That skill is seeded by a migration, so it is
 * present on every instance from birth — the branch was structurally dead and a
 * fresh install came up with 6 skills, no platform cron, and an empty agent
 * surface while the admin UI, public site and chat all looked healthy.
 *
 * A completeness check cannot die that way: it is TRUE (work to do) on a fresh
 * install, and becomes FALSE the moment bootstrapPlatform() has inserted the
 * whole layer — the seeding itself is the marker, so there is no separate flag
 * to go stale. It also re-arms for free when a release adds a platform skill.
 */
export function missingPlatformSkills(presentSkillNames: Iterable<string>): string[] {
  const present = new Set(presentSkillNames);
  return PLATFORM_SKILL_NAMES.filter((name) => !present.has(name));
}

/** Convenience inverse of missingPlatformSkills(). */
export function isPlatformLayerComplete(presentSkillNames: Iterable<string>): boolean {
  return missingPlatformSkills(presentSkillNames).length === 0;
}

/**
 * Seed all platform-level skills and automations.
 * Idempotent — safe to run multiple times. Refreshes definition fields on
 * existing rows so deploys propagate without a manual DB poke.
 */
export async function bootstrapPlatform(): Promise<{
  seededSkills: number;
  seededAutomations: number;
  errors: string[];
}> {
  const result = { seededSkills: 0, seededAutomations: 0, errors: [] as string[] };

  for (const skill of PLATFORM_SKILLS) {
    try {
      const { data: existing } = await supabase
        .from('agent_skills')
        .select('id')
        .eq('name', skill.name)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('agent_skills')
          .update({
            enabled: true,
            mcp_exposed: true,
            description: skill.description,
            instructions: skill.instructions || null,
            tool_definition: skill.tool_definition as Json,
            category: skill.category,
            handler: skill.handler,
            scope: skill.scope,
          })
          .eq('id', existing.id);
      } else {
        const { error } = await supabase.from('agent_skills').insert([
          {
            name: skill.name,
            description: skill.description,
            category: skill.category,
            handler: skill.handler,
            scope: skill.scope,
            tool_definition: skill.tool_definition as Json,
            instructions: skill.instructions || null,
            enabled: true,
            mcp_exposed: true,
            origin: 'bundled' as const,
            trust_level: skill.trust_level ?? ('notify' as const),
          },
        ]);
        if (error) throw error;
      }
      result.seededSkills++;
    } catch (err) {
      const msg = `Platform skill ${skill.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[platform-seeds] ${msg}`);
    }
  }

  for (const auto of PLATFORM_AUTOMATIONS) {
    try {
      const { data: existing } = await supabase
        .from('agent_automations')
        .select('id')
        .eq('name', auto.name)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('agent_automations').insert([
          {
            name: auto.name,
            description: auto.description,
            trigger_type: auto.trigger_type,
            trigger_config: auto.trigger_config as Json,
            skill_name: auto.skill_name,
            skill_arguments: auto.skill_arguments as Json,
            executor: auto.executor ?? 'platform',
            enabled: true,
          },
        ]);
        if (error) throw error;
        result.seededAutomations++;
      }
    } catch (err) {
      const msg = `Platform automation ${auto.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[platform-seeds] ${msg}`);
    }
  }

  logger.log(
    `[platform-seeds] Seeded ${result.seededSkills} platform skills, ${result.seededAutomations} platform automations`
  );
  return result;
}
