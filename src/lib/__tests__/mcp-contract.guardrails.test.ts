import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const mcpServerSource = fs.readFileSync(
  path.join(process.cwd(), 'supabase/functions/mcp-server/index.ts'),
  'utf8',
);

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