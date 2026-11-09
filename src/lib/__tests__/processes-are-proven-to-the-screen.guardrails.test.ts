/**
 * Every process is proven to the screen a person looks at (2026-11-09).
 *
 * The battery proves the data; `npm run qa:process-views` (nightly, after the
 * battery) opens the views each scenario names with `s.shows(...)` as an
 * admin and requires the run's own text there. Nobody runs the processes by
 * hand on an instance, so a scenario that names no view leaves its outcome
 * unseen. Every scenario names at least one — or is exempt here, with why.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'scripts/process-battery/scenarios');
const NO_VIEW: Record<string, string> = {
  'record-to-report': 'books into an untouched historical year (1900–2015) so every total is exact; the ledger views are year-scoped to today',
};

describe('every process is proven to the screen', () => {
  const scenarios = readdirSync(DIR).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3));

  it('finds the scenarios', () => expect(scenarios.length).toBeGreaterThanOrEqual(17));

  for (const name of scenarios) {
    it(`${name} names where its outcome shows`, () => {
      if (NO_VIEW[name]) return;
      const src = readFileSync(join(DIR, `${name}.ts`), 'utf8');
      expect(src, `${name}: add s.shows(label, '/admin/…', \`…\${s.tag}\`) — or exempt it in NO_VIEW with the reason`).toMatch(/s\.shows\(\s*['"`][^'"`]+['"`],\s*'\/[^']*',\s*`[^`]*\$\{s\.tag\}[^`]*`\s*\)/);
    });
  }

  it('the nightly runs the view check after the battery', () => {
    const wf = readFileSync(join(process.cwd(), '.github/workflows/fresh-install-nightly.yml'), 'utf8');
    expect(wf.indexOf('npm run qa:process-views')).toBeGreaterThan(wf.indexOf('npm run qa:processes'));
  });
});
