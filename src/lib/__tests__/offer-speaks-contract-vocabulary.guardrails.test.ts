import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An offer letter rendered from the default employment-contract template
 * fills the contract's merge fields too.
 *
 * manage_job_offer(generate) without a template id picks the default contract
 * template — the one generate_employment_contract renders after the hire. The
 * offer filled {{candidate_name}}/{{job_title}}/{{salary}}, the contract
 * {{employee_name}}/{{title}}/{{monthly_salary}}, so once an operator set a
 * default contract template every offer read "{{employee_name}}" and named no
 * salary (process battery, second pass, 2026-10-05). The latest definition of
 * manage_job_offer must fill both vocabularies.
 */

const root = join(__dirname, '../../..');
const dir = join(root, 'supabase/migrations');

function latestDefinition(fn: string): string {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let body = '';
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const at = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    if (at >= 0) body = sql.slice(at);
  }
  return body;
}

describe('the offer speaks the contract template vocabulary', () => {
  const fn = latestDefinition('manage_job_offer');

  it('fills the offer fields and the contract fields', () => {
    for (const field of ['candidate_name', 'job_title', 'salary', 'employee_name', 'title', 'monthly_salary', 'start_date']) {
      expect(fn, field).toContain(`'{{${field}}}'`);
    }
  });
});
