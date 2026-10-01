import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The nightly fresh-install job is the one test a live instance can never
 * run. It is only worth its runner minutes if it runs the WHOLE set every
 * night and feeds the pulse stamp back — a job that quietly dropped the
 * battery, or kept the stamp on the runner, would leave the guard it exists
 * for starving a week later. Pinned here, by the npm scripts it must call.
 */
const root = join(__dirname, '../../..');
const wf = readFileSync(join(root, '.github/workflows/fresh-install-nightly.yml'), 'utf-8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };

describe('the nightly fresh-install job', () => {
  it('starts from zero and prepares the stack with qa:prep', () => {
    expect(wf).toMatch(/supabase start/);
    expect(wf).toMatch(/npm run qa:prep/);
    expect(pkg.scripts['qa:prep']).toContain('prep-local-stack.ts');
  });

  it('runs the battery, the smoke, the MCP regression and the view sweep', () => {
    for (const cmd of ['npm run qa:processes', 'npm run local:smoke', 'npm run test:mcp-regression', 'npm run qa:views']) {
      expect(wf, `missing ${cmd}`).toContain(cmd);
    }
  });

  it('commits the pulse stamp to main and is fleet-only', () => {
    expect(wf).toMatch(/last-green\.json/);
    expect(wf).toMatch(/git push origin HEAD:main/);
    expect(wf).toMatch(/github\.repository == 'magnusfroste\/flowwink'/);
    expect(wf).toMatch(/schedule:/);
  });

  it('the smoke turns red on a dispatch bug, so the job does too', () => {
    const smoke = readFileSync(join(root, 'scripts/local-smoke.ts'), 'utf-8');
    expect(smoke).toMatch(/process\.exit\(bugs\.length > 0 \? 1 : 0\)/);
  });
});
