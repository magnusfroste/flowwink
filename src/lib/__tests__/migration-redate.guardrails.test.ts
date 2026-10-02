import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planRedates, tsToDate, dateToTs } from '../../../scripts/redate-migrations';

/**
 * The forward-dating rule stays (supabase db push refuses a back-dated pending
 * file); the chore of re-dating moves to a command. This pins the command's
 * arithmetic — every re-dated file sorts after the head AND after the clock,
 * two files never share a version, relative order survives — and that the
 * guard's failure message points at the command rather than at a person.
 */
const root = join(__dirname, '../../..');

describe('planRedates', () => {
  const dir = 'supabase/migrations/';
  it('moves only the files at or below the base head, in their original order', () => {
    const plan = planRedates(
      [dir + '20260930215100_b.sql', dir + '20260930215000_a.sql', dir + '20261002120000_c.sql'],
      20261001030000,
      20261002100000,
    );
    expect(plan.map((r) => r.from.split('/').pop())).toEqual(['20260930215000_a.sql', '20260930215100_b.sql']);
    expect(plan.map((r) => r.to.split('/').pop())).toEqual(['20261002100000_a.sql', '20261002100001_b.sql']);
  });

  it('starts after the head when the clock is behind it (a stale clock never re-creates the offence)', () => {
    const plan = planRedates([dir + '20260101000000_x.sql'], 20261001030000, 20260901000000);
    expect(plan[0].newTs).toBe(20261001030001);
    expect(plan[0].newTs).toBeGreaterThan(20261001030000);
  });

  it('carries seconds across a minute boundary with real calendar arithmetic', () => {
    const plan = planRedates([dir + '20260101000000_x.sql', dir + '20260101000001_y.sql'], 20260101000002, 20261231235959);
    expect(plan.map((r) => r.newTs)).toEqual([20261231235959, 20270101000000]);
    expect(dateToTs(tsToDate(20261231235959))).toBe(20261231235959);
  });

  it('is a no-op when nothing is back-dated', () => {
    expect(planRedates([dir + '20261002120000_c.sql'], 20261001030000, 20261002100000)).toEqual([]);
  });
});

describe('the forward-dating guard', () => {
  const guard = readFileSync(join(root, 'scripts/check-migration-forward-dated.ts'), 'utf-8');
  it('names the command as the fix', () => {
    expect(guard).toContain('npm run migrations:redate');
  });
  it('states the real reason (the CLI refuses), not the retired ledger', () => {
    expect(guard).toMatch(/--include-all/);
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).scripts['migrations:redate']).toContain('redate-migrations.ts');
  });
});
