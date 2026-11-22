/**
 * Configuration a person sets in the admin, an agent can set too (2026-11-22).
 *
 * The settings catalogue (#1079) covered site_settings; a review of the admin
 * found configuration TABLES no skill reached: quote and deal templates,
 * product categories, units, expense rates, tags, bank accounts, webhooks and
 * the role → module matrix. Each now has a generic table skill — and the three
 * that move money, data or access wait for a person when nobody is at the
 * keyboard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const core = read('supabase/functions/_shared/execute/core.ts');
const seedsText = ['src/lib/platform-seeds.ts', ...['quotes', 'products', 'deals', 'expenses', 'reconciliation', 'crm'].map((m) => `src/lib/modules/${m}-module.ts`)]
  .map(read).join('\n');

const SKILLS: Array<[string, string]> = [
  ['manage_quote_template', 'quote_templates'],
  ['manage_product_category', 'product_categories'],
  ['manage_uom_category', 'uom_categories'],
  ['manage_deal_template', 'deal_templates'],
  ['manage_expense_rate', 'expense_rate_tables'],
  ['manage_tag', 'tags'],
  ['manage_bank_account', 'bank_accounts'],
  ['manage_webhook', 'webhooks'],
  ['manage_role_access', 'role_module_access'],
];

function seedOf(name: string): string {
  const at = seedsText.indexOf(`    name: '${name}',\n    description:`);
  expect(at, `${name} has a seed`).toBeGreaterThan(-1);
  return seedsText.slice(at, seedsText.indexOf('\n  },\n', at));
}

describe('every configuration table has a skill', () => {
  it.each(SKILLS)('%s reaches %s through the generic engine', (name, table) => {
    expect(seedOf(name)).toContain(`handler: 'db:${table}'`);
    const allowed = core.slice(core.indexOf('const GENERIC_CRUD_TABLES = new Set(['), core.indexOf(']);', core.indexOf('const GENERIC_CRUD_TABLES')));
    expect(allowed).toContain(`'${table}'`);
  });

  it('each says when to use it and when not', () => {
    for (const [name] of SKILLS) expect(seedOf(name)).toMatch(/Use when:[\s\S]+NOT for:/);
  });
});

describe('what moves money, data or access waits for a person', () => {
  it('a bank account and a webhook are high-risk writes (unattended → approve)', () => {
    expect(seedOf('manage_bank_account')).toMatch(/risk: 'high'/);
    expect(seedOf('manage_webhook')).toMatch(/risk: 'high'/);
  });
  it('the role matrix always waits for a person', () => {
    expect(seedOf('manage_role_access')).toMatch(/trust_level: 'approve'/);
    expect(seedOf('manage_role_access')).toMatch(/enum: \['list', 'create', 'delete'\]/);
    expect(seedOf('manage_role_access')).not.toMatch(/'admin'/);
  });
  it('a bank account and an expense rate are never deleted through the skill', () => {
    expect(seedOf('manage_bank_account')).not.toMatch(/'delete'/);
    expect(seedOf('manage_expense_rate')).not.toMatch(/'delete'/);
  });
});

describe('a webhook secret is written, never read back', () => {
  it('list and get read a column mask without it', () => {
    const mask = core.match(/webhooks:\s*\n\s*'([^']+)'/)?.[1] ?? '';
    expect(mask).toContain('url');
    expect(mask).not.toMatch(/\bsecret\b/);
  });
  it('create and update answer has_secret instead of the secret', () => {
    expect(core).toMatch(/return \{ created: true, item: withoutWriteOnly\(table, createdItem\), table \}/);
    expect(core).toMatch(/return \{ updated: true, item: withoutWriteOnly\(table, updatedItem\), table \}/);
    expect(core).toMatch(/has_secret: typeof secret === 'string' && secret\.length > 0/);
  });
});

describe('a required unique slug comes from the name', () => {
  it('categories and tags get one when the agent leaves it out', () => {
    expect(core).toMatch(/const SLUG_FROM_NAME = new Set\(\['product_categories', 'tags'\]\)/);
    expect(core).toMatch(/SLUG_FROM_NAME\.has\(table\) && !cleanInsert\.slug/);
  });
});
