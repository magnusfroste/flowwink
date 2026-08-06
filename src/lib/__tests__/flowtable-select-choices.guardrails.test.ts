/**
 * Flowtable select columns must never hide the value they already hold.
 *
 * Found while checking whether OpenClaw can set dropdown choices over MCP. It
 * can — 6 of 12 select fields on the Optic Tunnels base were correctly
 * configured. But the six that were not held perfectly good data
 * ("Månadsavgift", "Kunden köper direkt") in a `<select>` whose `<option>` list
 * did not contain it. The browser renders that as blank, so the column looked
 * empty; and the fallback list offered `New / In progress / Done`, so the
 * obvious repair — pick something from the dropdown — replaced a correct value
 * with a meaningless one.
 *
 * The multiselect renderer had handled this all along (out-of-list values are
 * rendered as static chips). Single select did not. Same idea, two renderers,
 * one of them wrong — which is the whole failure shape of this week.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectChoices } from '@/pages/admin/FlowtablePage';

const rpc = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260808190000_flowtable-list-tables-expose-options.sql'),
  'utf-8',
);

const STARTER = ['New', 'In progress', 'Done'];

describe('a configured column offers exactly what it was configured with', () => {
  it('uses the configured choices, in their configured order', () => {
    // Order is meaningful: it drives the Kanban column order.
    expect(selectChoices(['Aktiv', 'Undvik'], [], STARTER)).toEqual(['Aktiv', 'Undvik']);
  });

  it('does not duplicate a present value that is already configured', () => {
    expect(selectChoices(['Aktiv', 'Undvik'], ['Aktiv'], STARTER)).toEqual(['Aktiv', 'Undvik']);
  });
});

describe('a value outside the configured list stays visible', () => {
  it('appends it rather than dropping it', () => {
    // The bug: `<select value="Månadsavgift">` with no matching option renders
    // blank, and the next edit writes whatever the list did offer.
    expect(selectChoices(['Årsavgift'], ['Månadsavgift'], STARTER)).toEqual([
      'Årsavgift',
      'Månadsavgift',
    ]);
  });

  it('keeps several stray values, in the order the data presents them', () => {
    expect(selectChoices(['A'], ['B', 'C'], STARTER)).toEqual(['A', 'B', 'C']);
  });

  it('shows the data alone when nothing was ever configured', () => {
    // An agent filled the rows before anyone configured the column — the common
    // case, and the one that produced the report.
    expect(selectChoices(undefined, ['Månadsavgift', 'Årsavgift'], STARTER)).toEqual([
      'Månadsavgift',
      'Årsavgift',
    ]);
    expect(selectChoices([], ['Månadsavgift'], STARTER)).toEqual(['Månadsavgift']);
  });
});

describe('the starter set is for genuinely new columns only', () => {
  it('offers it when the column is unconfigured AND empty', () => {
    expect(selectChoices(undefined, [], STARTER)).toEqual(STARTER);
  });

  it('never offers it over real data', () => {
    // The damaging case: a "Debiteringsform" column inviting you to set a row
    // to "In progress".
    const out = selectChoices(undefined, ['Månadsavgift'], STARTER);
    for (const s of STARTER) expect(out).not.toContain(s);
  });

  it('never offers it when the column IS configured, even if empty', () => {
    expect(selectChoices(['Aktiv'], [], STARTER)).toEqual(['Aktiv']);
  });

  it('offers nothing at all when no starter set is supplied', () => {
    // Kanban grouping passes no starter set — an empty board is honest, three
    // invented columns are not.
    expect(selectChoices(undefined, [])).toEqual([]);
  });
});

describe('empty and blank values are not choices', () => {
  it('ignores empty strings coming from the data', () => {
    // `String(r.values?.[key] ?? '')` yields '' for unset cells; an empty
    // option already exists in the renderer and a blank Kanban column is noise.
    expect(selectChoices(['A'], ['', 'B'], STARTER)).toEqual(['A', 'B']);
  });

  it('treats an all-blank column as empty, not as configured data', () => {
    // Counting '' as a present value would deny a genuinely empty column its
    // starter set — the one case the starter set exists for.
    expect(selectChoices(undefined, ['', ''], STARTER)).toEqual(STARTER);
  });

  it('does not duplicate a stray value that appears in several rows', () => {
    // The result is rendered as `<option key={c}>` — a repeat both warns and
    // shows twice.
    expect(selectChoices(['A'], ['B', 'B'], STARTER)).toEqual(['A', 'B']);
    expect(selectChoices(['A', 'A'], [], STARTER)).toEqual(['A']);
  });
});

describe('an operator can read back what it wrote', () => {
  // `list_flowtable_tables` is the only schema-discovery surface an external
  // agent has. It returned {key, name, type} with no options, so a select field
  // WITH choices and one without looked identical from outside — and the write
  // side fails quietly (a non-array `choices` is dropped while the call still
  // answers `status: success`). Read-back was the only way to catch that, and
  // read-back did not exist.
  it('emits options from the discovery RPC', () => {
    expect(rpc).toMatch(/jsonb_build_object\('options', f\.options\)/);
  });

  it('leaves a plain column\'s payload byte-identical', () => {
    // Merged in only when non-empty — anything already parsing this output must
    // not start seeing a new key on every text field.
    expect(rpc).toMatch(/coalesce\(f\.options, '\{\}'::jsonb\) <> '\{\}'::jsonb/);
  });

  it('replaces the function rather than adding an overload', () => {
    // A second signature would leave callers on whichever PostgREST picked, and
    // the old body would keep answering for anyone passing the same params.
    expect(rpc).toMatch(/CREATE OR REPLACE FUNCTION public\.list_flowtable_tables\(p_base_id uuid DEFAULT NULL, p_base_slug text DEFAULT NULL\)/);
  });
});
