/**
 * Policies that name roles BY HAND instead of asking the matrix.
 *
 * `has_role(auth.uid(), 'sales')` inside a CREATE POLICY is a second dial next
 * to role_module_access: an operator who grants a role a module in the matrix
 * sees the nav open and the data stay shut, with no error anywhere (analytics
 * for sales, 2026-09-02). 136 such policies existed on the live schema when
 * this was written. The count in the repo's migrations may only go down.
 * `has_role(..., 'admin')` is not counted — admin is the matrix's own escape.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RE = /has_role\(\s*auth\.uid\(\)\s*,\s*'(?!admin')[a-z_]+'/g;

/** @returns {Record<string, number>} migration file → hand-rolled role references */
export function scanHandRolledRolePolicies(root = process.cwd()) {
  const dir = join(root, 'supabase/migrations');
  const counts = {};
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const src = readFileSync(join(dir, name), 'utf8');
    const n = (src.match(RE) ?? []).length;
    if (n) counts[name] = n;
  }
  return counts;
}
