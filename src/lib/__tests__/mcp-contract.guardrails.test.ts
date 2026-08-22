import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// MCP server splits its taxonomy across the entrypoint and a shared groups file.
// Concatenate both so guardrails that match literal strings keep working after refactors.
const mcpServerSource =
  fs.readFileSync(path.join(process.cwd(), 'supabase/functions/mcp-server/index.ts'), 'utf8') +
  '\n/* --- shared/mcp/groups.ts --- */\n' +
  fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/mcp/groups.ts'), 'utf8');

describe('MCP contract guardrails', () => {
  it('keeps briefing discoverable in both MCP and REST resource listings', () => {
    expect(mcpServerSource).toContain('uri: "flowwink://briefing"');
    expect(mcpServerSource).toContain('{ key: "briefing"');
    expect(mcpServerSource).toContain('/rest/resources/:key');
  });

  it('keeps business identity data inside briefing', () => {
    expect(mcpServerSource).toContain('.eq("key", "company_profile")');
    expect(mcpServerSource).toContain('.eq("key", "branding")');
    expect(mcpServerSource).toContain('company_profile:');
    expect(mcpServerSource).toContain('branding:');
  });

  // NB: this is a REMOVAL detector only, and a weak one — it greps the
  // concatenated source for literal `"<alias>"` strings from a hand-written
  // list, so it can never notice that a NEW module is missing from
  // SKILL_CATEGORY_MODULES (that is exactly how `email`, `pos`, `shipping`,
  // `wiki`, … drifted out of the map and got their skills hidden on the
  // gateway). Completeness is enforced by DERIVING the truth from the module
  // registry in mcp-category-module-map.guardrails.test.ts — keep that test as
  // the drift guard, not this list.
  it('preserves critical MCP group aliases for module-aware discovery', () => {
    const requiredAliases = [
      'pages',
      'blog',
      'knowledgeBase',
      'mediaLibrary',
      'siteMigration',
      'leads',
      'deals',
      'companies',
      'forms',
      'bookings',
      'projects',
      'salesIntelligence',
      'newsletter',
      'chat',
      'liveSupport',
      'webinars',
      'flowpilot',
      'browserControl',
      'analytics',
      'sla',
      'ecommerce',
      'accounting',
      'expenses',
      'contracts',
      'inventory',
      'purchasing',
      'invoicing',
      'timesheets',
      'paidGrowth',
      'companyInsights',
    ];

    for (const alias of requiredAliases) {
      expect(
        mcpServerSource,
        `${alias} disappeared from SKILL_CATEGORY_MODULES, which breaks module-aware MCP discovery and ?groups=<module> routing`,
      ).toContain(`"${alias}"`);
    }
  });
});