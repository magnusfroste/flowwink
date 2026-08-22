import { describe, it, expect } from 'vitest';
import { blocksShapeError, preflightBlockArgs } from '../../../supabase/functions/_shared/normalize-blocks.ts';

/**
 * Spärr: en sida är en PLATT ARRAY av block, och fel form måste bouncas FÖRE
 * stageningen — inte krascha efter godkännandet.
 *
 * 2026-08-22, kvällen. Efter att `landing_page_compose` pensionerats bad en
 * admin FlowWork om en landningssida igen. Modellen skickade:
 *
 *     content_json: { hero: {...}, sections: [...] }
 *
 * — en form som BESKRIVER en sida i stället för att vara en blocklista, och
 * nästan exakt den form den borttagna skillen producerade.
 *
 * Två fel följde, båda av dagens dominerande klass:
 *  1. Preflighten gjorde `if (!Array.isArray(raw)) return NONE` — den läste
 *     "kan inte bedömas" som "inget att invända mot" och släppte igenom.
 *     Fail-open i ett fail-closed-system: operationen stageades, människan
 *     godkände, och först DÅ small det.
 *  2. Utföraren kastade `blocks is not iterable` — ett kraschmeddelande, inte
 *     ett svar. En anropare som får en stacktrace kan inte rätta sig, så den
 *     letar efter en annan skill i stället. Det var precis det draget som en
 *     timme tidigare gav en sämre sida.
 *
 * Meddelandet bor på EN plats (`blocksShapeError`) och används av både
 * preflighten och utföraren — två kopior är hur skrivvägarna kunde vara oense
 * om blocktyper i månader.
 */

const REAL_CASE = { action: 'create', title: 'X', slug: 'x', content_json: { hero: {}, sections: [] } };

describe('sidformen bouncas före stageningen', () => {
  it('det verkliga fallet vägras, med form och nästa steg i meddelandet', () => {
    const r = preflightBlockArgs('manage_page', REAL_CASE as never);
    expect(r.checked, 'preflighten släppte igenom formen tyst — fail-open').toBe(true);
    expect(r.errors.length).toBeGreaterThan(0);
    const msg = r.errors[0];
    expect(msg, 'säger inte VILKEN form som krävs').toContain('ARRAY');
    expect(msg, 'namnger inte vad den fick').toContain('hero, sections');
    expect(msg, 'pekar inte vidare — ett fel utan nästa steg är en återvändsgränd').toContain('describe_blocks');
  });

  it('en korrekt blocklista passerar fortfarande', () => {
    const ok = { action: 'create', title: 'X', slug: 'x', content_json: [{ type: 'hero', data: { title: 'T' } }] };
    expect(preflightBlockArgs('manage_page', ok as never).errors).toHaveLength(0);
  });

  it('frånvarande blocklista är inget fel — en sida får skapas tom', () => {
    expect(blocksShapeError(undefined)).toBeNull();
    expect(blocksShapeError(null)).toBeNull();
  });

  it('en strängad array är också fel form, och sägs vara det', () => {
    const msg = blocksShapeError('[{"type":"hero"}]');
    expect(msg, 'en sträng passerade som om den vore godtagbar').not.toBeNull();
    expect(msg).toContain('a string');
  });

  it('meddelandet finns på EN plats — utföraren återanvänder det', () => {
    const src = readFileSync(
      join(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf8');
    expect(src, 'agent-execute har en egen kopia av formmeddelandet i stället för att dela det')
      .toContain('blocksShapeError(effectiveBlocks)');
    expect(src.match(/must be a flat ARRAY of blocks/g) ?? [],
      'formuleringen är duplicerad i utföraren — den ska bo i normalize-blocks').toHaveLength(0);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
