/**
 * The process map (`npm run docs:process-map`) tells two things no single doc
 * states: which processes hand off to which, and one purchase traced through
 * the code. Both are curated in scripts/process-map/data.ts — and curation
 * rots. This keeps every entry pointing at something that exists.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILIES, HANDOFFS, PURCHASE_CHAIN } from '../../../scripts/process-map/data';
import { loadProcesses } from '../../../scripts/process-map/parse';

const ROOT = process.cwd();
const docs = readdirSync(join(ROOT, 'docs/processes')).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.slice(0, -3));

const sources = (() => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(join(ROOT, d))) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      const p = `${d}/${e}`;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx|sql)$/.test(e)) out.push(p);
    }
  };
  walk('supabase'); walk('src/lib/modules');
  return out;
})();

describe('the process map stays true', () => {
  it('every process doc is in exactly one family, and every family entry is a doc', () => {
    const placed = FAMILIES.flatMap((f) => f.slugs);
    expect([...placed].sort()).toEqual([...docs].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('every hand-off joins two process docs', () => {
    for (const h of HANDOFFS) {
      expect(docs, h.why).toContain(h.from);
      expect(docs, h.why).toContain(h.to);
    }
  });

  it('every step of the purchase still exists in the source', () => {
    for (const step of PURCHASE_CHAIN) {
      const files = step.file ? [step.file] : sources;
      const found = files.some((f) => readFileSync(join(ROOT, f), 'utf8').includes(step.evidence));
      expect(found, `"${step.title}": ${step.evidence} not found ${step.file ? `in ${step.file}` : 'anywhere'}`).toBe(true);
    }
  });

  it('every process doc parses to a title, a problem, modules and steps', () => {
    for (const p of loadProcesses(join(ROOT, 'docs/processes')).values()) {
      expect(p.title, p.slug).not.toBe('');
      expect(p.modules.length, `${p.slug}: no modules table the map can read`).toBeGreaterThan(0);
      expect(p.steps.length, `${p.slug}: no mermaid flow the map can read`).toBeGreaterThan(0);
    }
  });
});
