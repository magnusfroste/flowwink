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

const ROOT = path.resolve(import.meta.dir, '..');
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
  sourceFile: string;
}

function parseModuleFile(filePath: string): ModuleInfo | null {
  const src = fs.readFileSync(filePath, 'utf-8');

  const idMatch = src.match(/id:\s*['"]([^'"]+)['"]/);
  const nameMatch = src.match(/name:\s*['"]([^'"]+)['"]/);
  const versionMatch = src.match(/version:\s*['"]([^'"]+)['"]/);
  const descMatch = src.match(/description:\s*['"]([^'"]+)['"]/);
  const capMatch = src.match(/capabilities:\s*\[([^\]]+)\]/);

  if (!idMatch) return null;

  // Extract actions from z.enum
  const actionMatch = src.match(/action:\s*z\.enum\(\[([^\]]+)\]\)/);
  const actions = actionMatch
    ? actionMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) ?? []
    : [];

  // Extract input schema field names (rough)
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
    sourceFile: path.relative(ROOT, filePath),
  };
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

function findMigrations(moduleId: string): string[] {
  const results: string[] = [];
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    for (const f of files) {
      if (f.includes(moduleId) || f.includes(moduleId.replace(/-/g, '_'))) {
        results.push(`supabase/migrations/${f}`);
      }
    }
  } catch { /* no migrations */ }
  return results;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
};

// ---------------------------------------------------------------------------
// 6. Generate markdown
// ---------------------------------------------------------------------------

function generateMarkdown(
  mod: ModuleInfo,
  settings: ModuleSettings | undefined,
  webhookEvents: Array<{ event: string; description: string }>,
  hooks: string[],
  adminPage: string | null,
  blocks: string[],
  migrations: string[],
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
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${mod.name}`);
  lines.push('');
  lines.push(`> ${mod.description || settings?.settingsDescription || 'No description available.'}`);
  lines.push('');

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

  // API Contract
  lines.push('## API Contract');
  lines.push('');
  if (mod.actions.length) {
    lines.push(`**Actions:** ${mod.actions.map(a => `\`${a}\``).join(', ')}`);
    lines.push('');
  }
  if (mod.inputFields.length) {
    lines.push('### Input Fields');
    lines.push('');
    lines.push('| Field | Source |');
    lines.push('|-------|--------|');
    for (const f of mod.inputFields) {
      lines.push(`| \`${f}\` | \`${mod.sourceFile}\` |`);
    }
    lines.push('');
  }
  if (mod.outputFields.length) {
    lines.push('### Output Fields');
    lines.push('');
    lines.push('| Field | Source |');
    lines.push('|-------|--------|');
    for (const f of mod.outputFields) {
      lines.push(`| \`${f}\` | \`${mod.sourceFile}\` |`);
    }
    lines.push('');
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
  for (const m of migrations) {
    lines.push(`| Migration | \`${m}\` |`);
  }
  lines.push('');

  // Contributing
  lines.push('## Contributing');
  lines.push('');
  lines.push('To enhance this module, see [Contributing Guide](../contributing/contributing.md) and [Module API](../reference/module-api.md).');
  lines.push('');
  lines.push('Key rules:');
  lines.push('- Follow `ModuleDefinition<I, O>` contract pattern');
  lines.push('- All schema changes require idempotent migrations');
  lines.push('- Skills must be self-describing (Law 2)');
  lines.push('- Blocks are interfaces, not pipelines (Law 3)');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually.*');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. Main
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

  for (const file of moduleFiles) {
    const mod = parseModuleFile(path.join(MODULES_SRC, file));
    if (!mod) {
      console.warn(`⚠ Could not parse: ${file}`);
      continue;
    }

    if (filterModule && mod.id !== filterModule) continue;

    const settingsKey = MODULE_ID_TO_SETTINGS_KEY[mod.id] ?? mod.id;
    const settings = allSettings[settingsKey];
    const webhookEvents = allWebhooks[settingsKey] ?? [];
    const hooks = findHooks(mod.id, mod.name);
    const adminPage = findAdminPage(mod.name, mod.id);
    const blocks = findBlocks(mod.name);
    const migrations = findMigrations(mod.id);

    const markdown = generateMarkdown(mod, settings, webhookEvents, hooks, adminPage, blocks, migrations);
    const outFile = path.join(OUTPUT_DIR, `${mod.id}.md`);
    fs.writeFileSync(outFile, markdown, 'utf-8');

    generated++;
    summary.push({ id: mod.id, file: `docs/modules/${mod.id}.md` });
  }

  console.log(`\n✅ Generated ${generated} module docs:\n`);
  for (const s of summary) {
    console.log(`   ${s.id.padEnd(20)} → ${s.file}`);
  }
  console.log('');
}

main();
