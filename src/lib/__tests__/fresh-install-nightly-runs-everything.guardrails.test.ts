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

  it('excludes services by the names the CLI knows — and the recipe in the docs says the same', () => {
    // `supabase start -x` ignores a name it does not know with a WARNING and
    // starts the service anyway. `inbucket` (renamed mailpit) sat in this list
    // for every run; mailpit always started, and on runner image 20261025 port
    // 54324 was taken, so the start died (run 40845086394, 2026-10-29). Only
    // names from the CLI's own valid list (printed by that warning) belong here.
    const VALID = ['edge-runtime', 'gotrue', 'imgproxy', 'kong', 'logflare', 'mailpit', 'postgres-meta', 'postgrest', 'realtime', 'storage-api', 'studio', 'supavisor', 'vector'];
    const m = wf.match(/supabase start -x ([a-z0-9,-]+)/);
    expect(m, 'the start excludes something').toBeTruthy();
    const excluded = m![1].split(',');
    expect(excluded.filter((n) => !VALID.includes(n)), 'a name the CLI does not know is silently NOT excluded').toEqual([]);
    expect(excluded, 'the battery never needs a mailbox; the runner image may hold its port').toContain('mailpit');
    const doc = readFileSync(join(root, 'docs/operators/local-development.md'), 'utf-8');
    expect(doc, 'the cloud-container recipe carries the same list').toContain(`-x ${m![1]}`);
  });

  it('the smoke turns red on a dispatch bug, so the job does too', () => {
    const smoke = readFileSync(join(root, 'scripts/local-smoke.ts'), 'utf-8');
    expect(smoke).toMatch(/process\.exit\(bugs\.length > 0 \? 1 : 0\)/);
  });
});
