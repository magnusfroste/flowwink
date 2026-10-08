import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The second half of the optic operator round (2026-10-08): three QA findings
 * from August that were still live. Each guard discovers its subjects from the
 * code instead of listing them.
 */
const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const ae = read('supabase/functions/agent-execute/index.ts');

type Seed = { name: string; handler?: string; mcp_exposed?: boolean };
const seeds: Seed[] = (JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> })
  .modules.flatMap((m) => m.skills);

describe('4. a skill that needs a portal session is not offered to MCP callers', () => {
  // Every executor that calls companyScopeGuard refuses without the signed-in
  // company contact (_company_id) — which an MCP caller never has. They used to
  // rank high in search_skills and answer "You must be signed in as a company
  // contact" (CRM-3). Discover them: dispatch line → executor → guard.
  const guarded = new Set(
    [...ae.matchAll(/async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)]
      .filter(([, , body]) => /companyScopeGuard\(args/.test(body))
      .map(([, fn]) => fn),
  );
  const handlers = [...ae.matchAll(/handler === '(internal:\w+)'\) \{\s*result = await (\w+)\(/g)]
    .filter(([, , fn]) => guarded.has(fn))
    .map(([, h]) => h);

  it('the portal executors are found (the scan is not empty)', () => {
    expect(guarded.size).toBeGreaterThanOrEqual(7);
    expect(handlers.length).toBeGreaterThanOrEqual(8);
  });

  it('every skill on such a handler is mcp_exposed: false', () => {
    const exposed = seeds.filter((s) => s.handler && handlers.includes(s.handler) && s.mcp_exposed !== false).map((s) => s.name);
    expect(exposed, 'portal-only skills still on the MCP surface').toEqual([]);
  });
});

describe('5. CRM: a new deal starts at the pipeline\'s first stage; a lead says its company', () => {
  const create = ae.slice(ae.indexOf("if (action === 'create') {\n    const { value_cents = 0, currency = 'SEK'"));

  it('manage_deal create has no hard-coded proposal default and reads pipeline_stages', () => {
    const head = create.slice(0, 1500);
    expect(head).not.toMatch(/stage = 'proposal'/);
    expect(head).toMatch(/from\('pipeline_stages'\)[\s\S]*?\.eq\('entity_type', 'deal'\)[\s\S]*?\.order\('sort_order'/);
    expect(head).toMatch(/: 'lead'/);
  });

  it('manage_leads list returns company_id and the company', () => {
    const fn = ae.slice(ae.indexOf('async function executeLeadsAction'));
    const list = fn.slice(fn.indexOf("if (action === 'list')"), fn.indexOf("if (action === 'get'"));
    expect(list).toMatch(/company_id, company:companies\(id, name\)/);
  });
});
