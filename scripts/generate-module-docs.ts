#!/usr/bin/env bun
/**
 * Auto-generate per-module documentation from code sources.
 *
 * Sources introspected:
 *   1. src/lib/modules/<id>-module.ts   → ModuleDefinition (id, description, capabilities, schemas)
 *   2. src/hooks/useModules.tsx          → defaultModulesSettings (category, integrations, autonomy)
 *   3. src/lib/module-webhook-events.ts  → webhook events per module
 *   4. src/hooks/use<Name>.ts            → hooks (API surface)
 *   5. src/pages/admin/<Name>Page.tsx    → admin page
 *   6. src/components/public/blocks/     → public blocks
 *   7. supabase/migrations/             → data model (tables owned)
 *
 * Output: docs/modules/<id>.md per module
 *
 * Usage:
 *   bun run scripts/generate-module-docs.ts
 *   bun run scripts/generate-module-docs.ts --module invoicing
 */

import * as fs from 'fs';
import * as path from 'path';

// import.meta.dirname: Bun and Node alike, and defined under vitest — the guard
// test imports summarise()/sameExceptDate() from here. (`import.meta.dir` is
// Bun-only and left the test with ROOT = undefined.)
const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const MODULES_SRC = path.join(ROOT, 'src/lib/modules');
const HOOKS_DIR = path.join(ROOT, 'src/hooks');
const ADMIN_PAGES = path.join(ROOT, 'src/pages/admin');
const PUBLIC_BLOCKS = path.join(ROOT, 'src/components/public/blocks');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const OUTPUT_DIR = path.join(ROOT, 'docs/modules');

// ---------------------------------------------------------------------------
// 1. Parse module definition files
// ---------------------------------------------------------------------------

interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  inputFields: string[];
  outputFields: string[];
  actions: string[];
  skills: SkillInfo[];
  sourceFile: string;
}

interface SkillInfo {
  name: string;
  description: string;
  category?: string;
  scope?: string;
}

function parseModuleFile(filePath: string): ModuleInfo | null {
  const src = fs.readFileSync(filePath, 'utf-8');

  // Extract the defineModule({ ... }) block to scope our matches and avoid
  // collisions with tool_definition.function.name etc.
  const defBlock = extractDefineModuleBlock(src) ?? src;

  const idMatch = defBlock.match(/id:\s*['"]([^'"]+)['"]/);
  const nameMatch = defBlock.match(/^\s*name:\s*['"]([^'"]+)['"]/m);
  const versionMatch = defBlock.match(/version:\s*['"]([^'"]+)['"]/);
  const descMatch = defBlock.match(/description:\s*['"]([^'"]+)['"]/);
  const capMatch = defBlock.match(/capabilities:\s*\[([^\]]+)\]/);

  if (!idMatch) return null;

  // Extract actions from z.enum (search whole file — schema lives outside defineModule)
  const actionMatch = src.match(/action:\s*z\.enum\(\[([\s\S]*?)\]\)/);
  const actions = actionMatch
    ? actionMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) ?? []
    : [];

  // Extract input/output schema field names (rough)
  const inputFields = extractSchemaFields(src, /InputSchema|inputSchema/);
  const outputFields = extractSchemaFields(src, /OutputSchema|outputSchema/);

  return {
    id: idMatch[1],
    name: nameMatch?.[1] ?? idMatch[1],
    version: versionMatch?.[1] ?? '1.0.0',
    description: descMatch?.[1] ?? '',
    capabilities: capMatch
      ? capMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) ?? []
      : [],
    inputFields,
    outputFields,
    actions,
    skills: extractSkillSeeds(src),
    sourceFile: path.relative(ROOT, filePath),
  };
}

/**
 * Extract skillSeeds from a module file. Each seed has at minimum `name` and
 * `description`. We do a tolerant parse — name + description per seed object.
 */
function extractSkillSeeds(src: string): SkillInfo[] {
  const seeds: SkillInfo[] = [];
  // Match the SKILL_SEEDS or *Skills array definition body
  const arrMatch = src.match(/(?:SKILLS?|skillSeeds|_SKILLS|Skills)[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!arrMatch) return seeds;
  const body = arrMatch[1];

  // Split into top-level objects {  } at depth 1
  let depth = 0;
  let start = -1;
  const objects: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(body.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (const obj of objects) {
    const nameM = obj.match(/\bname:\s*['"]([^'"]+)['"]/);
    if (!nameM) continue;
    // description may be a backtick template, single, or double quote string
    const descM =
      obj.match(/\bdescription:\s*`([^`]+)`/) ||
      obj.match(/\bdescription:\s*'([^']+)'/) ||
      obj.match(/\bdescription:\s*"([^"]+)"/);
    const catM = obj.match(/\bcategory:\s*['"]([^'"]+)['"]/);
    const scopeM = obj.match(/\bscope:\s*['"]([^'"]+)['"]/);

    seeds.push({
      name: nameM[1],
      description: descM?.[1]?.replace(/\s+/g, ' ').trim() ?? '',
      category: catM?.[1],
      scope: scopeM?.[1],
    });
  }
  return seeds;
}

function extractDefineModuleBlock(src: string): string | null {
  // Find a `defineModule(...)` call (not the import statement). The call is
  // typically `defineModule<...>({ ... })` or `defineModule({ ... })`.
  const callRe = /defineModule\s*(?:<[^>]*>)?\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src)) !== null) {
    // Skip matches inside import statements
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const lineEnd = src.indexOf('\n', m.index);
    const line = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
    if (/^\s*import\b/.test(line)) continue;

    const open = m.index + m[0].length - 1; // position of `{`
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return src.slice(open, i + 1);
      }
    }
  }
  return null;
}

function extractSchemaFields(src: string, pattern: RegExp): string[] {
  // Find the Zod object definition for the schema
  const lines = src.split('\n');
  const fields: string[] = [];
  let inside = false;
  let depth = 0;

  for (const line of lines) {
    if (pattern.test(line) && line.includes('z.object')) {
      inside = true;
      depth = 0;
    }
    if (inside) {
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;

      const fieldMatch = line.match(/^\s+(\w+):\s*z\./);
      if (fieldMatch) {
        fields.push(fieldMatch[1]);
      }

      if (depth <= 0 && fields.length > 0) break;
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// 2. Parse defaultModulesSettings
// ---------------------------------------------------------------------------

interface ModuleSettings {
  category: string;
  autonomy: string;
  requiredIntegrations: string[];
  optionalIntegrations: string[];
  core: boolean;
  settingsDescription: string;
  icon: string;
}

function parseModulesSettings(): Record<string, ModuleSettings> {
  const src = fs.readFileSync(path.join(HOOKS_DIR, 'useModules.tsx'), 'utf-8');
  const result: Record<string, ModuleSettings> = {};

  // Split by module blocks within defaultModulesSettings
  const settingsMatch = src.match(/defaultModulesSettings:\s*ModulesSettings\s*=\s*\{([\s\S]*?)^};/m);
  if (!settingsMatch) return result;

  const body = settingsMatch[1];
  // Match each module key and its block
  const modulePattern = /(\w+):\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  let m: RegExpExecArray | null;

  while ((m = modulePattern.exec(body)) !== null) {
    const key = m[1];
    const block = m[2];

    const cat = block.match(/category:\s*['"]([^'"]+)['"]/)?.[1] ?? 'system';
    const auto = block.match(/autonomy:\s*['"]([^'"]+)['"]/)?.[1] ?? 'config-required';
    const desc = block.match(/description:\s*['"]([^'"]+)['"]/)?.[1] ?? '';
    const icon = block.match(/icon:\s*['"]([^'"]+)['"]/)?.[1] ?? '';
    const core = /core:\s*true/.test(block);

    const reqMatch = block.match(/requiredIntegrations:\s*\[([^\]]*)\]/);
    const optMatch = block.match(/optionalIntegrations:\s*\[([^\]]*)\]/);

    const extractArr = (s: string | undefined) =>
      s ? s.match(/'([^']+)'/g)?.map(x => x.replace(/'/g, '')) ?? [] : [];

    result[key] = {
      category: cat,
      autonomy: auto,
      settingsDescription: desc,
      icon,
      core,
      requiredIntegrations: extractArr(reqMatch?.[1]),
      optionalIntegrations: extractArr(optMatch?.[1]),
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// 3. Parse webhook events
// ---------------------------------------------------------------------------

function parseWebhookEvents(): Record<string, Array<{ event: string; description: string }>> {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/module-webhook-events.ts'), 'utf-8');
  const result: Record<string, Array<{ event: string; description: string }>> = {};

  const blockPattern = /(\w+):\s*\[([\s\S]*?)\],/g;
  let m: RegExpExecArray | null;

  while ((m = blockPattern.exec(src)) !== null) {
    const key = m[1];
    const events: Array<{ event: string; description: string }> = [];

    const entryPattern = /event:\s*'([^']+)'.*?description:\s*'([^']+)'/g;
    let e: RegExpExecArray | null;
    while ((e = entryPattern.exec(m[2])) !== null) {
      events.push({ event: e[1], description: e[2] });
    }

    result[key] = events;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 4. Discover hooks, admin pages, blocks, migrations
// ---------------------------------------------------------------------------

function findHooks(moduleId: string, moduleName: string): string[] {
  const hooks: string[] = [];
  const patterns = [
    `use${moduleName}.ts`,
    `use${moduleName}.tsx`,
    `use${moduleName}s.ts`,
    `use${moduleName}s.tsx`,
    `use${capitalize(moduleId)}.ts`,
    `use${capitalize(moduleId)}.tsx`,
    `use${capitalize(moduleId)}s.ts`,
    `use${capitalize(moduleId)}s.tsx`,
  ];

  for (const p of new Set(patterns)) {
    const full = path.join(HOOKS_DIR, p);
    if (fs.existsSync(full)) {
      hooks.push(`src/hooks/${p}`);
    }
  }
  return hooks;
}

function findAdminPage(moduleName: string, moduleId: string): string | null {
  const patterns = [
    `${moduleName}Page.tsx`,
    `${moduleName}sPage.tsx`,
    `${capitalize(moduleId)}Page.tsx`,
    `${capitalize(moduleId)}sPage.tsx`,
  ];

  for (const p of new Set(patterns)) {
    if (fs.existsSync(path.join(ADMIN_PAGES, p))) {
      return `src/pages/admin/${p}`;
    }
  }
  return null;
}

function findBlocks(moduleName: string): string[] {
  const blocks: string[] = [];
  try {
    const files = fs.readdirSync(PUBLIC_BLOCKS);
    for (const f of files) {
      if (f.toLowerCase().includes(moduleName.toLowerCase()) && f.endsWith('Block.tsx')) {
        blocks.push(`src/components/public/blocks/${f}`);
      }
    }
  } catch { /* no blocks dir */ }
  return blocks;
}

/** The words of a migration filename after its timestamp: "20260708030000_sla-parity-r6.sql" → sla, parity, r6. */
export function migrationWords(filename: string): string[] {
  return filename.replace(/^\d{14}_/, '').replace(/\.sql$/, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * A migration belongs to a module when every word of the module id is a whole
 * word of the filename. Substring matching put
 * 20261002200000_villkorslanken-… under the SLA module — "villkor-sla-nken".
 */
export function migrationBelongsTo(filename: string, moduleId: string): boolean {
  const words = new Set(migrationWords(filename));
  const idWords = moduleId.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return idWords.length > 0 && idWords.every((w) => words.has(w));
}

function findMigrations(moduleId: string): string[] {
  const results: string[] = [];
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    for (const f of files) {
      if (migrationBelongsTo(f, moduleId)) results.push(`supabase/migrations/${f}`);
    }
  } catch { /* no migrations */ }
  return results;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// 4b. Extract table names from migrations
// ---------------------------------------------------------------------------

function extractTablesFromMigrations(migrationPaths: string[]): string[] {
  const tables = new Set<string>();
  for (const rel of migrationPaths) {
    try {
      const sql = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
      // Schema qualifier is optional and may be quoted ("public".foo) — strip it
      // before capturing, otherwise the schema name gets reported as the table.
      const matches = sql.matchAll(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?public["`]?\s*\.\s*)?["`]?(\w+)["`]?/gi,
      );
      for (const m of matches) {
        const name = m[1].toLowerCase();
        if (name === 'public') continue; // defensive: never report the schema
        tables.add(m[1]);
      }
    } catch { /* ignore */ }
  }
  return [...tables].sort();
}


// ---------------------------------------------------------------------------
// 4c. Map module → end-to-end processes it participates in
// ---------------------------------------------------------------------------

const MODULE_TO_PROCESSES: Record<string, string[]> = {
  // CRM / Sales
  forms: ['lead-to-customer'],
  crm: ['lead-to-customer'],
  leads: ['lead-to-customer'],
  companies: ['lead-to-customer'],
  'sales-intelligence': ['lead-to-customer'],
  deals: ['lead-to-customer', 'quote-to-cash'],
  newsletter: ['lead-to-customer', 'content-to-conversion'],
  // Quote-to-cash
  quotes: ['quote-to-cash'],
  invoicing: ['quote-to-cash'],
  subscriptions: ['quote-to-cash'],
  // Order-to-delivery
  products: ['order-to-delivery'],
  orders: ['order-to-delivery'],
  inventory: ['order-to-delivery', 'procure-to-pay'],
  // Procure-to-pay
  purchasing: ['procure-to-pay'],
  expenses: ['procure-to-pay', 'record-to-report'],
  // Record-to-report
  accounting: ['record-to-report'],
  reconciliation: ['record-to-report'],
  // Hire-to-retire
  hr: ['hire-to-retire'],
  recruitment: ['hire-to-retire'],
  contracts: ['hire-to-retire'],
  timesheets: ['hire-to-retire', 'quote-to-cash'],
  // Content
  pages: ['content-to-conversion'],
  blog: ['content-to-conversion'],
  kb: ['content-to-conversion', 'support-to-resolution'],
  // Support
  tickets: ['support-to-resolution'],
  'live-support': ['support-to-resolution'],
  sla: ['support-to-resolution'],
  // Cross-cutting
  documents: ['hire-to-retire', 'procure-to-pay'],
  approvals: ['procure-to-pay', 'quote-to-cash'],
  projects: ['quote-to-cash'],
};

// ---------------------------------------------------------------------------
// 5. Map module ID ↔ settings key
// ---------------------------------------------------------------------------

const MODULE_ID_TO_SETTINGS_KEY: Record<string, string> = {
  blog: 'blog',
  newsletter: 'newsletter',
  crm: 'leads',
  pages: 'pages',
  kb: 'knowledgeBase',
  products: 'ecommerce',
  booking: 'bookings',
  'global-blocks': 'globalElements',
  media: 'mediaLibrary',
  deals: 'deals',
  companies: 'companies',
  forms: 'forms',
  orders: 'ecommerce',
  webinars: 'webinars',
  'sales-intelligence': 'salesIntelligence',
  resume: 'resume',
  'browser-control': 'browserControl',
  growth: 'paidGrowth',
  federation: 'federation',
  composio: 'composio',
  tickets: 'tickets',
  'site-migration': 'siteMigration',
  templates: 'templates',
  developer: 'developer',
  invoicing: 'invoicing',
  accounting: 'accounting',
  expenses: 'expenses',
  handbook: 'handbook',
  timesheets: 'timesheets',
  inventory: 'inventory',
  purchasing: 'purchasing',
  sla: 'sla',
  contracts: 'contracts',
  hr: 'hr',
  documents: 'documents',
  projects: 'projects',
  recruitment: 'recruitment',
  approvals: 'approvals',
  reconciliation: 'reconciliation',
  quotes: 'quotes',
  email: 'email',
  subscriptions: 'subscriptions',
  flowpilot: 'flowpilot',
  chat: 'chat',
  'company-insights': 'companyInsights',
  'live-support': 'liveSupport',
  analytics: 'analytics',
  calendar: 'calendar',
};

// ---------------------------------------------------------------------------
// 6. Generate markdown
// ---------------------------------------------------------------------------

/**
 * The skills table — the one section a hand-written module page can never keep
 * true by hand. Generated pages get it inline; `manual: true` pages get it
 * between GENERATED_SKILLS markers (see upsertGeneratedSkills), so prose stays
 * the author's and the skill list stays the code's.
 */
function renderSkillsSection(mod: ModuleInfo): string[] {
  const lines: string[] = [];
  if (mod.skills.length) {
    lines.push('## Skills');
    lines.push('');
    lines.push('These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.');
    lines.push('External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.');
    lines.push('');
    lines.push('| Skill | Scope | Description |');
    lines.push('|-------|-------|-------------|');
    for (const s of mod.skills) {
      const desc = s.description.length > 200 ? s.description.slice(0, 197) + '…' : s.description;
      lines.push(`| \`${s.name}\` | ${s.scope ?? '—'} | ${desc} |`);
    }
    lines.push('');
  }
  return lines;
}

const GEN_START = '<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->';
const GEN_END = '<!-- generated:skills:end -->';

/** Insert or replace the generated skills block in a manual page. */
function upsertGeneratedSkills(existing: string, mod: ModuleInfo): string {
  const body = [GEN_START, ...renderSkillsSection(mod), GEN_END].join('\n');
  const start = existing.indexOf(GEN_START);
  const end = existing.indexOf(GEN_END);
  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + body + existing.slice(end + GEN_END.length);
  }
  // No block yet: a manual page written before the markers existed. Append,
  // before a trailing "auto-generated" footer if one is there.
  return existing.replace(/\s*$/, '') + '\n\n' + body + '\n';
}

/**
 * One summary sentence for frontmatter — the same reduction the frontmatter
 * normaliser applies (scripts/normalize-doc-frontmatter.ts, clean()), so the two
 * scripts agree byte for byte: markdown stripped, first sentence when long,
 * capped at 180 chars, double quotes turned single.
 */
export function summarise(text: string): string {
  let out = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = out.search(/(?<=[.!?])\s/);
  if (stop > 40) out = out.slice(0, stop + 1).trimEnd(); // the slice kept the space after the full stop (sla.md, 2026-10-02)
  if (out.length > 180) out = `${out.slice(0, 177).trimEnd()}…`;
  return out.replace(/"/g, "'");
}

const GENERATED_AT_LINE = /^generated_at: "\d{4}-\d{2}-\d{2}"$/m;

/**
 * The date says when the CONTENT last changed, not when the script last ran.
 * Regenerating an unchanged page used to bump generated_at on every file and
 * turn a one-module rename into a 57-file diff (2026-10-02). When the only
 * difference is the date, the file on disk is kept as it is.
 */
export function sameExceptDate(a: string, b: string): boolean {
  return a.replace(GENERATED_AT_LINE, '') === b.replace(GENERATED_AT_LINE, '');
}

function writeUnlessUnchanged(outFile: string, markdown: string): boolean {
  if (fs.existsSync(outFile) && sameExceptDate(fs.readFileSync(outFile, 'utf-8'), markdown)) return false;
  fs.writeFileSync(outFile, markdown, 'utf-8');
  return true;
}

function generateMarkdown(
  mod: ModuleInfo,
  settings: ModuleSettings | undefined,
  webhookEvents: Array<{ event: string; description: string }>,
  hooks: string[],
  adminPage: string | null,
  blocks: string[],
  migrations: string[],
  tables: string[],
  processes: string[],
): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: "${mod.name} Module"`);
  lines.push(`module_id: "${mod.id}"`);
  lines.push(`version: "${mod.version}"`);
  lines.push(`category: "${settings?.category ?? 'system'}"`);
  lines.push(`autonomy: "${settings?.autonomy ?? 'config-required'}"`);
  lines.push(`generated: true`);
  lines.push(`generated_at: "${new Date().toISOString().split('T')[0]}"`);
  // The docs portal reads `description` from frontmatter. Until 2026-10-02 this
  // generator did not write it; scripts/normalize-doc-frontmatter.ts added it
  // afterwards from the lead line — and every regeneration deleted it again.
  // Two writers of one frontmatter. Now the generator writes the same text the
  // normaliser would derive (summarise() mirrors its clean()), so the second
  // writer has nothing left to add.
  const lead = mod.description || settings?.settingsDescription || 'No description available.';
  lines.push(`description: ${summarise(lead)}`);
  lines.push('---');
  lines.push('');

  // Title + lead
  lines.push(`# ${mod.name}`);
  lines.push('');
  lines.push(`> ${lead}`);
  lines.push('');

  // What it gives you (high-signal one-liner)
  const skillCount = mod.skills.length;
  const tableCount = tables.length;
  const blockCount = blocks.length;
  const summaryParts: string[] = [];
  if (skillCount) summaryParts.push(`**${skillCount} agent skill${skillCount === 1 ? '' : 's'}**`);
  if (tableCount) summaryParts.push(`**${tableCount} database table${tableCount === 1 ? '' : 's'}**`);
  if (blockCount) summaryParts.push(`**${blockCount} public block${blockCount === 1 ? '' : 's'}**`);
  if (adminPage) summaryParts.push('an **admin UI**');
  if (summaryParts.length) {
    lines.push(`Ships with ${summaryParts.join(', ')}.`);
    lines.push('');
  }

  // Quick facts
  lines.push('## Quick Facts');
  lines.push('');
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| **Module ID** | \`${mod.id}\` |`);
  lines.push(`| **Version** | ${mod.version} |`);
  lines.push(`| **Category** | ${settings?.category ?? '—'} |`);
  lines.push(`| **Autonomy** | ${settings?.autonomy ?? '—'} |`);
  lines.push(`| **Core** | ${settings?.core ? 'Yes' : 'No'} |`);
  lines.push(`| **Capabilities** | ${mod.capabilities.map(c => `\`${c}\``).join(', ') || '—'} |`);
  lines.push(`| **MCP-exposed skills** | ${skillCount || '—'} |`);
  lines.push(`| **Owns tables** | ${tableCount || '—'} |`);
  lines.push('');

  // Integrations
  if (settings?.requiredIntegrations.length || settings?.optionalIntegrations.length) {
    lines.push('## Integrations');
    lines.push('');
    if (settings.requiredIntegrations.length) {
      lines.push(`**Required:** ${settings.requiredIntegrations.map(i => `\`${i}\``).join(', ')}`);
    }
    if (settings.optionalIntegrations.length) {
      lines.push(`**Optional:** ${settings.optionalIntegrations.map(i => `\`${i}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push(...renderSkillsSection(mod));

  // Database tables owned
  if (tables.length) {
    lines.push('## Data Model');
    lines.push('');
    lines.push('Tables created by this module (from migrations):');
    lines.push('');
    for (const t of tables) lines.push(`- \`public.${t}\``);
    lines.push('');
    lines.push('All tables ship with Row-Level Security policies. See migration files for the exact rules.');
    lines.push('');
  }

  // API Contract
  if (mod.actions.length || mod.inputFields.length || mod.outputFields.length) {
    lines.push('## Module API Contract');
    lines.push('');
    if (mod.actions.length) {
      lines.push(`**Actions:** ${mod.actions.map(a => `\`${a}\``).join(', ')}`);
      lines.push('');
    }
    if (mod.inputFields.length) {
      lines.push(`**Input fields:** ${mod.inputFields.map(f => `\`${f}\``).join(', ')}`);
      lines.push('');
    }
    if (mod.outputFields.length) {
      lines.push(`**Output fields:** ${mod.outputFields.map(f => `\`${f}\``).join(', ')}`);
      lines.push('');
    }
  }

  // Webhook Events
  if (webhookEvents.length) {
    lines.push('## Webhook Events');
    lines.push('');
    lines.push('These events can be subscribed to via Developer → Webhooks or n8n.');
    lines.push('');
    lines.push('| Event | Description |');
    lines.push('|-------|-------------|');
    for (const e of webhookEvents) {
      lines.push(`| \`${e.event}\` | ${e.description} |`);
    }
    lines.push('');
  }

  // Related processes
  if (processes.length) {
    lines.push('## Used in Processes');
    lines.push('');
    lines.push('This module participates in the following end-to-end business processes:');
    lines.push('');
    for (const p of processes) {
      lines.push(`- [${p}](../processes/${p}.md)`);
    }
    lines.push('');
  }

  // File Map
  lines.push('## File Map');
  lines.push('');
  lines.push('| Purpose | Path |');
  lines.push('|---------|------|');
  lines.push(`| Module definition | \`${mod.sourceFile}\` |`);
  for (const h of hooks) {
    lines.push(`| Hook | \`${h}\` |`);
  }
  if (adminPage) {
    lines.push(`| Admin page | \`${adminPage}\` |`);
  }
  for (const b of blocks) {
    lines.push(`| Public block | \`${b}\` |`);
  }
  if (migrations.length) {
    const shown = migrations.slice(0, 5);
    for (const m of shown) lines.push(`| Migration | \`${m}\` |`);
    if (migrations.length > shown.length) {
      lines.push(`| … | _${migrations.length - shown.length} more migration${migrations.length - shown.length === 1 ? '' : 's'}_ |`);
    }
  }
  lines.push('');

  // Contributing
  lines.push('## Contributing');
  lines.push('');
  lines.push('To enhance this module, see [Contributing Guide](../contributing/contributing.md).');
  lines.push('');
  lines.push('Key rules:');
  lines.push('- Follow `ModuleDefinition<I, O>` contract pattern');
  lines.push('- All schema changes require idempotent migrations');
  lines.push('- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))');
  lines.push('- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))');
  lines.push('- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. Catalog (docs/modules/index.md)
// ---------------------------------------------------------------------------

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  autonomy: string;
  skillCount: number;
  tableCount: number;
  doc: string;
}

/**
 * The catalog used to be hand-written (docs/modules/overview.md) and went stale
 * within weeks — wrong module names, dead links, missing modules. It is derived
 * from code now so it cannot drift.
 */
function cleanDescription(desc: string): string {
  // Descriptions are regex-scraped from source, so a truncated escape (\\) or a
  // pipe would break the table. Keep the first sentence — the catalog is a
  // scannable list, the module doc carries the detail.
  const flat = desc.replace(/\\+$/, '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  if (flat.length <= 140) return flat || '—';
  const cut = flat.slice(0, 140);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : 140)}…`;
}

function generateCatalog(entries: CatalogEntry[]): string {
  const byCategory = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    const list = byCategory.get(e.category) ?? [];
    list.push(e);
    byCategory.set(e.category, list);
  }

  const totalSkills = entries.reduce((n, e) => n + e.skillCount, 0);
  const lines: string[] = [];
  lines.push('---');
  lines.push('title: "Module catalog"');
  lines.push(
    'description: Every FlowWink module — category, autonomy level, skill count and owned tables. Generated from code.',
  );
  lines.push('category: modules');
  lines.push('generated: true');
  lines.push('---');
  lines.push('');
  lines.push('# Module catalog');
  lines.push('');
  lines.push(
    `${entries.length} modules across ${byCategory.size} categories, ${totalSkills} module-owned skills.`,
  );
  lines.push(
    'Platform skills (search_web, manage_site_settings, briefings…) are not owned by a module — see [`src/lib/platform-seeds.ts`](../reference/skills-source.md).',
  );
  lines.push('');
  lines.push('**How a module behaves**');
  lines.push('');
  lines.push('```text');
  lines.push('Enable  → seedData() → skills registered in agent_skills → automations armed');
  lines.push('Disable → skills disabled → automations disarmed (data is preserved)');
  lines.push('```');
  lines.push('');
  lines.push(
    'With FlowPilot off, a module is a normal admin UI. With FlowPilot on, the same module is operable by the agent through its skills. Autonomy column:',
  );
  lines.push('');
  lines.push('| Autonomy | Meaning |');
  lines.push('|---|---|');
  lines.push('| `agent-capable` | FlowPilot can operate the module through its skills |');
  lines.push('| `view-required` | Data is agent-readable; changes happen in the admin UI |');
  lines.push('| `config-required` | Needs an integration or setting before it does anything |');
  lines.push('');

  for (const category of [...byCategory.keys()].sort()) {
    const list = byCategory.get(category)!.sort((a, b) => a.name.localeCompare(b.name));
    lines.push(`## ${category.charAt(0).toUpperCase()}${category.slice(1)}`);
    lines.push('');
    lines.push('| Module | Autonomy | Skills | What it does |');
    lines.push('|---|---|---:|---|');
    for (const e of list) {
      lines.push(
        `| [**${e.name}**](./${e.doc}) | ${e.autonomy} | ${e.skillCount} | ${cleanDescription(e.description)} |`,
      );
    }
    lines.push('');
  }

  // Hand-written companions (deep dives) live beside the generated pages. List
  // them so they are reachable — an unlinked doc is an unread doc.
  const generatedFiles = new Set([...entries.map((e) => e.doc), 'index.md']);
  const companions = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('.md') && !generatedFiles.has(f))
    .sort();
  if (companions.length) {
    lines.push('## Deep dives (hand-maintained)');
    lines.push('');
    lines.push('Longer companions to the generated pages above — design rationale, playbooks, operational detail.');
    lines.push('');
    for (const f of companions) {
      const raw = fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8');
      const title = raw.match(/^title:\s*"?([^"\n]+)"?$/m)?.[1] ?? f.replace(/\.md$/, '');
      lines.push(`- [${title.trim()}](./${f})`);
    }
    lines.push('');
  }

  lines.push('---');

  lines.push('');
  lines.push(
    '*Auto-generated by `scripts/generate-module-docs.ts`. Do not edit — re-run the script after changing a module definition.*',
  );
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 8. Main
// ---------------------------------------------------------------------------

function main() {
  const filterModule = process.argv.find((_, i, a) => a[i - 1] === '--module');

  // Ensure output dir exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Parse sources
  const allSettings = parseModulesSettings();
  const allWebhooks = parseWebhookEvents();

  // Find all module files
  const moduleFiles = fs.readdirSync(MODULES_SRC)
    .filter(f => f.endsWith('-module.ts') && f !== 'index.ts' && f !== 'helpers.ts');

  let generated = 0;
  const summary: Array<{ id: string; file: string }> = [];
  const catalog: CatalogEntry[] = [];

  for (const file of moduleFiles) {
    const mod = parseModuleFile(path.join(MODULES_SRC, file));
    if (!mod) {
      console.warn(`⚠ Could not parse: ${file}`);
      continue;
    }

    const settingsKey = MODULE_ID_TO_SETTINGS_KEY[mod.id] ?? mod.id;
    const settings = allSettings[settingsKey];
    const webhookEvents = allWebhooks[settingsKey] ?? [];
    const hooks = findHooks(mod.id, mod.name);
    const adminPage = findAdminPage(mod.name, mod.id);
    const blocks = findBlocks(mod.name);
    const migrations = findMigrations(mod.id);
    const tables = extractTablesFromMigrations(migrations);
    const processes = MODULE_TO_PROCESSES[mod.id] ?? [];
    const kebabId = mod.id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

    // The catalog covers every module regardless of --module filtering, so a
    // single-module run never truncates it.
    catalog.push({
      id: mod.id,
      name: mod.name,
      description: mod.description,
      category: settings?.category ?? 'system',
      autonomy: settings?.autonomy ?? 'config-required',
      skillCount: mod.skills.length,
      tableCount: tables.length,
      doc: `${kebabId}.md`,
    });

    if (filterModule && mod.id !== filterModule) continue;

    const markdown = generateMarkdown(mod, settings, webhookEvents, hooks, adminPage, blocks, migrations, tables, processes);
    const outFile = path.join(OUTPUT_DIR, `${kebabId}.md`);

    // Skip files marked as manually maintained (frontmatter: manual: true)
    if (fs.existsSync(outFile)) {
      const existing = fs.readFileSync(outFile, 'utf-8');
      const fmMatch = existing.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch && /\bmanual:\s*true\b/.test(fmMatch[1])) {
        // Prose is the author's; the skills table is the code's.
        const updated = upsertGeneratedSkills(existing, mod);
        if (updated !== existing) fs.writeFileSync(outFile, updated, 'utf-8');
        summary.push({ id: mod.id, file: `docs/modules/${kebabId}.md (manual — skills block refreshed)` });
        continue;
      }
    }

    const wrote = writeUnlessUnchanged(outFile, markdown);

    generated++;
    summary.push({ id: mod.id, file: `docs/modules/${kebabId}.md${wrote ? '' : ' (unchanged)'}` });
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.md'), generateCatalog(catalog), 'utf-8');

  console.log(`\n✅ Generated ${generated} module docs + catalog (docs/modules/index.md):\n`);
  for (const s of summary) {
    console.log(`   ${s.id.padEnd(20)} → ${s.file}`);
  }
  console.log('');
}


// Import-safe: the guard test imports summarise()/sameExceptDate() from this file
// and must not regenerate the docs by doing so (same guard as the other
// generators). Only a direct `bun run scripts/generate-module-docs.ts` runs main().
if (typeof process !== 'undefined' && process.argv[1] && /generate-module-docs/.test(process.argv[1])) {
  main();
}
