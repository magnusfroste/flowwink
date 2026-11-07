import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `filters: {produkt: "Privat AI"}` used to return the WHOLE table and call it
 * success — anything that wasn't an array became []. An operator composing a
 * quote from a filtered product list would have shown the customer every
 * product's lines. The shape an agent guesses must either work or fail loudly;
 * it must never mean "no filter".
 */

const SRC = readFileSync(
  join(__dirname, '../../../supabase/functions/_shared/execute/core.ts'),
  'utf8',
);

const queryFn = (() => {
  const start = SRC.indexOf('async function executeFlowtableQuery');
  expect(start).toBeGreaterThan(-1);
  return SRC.slice(start, start + 6000);
})();

describe('query_flowtable filter shape', () => {
  it('does not silently discard a non-array filters value', () => {
    // The exact line that caused it. Any revival of this pattern re-opens the hole.
    expect(queryFn).not.toMatch(/Array\.isArray\(filters\)\s*\?\s*filters\s*:\s*\[\]/);
  });

  it('accepts the object shorthand an agent reaches for first', () => {
    expect(queryFn).toMatch(/normalizeFilters/);
    // {field_key: value} maps to eq conditions rather than being dropped.
    expect(queryFn).toMatch(/Object\.entries\(obj\)/);
    expect(queryFn).toMatch(/op:\s*['"]eq['"]/);
  });

  it('errors on a shape it cannot read instead of returning every row', () => {
    expect(queryFn).toMatch(/filters must be an array/);
    expect(queryFn).toMatch(/silently return every row/);
  });
});
