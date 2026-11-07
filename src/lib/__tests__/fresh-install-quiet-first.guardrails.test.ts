/**
 * The nightly fresh install proves "quiet by default" FIRST (2026-11-06):
 * before qa:prep seeds a template, modules and data, the stack is the one
 * virgin instance the repo ever sees, and the heartbeat and the briefing
 * must keep still there. The script is the rule; this guard keeps it in the
 * workflow, before the seeding, with the assertions that make it a proof.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('quiet by default, proved every night', () => {
  it('the nightly runs qa:quiet before qa:prep, and package.json knows the script', () => {
    const wf = read('.github/workflows/fresh-install-nightly.yml');
    const quiet = wf.indexOf('run: npm run qa:quiet');
    const prep = wf.indexOf('run: npm run qa:prep');
    const serve = wf.indexOf('supabase functions serve');
    expect(quiet).toBeGreaterThan(serve);
    expect(quiet).toBeLessThan(prep);
    expect(JSON.parse(read('package.json')).scripts['qa:quiet']).toBe('bun run scripts/quiet-by-default.ts');
  });

  it('the script requires a skipped heartbeat and a quiet briefing, and that nothing left the instance', () => {
    const s = read('scripts/quiet-by-default.ts');
    expect(s).toMatch(/hb\.json\.skipped === true/);
    expect(s).toMatch(/br\.json\.quiet === true/);
    expect(s).toMatch(/after\.chat !== before\.chat/);
    expect(s).toMatch(/after\.mail !== before\.mail/);
    expect(s).toMatch(/after\.reports !== before\.reports/);
    expect(s).toMatch(/after\.failed !== before\.failed/);
    // Local only: the stack's own addresses, never an instance from an env var.
    expect(s).toMatch(/127\.0\.0\.1:54322/);
    expect(s).toMatch(/127\.0\.0\.1:54321/);
    expect(s).not.toMatch(/SUPABASE_URL/);
  });

  it('the language proof leaves no lead behind — the one lead a fresh instance woke with', () => {
    // 20261026080000 inserts a proof order whose CRM trigger makes a lead;
    // until 2026-11-07 only the order was deleted, so every fresh instance's
    // first briefing counted a "Proof" lead as the week's signal.
    const proof = readFileSync('supabase/migrations/20261026080000_besokarens-sprak-foljer-med.sql', 'utf8');
    expect(proof).toMatch(/DELETE FROM public\.leads WHERE lower\(email\) = '__lang_proof__@example\.invalid'/);
    const cleanup = readdirSync('supabase/migrations').filter((f) => f.includes('bevisordern-lamnar-ingen-lead'));
    expect(cleanup).toHaveLength(1);
    expect(readFileSync(`supabase/migrations/${cleanup[0]}`, 'utf8')).toMatch(/DELETE FROM public\.leads WHERE lower\(email\) = '__lang_proof__@example\.invalid'/);
  });
});
