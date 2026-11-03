import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

/**
 * Reports — what an agent worked out, as a page a person opens (2026-11-03).
 *
 * FlowPilot, Flowwork and an external agent over MCP all work things out: a
 * quarter's costs, a reconciliation, a pipeline review. A report is that
 * answer as a page behind the staff login — a title, a description, a
 * category, a body (markdown with a few report blocks, or a full HTML page),
 * and every publish a version. The wiki says how things are; a report says
 * what happened, dated, and is never overwritten.
 *
 * The model is AgentReports' (github.com/magnusfroste/agentreports) — the same
 * `publish_report` shape and markdown blocks, so an agent that publishes there
 * publishes here — with the business around it: who may READ a report is the
 * role matrix (the reports module, narrowed by the report's audience_module),
 * and a report can belong to something (a company, a deal, a fiscal year).
 *
 * Agents can add, never take away: there is no archive, restore or rename
 * skill. Those are a person's, in /admin/reports, through person_* functions
 * that refuse the service role. What a person renamed, an agent's next
 * version keeps.
 *
 * Owns: reports, report_versions (20261103150000). Handler: internal:reports
 * in agent-execute, which stamps who published and who asked.
 *
 * @see docs/modules/reports.md
 */

const inputSchema = z.object({ action: z.enum(['get_config']).default('get_config') });
const outputSchema = z.object({ success: z.boolean(), error: z.string().optional() });
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/** The report blocks the reader draws — the same dialect as AgentReports. */
export const REPORT_FORMAT_GUIDE = `Write the report in markdown (format: markdown). Start with "# Title" and one sentence saying what the report answers. Plain markdown works: headings, lists, **bold**, tables, links. Four blocks make it a report:

::kpis
- 3 752 294 kr | Total cost | +8 % on Q2
- 249 | Invoices | 12 scanned
::

::note warn
252 832 kr is not in the books yet.
::
(note kinds: info, ok, warn, bad)

\`\`\`chart bar title="Cost per month" unit="kr"
Month, Transport, Storage
2026-07, 298000, 84000
2026-08, 312000, 86000
\`\`\`
(chart kinds: bar, stacked, line; first column is the axis, the rest are series, numbers without spaces)

::details Method
How the numbers were found, which sources, what was left out.
::

Rules: figures come from a skill you ran, never from memory — say which. Write in the site's language. A report answers one question; link related reports with [title](/admin/reports/<slug>). A full HTML page (format: html) is shown sandboxed: its scripts run but cannot reach the reader's session.`;

const PUBLISH_PARAMS = {
  title: { type: 'string', description: 'What the report answers, as its card shows it: "Q3 2026 — costs".' },
  content: { type: 'string', description: 'The body: markdown with the report blocks (see instructions), or a full HTML page with format: html. Max 2 MB.' },
  format: { type: 'string', enum: ['markdown', 'html'], description: 'Default markdown.' },
  slug: { type: 'string', description: 'The lasting id: publish to the same slug to add a version. Default: made from the title.' },
  description: { type: 'string', description: 'One or two sentences for the card.' },
  category: { type: 'string', description: 'Reuse one from list_reports (categories) — Finance, Sales, Operations, HR …' },
  tags: { type: 'array', items: { type: 'string' } },
  note: { type: 'string', description: 'What changed in this version, for the version list.' },
  expected_version: { type: 'number', description: 'The version you built on (from get_report). A newer one refuses with STALE_VERSION instead of undoing someone else\'s work.' },
  requested_by: { type: 'string', description: 'Who asked, when you are an agent several people talk to. Shown next to your name, never instead of it. A signed-in person is filled in by the platform.' },
  audience_module: { type: 'string', description: 'Narrow who may read it to the roles that module is granted to: accounting for the books, hr for people, deals for the pipeline. Leave out for everyone with Reports.' },
  subject_type: { type: 'string', description: 'What the report belongs to: company, deal, project, contact, fiscal_year, period.' },
  subject_id: { type: 'string', description: 'The id (or the year/period) of that subject.' },
} as const;

const REPORT_SKILLS: SkillSeed[] = [
  {
    name: 'publish_report',
    description:
      'Publish a report — what you worked out (a quarter\'s costs, a reconciliation, a pipeline review, an incident write-up) as a page staff open under Reports, or a new version of one. Every publish is a version; nothing is overwritten. Use when: an answer is worth keeping and reading as a page rather than a chat message; the owner asks for a report, a summary to share or a write-up; you finish recurring analysis (month close, weekly review). NOT for: knowledge about how things are done (the wiki: manage_wiki_page); a customer-facing page (pages); a blog post.',
    category: 'content',
    handler: 'internal:reports',
    scope: 'internal',
    trust_level: 'auto',
    instructions:
      `${REPORT_FORMAT_GUIDE}\n\nPublishing: call list_reports first and reuse a category; to update a report, get_report it, build on its content and publish to the same slug with expected_version. The answer gives the link (/admin/reports/<slug>) — give it to the person. kept_person_fields means a person renamed the report; keep their title. unchanged: true means the content was identical (no new version). Set audience_module for anything a role should not see (accounting for the books, hr for people). You cannot archive, restore or rename a report — tell the person to do it under Reports.`,
    tool_definition: {
      type: 'function',
      risk: 'low',
      reversible: true,
      reversal: 'A person archives the report under Reports, or restores an earlier version; every version is kept.',
      function: {
        name: 'publish_report',
        description: 'Publish a report (markdown with report blocks, or HTML), or a new version of one.',
        parameters: { type: 'object', properties: PUBLISH_PARAMS, required: ['title', 'content'] },
      },
    },
  },
  {
    name: 'list_reports',
    description:
      'List the reports staff can open — title, description, category, version, link — and the categories in use. Use when: before publishing (reuse a category, find the report to update); someone asks what reports exist or for "the latest report on X". NOT for: wiki pages (search_wiki); reading one report (get_report).',
    category: 'content',
    handler: 'internal:reports',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_reports',
        description: 'List reports with their details and links, and the categories in use.',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            search: { type: 'string', description: 'In title, description and tags.' },
            include_archived: { type: 'boolean' },
            subject_type: { type: 'string' },
            subject_id: { type: 'string' },
            limit: { type: 'number', description: 'Default 50, max 200.' },
          },
        },
      },
    },
  },
  {
    name: 'get_report',
    description:
      'Read a report — its content and details, the current or an older version. Use when: building a new version on it; someone asks what a report says; comparing with an earlier version. NOT for: listing reports (list_reports).',
    category: 'content',
    handler: 'internal:reports',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_report',
        description: 'A report\'s content and details, current or an older version.',
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            version: { type: 'number', description: 'Default the current version.' },
          },
          required: ['slug'],
        },
      },
    },
  },
  {
    name: 'list_report_versions',
    description:
      'Every version of a report: when, by whom (and who asked), the note. Use when: someone asks what changed or who published a report; before restoring is suggested to a person. NOT for: the content itself (get_report with version).',
    category: 'content',
    handler: 'internal:reports',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_report_versions',
        description: 'Every version of a report with who published it and the note.',
        parameters: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
      },
    },
  },
  {
    name: 'update_report_details',
    description:
      'Change a report\'s title, description, category or tags without publishing new content. Fields a person set are not changed (not_changed names them). Use when: a report is filed under the wrong category or its card describes it badly. NOT for: new content (publish_report); archiving or restoring (a person does that under Reports).',
    category: 'content',
    handler: 'internal:reports',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      risk: 'low',
      reversible: true,
      reversal: 'Call update_report_details again with the earlier values (get_report shows them).',
      function: {
        name: 'update_report_details',
        description: 'Change a report\'s title, description, category or tags (never what a person set).',
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['slug'],
        },
      },
    },
  },
];

export const reportsModule = defineModule<Input, Output>({
  id: 'reports',
  name: 'Reports',
  version: '1.0.0',
  processes: [],
  maturity: 'L2',
  description:
    'Reports agents publish for people — FlowPilot, Flowwork and external agents over MCP turn what they worked out into versioned pages under Reports, read behind the staff login and narrowed by the role matrix. Agents can add, never take away.',
  capabilities: ['data:read', 'data:write', 'content:receive'],
  tier: 'standard',
  inputSchema,
  outputSchema,
  skills: REPORT_SKILLS.map((s) => s.name),
  data: { tables: ['reports', 'report_versions'] },
  skillSeeds: REPORT_SKILLS,
  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
