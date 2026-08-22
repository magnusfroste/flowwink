import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  normalizeCompanyProfileShapes,
  normalizeNamedItems,
  normalizePrimaryCta,
  normalizeProofPoints,
  normalizeTestimonials,
} from '../company-profile-shapes';
import { defaultProfile } from '../../hooks/useCompanyInsights';
import { loadBusinessIdentityBlock } from '../../../supabase/functions/_shared/domains/business-identity-block.ts';
import { executeCompanyProfile } from '../../../supabase/functions/_shared/handlers/company-profile.ts';

/**
 * Business Identity had structural gaps that forced a page-authoring agent to
 * invent or to fall back on prose (2026-08-22):
 *
 *   1. differentiators were labels only — a features block needs a description
 *      per item, so the model wrote the descriptions itself.
 *   2. no field held a number AS a number — delivered_value is one prose blob
 *      ("412 km kanalisation, 99,98 % tillgänglighet") and a stats block needs
 *      {value, label} pairs, so the model parsed metrics out of prose. That is
 *      the exact spot where it fabricates.
 *   3. nothing said what the visitor should DO — no primary_cta. A landing page
 *      without a CTA is not a landing page.
 *   4. client_testimonials was a single string — one blob renders as a
 *      paragraph, never as a testimonial block.
 *   5. tagline and business_purpose existed in LIVE data (agent-written via
 *      update_company_profile, which shallow-merges any key) and reached
 *      prompts, while appearing in no editor and no interface — load-bearing,
 *      invisible and uncorrectable.
 *
 * This file pins the shapes, the write-path coercions, the prompt projection,
 * and — for gap 5 — that a projected field has a place a human can correct it.
 */

/** Chainable site_settings stub: `.from(...).select(...).in(...)` resolves to rows. */
function settingsDb(rows: Array<{ key: string; value: unknown }>) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
  (chain as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows }).then(res, rej);
  (chain as { maybeSingle: unknown }).maybeSingle = () => Promise.resolve({ data: rows[0] ?? null });
  return { from: () => chain };
}

const identityFor = (profile: Record<string, unknown>) =>
  loadBusinessIdentityBlock(settingsDb([{ key: 'company_profile', value: profile }]));

describe('gap 1 — a differentiator carries its own description', () => {
  it('takes the same {name, description} shape as services', () => {
    const items = normalizeNamedItems([{ name: 'Self-hosted', description: 'Your data, your keys' }]);
    expect(items).toEqual([{ id: expect.any(String), name: 'Self-hosted', description: 'Your data, your keys' }]);
  });

  it('migrates the legacy string[] on read — and leaves the description EMPTY', () => {
    // Empty is the point: the label survives, and nothing invents the half
    // that was never written down.
    const items = normalizeNamedItems(['Autonom som standard', 'Self-hosted']);
    expect(items.map(i => i.name)).toEqual(['Autonom som standard', 'Self-hosted']);
    expect(items.every(i => i.description === '')).toBe(true);
  });

  it('reads the legacy Record form and the alternate agent keys', () => {
    expect(normalizeNamedItems({ 'Service A': 'desc A' })[0]).toMatchObject({ name: 'Service A', description: 'desc A' });
    expect(normalizeNamedItems([{ title: 'T', summary: 'S' }])[0]).toMatchObject({ name: 'T', description: 'S' });
  });

  it('drops nameless entries — they render as empty cards', () => {
    expect(normalizeNamedItems([{ description: 'orphan' }])).toEqual([]);
  });

  it('projects name — description into the prompt', async () => {
    const block = await identityFor({
      company_name: 'Acme',
      differentiators: [{ name: 'Self-hosted', description: 'Your data, your keys' }],
    });
    expect(block).toContain('Self-hosted — Your data, your keys');
  });

  it('still projects a profile nobody has re-saved (legacy strings)', async () => {
    const block = await identityFor({ company_name: 'Acme', differentiators: ['Self-hosted'] });
    expect(block).toContain('Differentiators');
    expect(block).toContain('Self-hosted');
    expect(block).not.toContain('[object Object]');
  });
});

describe('gap 2 — a number is stored as a number, never parsed back out of prose', () => {
  it('holds {value, label, context}', () => {
    const [pp] = normalizeProofPoints([{ value: '99,98 %', label: 'tillgänglighet', context: '2025' }]);
    expect(pp).toMatchObject({ value: '99,98 %', label: 'tillgänglighet', context: '2025' });
  });

  it('splits a bare string only on a LEADING figure', () => {
    expect(normalizeProofPoints(['412 km kanalisation'])[0]).toMatchObject({ value: '412 km', label: 'kanalisation' });
  });

  it('leaves value EMPTY when the text does not start with a figure', () => {
    // No figure is invented from words; the text stays a label.
    expect(normalizeProofPoints(['marknadsledande'])[0]).toMatchObject({ value: '', label: 'marknadsledande' });
  });

  it('does not mine delivered_value — prose stays prose', async () => {
    const block = await identityFor({
      company_name: 'Acme',
      delivered_value: '412 km kanalisation, 99,98 % tillgänglighet',
    });
    // delivered_value is deliberately NOT in the projection's allowlist as a
    // source of figures: promoting its metrics is a human/agent decision made
    // against the source, not a regex run over a sentence.
    expect(block).not.toContain('Proof points');
  });

  it('projects the figures verbatim, and says they are the only ones allowed', async () => {
    const block = await identityFor({
      company_name: 'Acme',
      proof_points: [{ value: '412 km', label: 'kanalisation byggd', context: 'sedan 2014' }],
    });
    expect(block).toContain('412 km kanalisation byggd (sedan 2014)');
    expect(block).toMatch(/ONLY numbers you may state/);
    expect(block).toMatch(/do not derive, round or extrapolate/);
  });
});

describe('gap 3 — the page has an ask', () => {
  it('normalizes {label, destination, intent}', () => {
    expect(normalizePrimaryCta({ label: 'Boka möte', url: '/kontakt', goal: 'scoping' }))
      .toEqual({ label: 'Boka möte', destination: '/kontakt', intent: 'scoping' });
  });

  it('is null without a label — a CTA with no text is not a button', () => {
    expect(normalizePrimaryCta({ destination: '/kontakt' })).toBeNull();
    expect(normalizePrimaryCta('')).toBeNull();
  });

  it('projects label → destination (intent)', async () => {
    const block = await identityFor({
      company_name: 'Acme',
      primary_cta: { label: 'Boka möte', destination: '/kontakt', intent: '30 min scoping' },
    });
    expect(block).toContain('Primary call to action: Boka möte → /kontakt (30 min scoping)');
  });
});

describe('gap 4 — a testimonial is a quote WITH who said it', () => {
  it('migrates the legacy single blob into ONE unattributed quote', () => {
    const items = normalizeTestimonials('De löste på en vecka vad vi dragit på i ett år.');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quote: 'De löste på en vecka vad vi dragit på i ett år.', author: '', role: '', company: '' });
  });

  it('keeps attribution empty rather than guessed', () => {
    const [t] = normalizeTestimonials([{ text: 'Bra jobbat', by: 'Anna', position: 'CTO', organization: 'Nordbrygg' }]);
    expect(t).toMatchObject({ quote: 'Bra jobbat', author: 'Anna', role: 'CTO', company: 'Nordbrygg' });
    expect(normalizeTestimonials([{ author: 'Anna' }])).toEqual([]); // no quote, no testimonial
  });

  it('projects the attribution, and marks an unattributed quote AS unattributed', async () => {
    const block = await identityFor({
      company_name: 'Acme',
      client_testimonials: [
        { quote: 'Bra jobbat', author: 'Anna', role: 'CTO', company: 'Nordbrygg' },
        { quote: 'Snabbt' },
      ],
    });
    expect(block).toContain('"Bra jobbat" — Anna, CTO, Nordbrygg');
    expect(block).toContain('"Snabbt" (unattributed)');
    expect(block).toMatch(/attribute no quote to a person the identity does not name/);
  });

  it('still projects the legacy string blob', async () => {
    const block = await identityFor({ company_name: 'Acme', client_testimonials: 'Bra jobbat' });
    expect(block).toContain('"Bra jobbat" (unattributed)');
  });
});

describe('gap 5 — a field that reaches a prompt has a place a human can correct it', () => {
  const page = readFileSync(resolve(__dirname, '../../pages/admin/CompanyInsightsPage.tsx'), 'utf-8');

  it('tagline and business_purpose are projected', async () => {
    const block = await identityFor({
      company_name: 'Acme',
      tagline: 'Fiber i tunnlar',
      business_purpose: 'Så att kritisk infrastruktur inte tystnar.',
    });
    expect(block).toContain('Tagline: Fiber i tunnlar');
    expect(block).toContain('Business purpose: Så att kritisk infrastruktur inte tystnar.');
  });

  it('...and every projected field is declared on CompanyProfile', () => {
    for (const key of [
      'tagline', 'business_purpose', 'proof_points', 'primary_cta',
      'differentiators', 'client_testimonials',
    ]) {
      expect(Object.keys(defaultProfile)).toContain(key);
    }
  });

  it('...and every projected field is editable on the Business Identity page', () => {
    // The whole gap-5 bug class: agent-written, prompt-read, UI-invisible.
    expect(page).toMatch(/update\("tagline"/);
    expect(page).toMatch(/update\("business_purpose"/);
    expect(page).toMatch(/update\("proof_points"/);
    expect(page).toMatch(/update\("primary_cta"/);
    expect(page).toMatch(/update\("differentiators"/);
    expect(page).toMatch(/update\("client_testimonials"/);
  });
});

describe('the projection is an allowlist', () => {
  it('leaves competitive and financial fields out of outward copy', async () => {
    const block = await identityFor({
      company_name: 'Acme',
      competitors: 'Odoo, HubSpot',
      pricing_notes: 'Från 49 EUR/mån',
      revenue: '10 MSEK',
      board_members: ['Anna'],
    });
    expect(block).toContain('Company: Acme');
    expect(block).not.toContain('Odoo');
    expect(block).not.toContain('49 EUR');
    expect(block).not.toContain('10 MSEK');
  });

  it('an empty profile yields an empty block — the task still runs on its brief', async () => {
    expect(await loadBusinessIdentityBlock(settingsDb([]))).toBe('');
  });
});

describe('the write path coerces what agents guess', () => {
  /** upsert-capturing site_settings stub for executeCompanyProfile. */
  function writableDb(current: Record<string, unknown>) {
    const captured: { value?: Record<string, unknown> } = {};
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.upsert = (row: { value: Record<string, unknown> }) => {
      captured.value = row.value;
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve({ data: { value: current } });
    chain.single = () => Promise.resolve({ data: { value: captured.value, updated_at: 'now' } });
    return { db: { from: () => chain } as never, captured };
  }

  const update = async (current: Record<string, unknown>, data: Record<string, unknown>) => {
    const { db, captured } = writableDb(current);
    await executeCompanyProfile(db, { data }, 'update_company_profile');
    return captured.value as Record<string, unknown>;
  };

  it('turns guessed differentiator strings into the canonical shape', async () => {
    const saved = await update({}, { differentiators: ['Self-hosted'] });
    expect(saved.differentiators).toEqual([{ id: expect.any(String), name: 'Self-hosted', description: '' }]);
  });

  it('coerces a proof point sent as a bare string', async () => {
    const saved = await update({}, { proof_points: ['99,98 % tillgänglighet'] });
    expect(saved.proof_points).toEqual([
      { id: expect.any(String), value: '99,98 %', label: 'tillgänglighet', context: '' },
    ]);
  });

  it('refuses a label-less CTA and a single testimonial blob keeps its text', async () => {
    const saved = await update({}, {
      primary_cta: { destination: '/kontakt' },
      client_testimonials: 'Bra jobbat',
    });
    expect(saved.primary_cta).toBeNull();
    expect(saved.client_testimonials).toEqual([
      { id: expect.any(String), quote: 'Bra jobbat', author: '', role: '', company: '' },
    ]);
  });

  it('touches only the keys sent — the merge stays shallow', async () => {
    const saved = await update({ icp: 'Vård', services: [{ id: 'x', name: 'S', description: '' }] }, { tagline: 'Fiber' });
    expect(saved.icp).toBe('Vård');
    expect(saved.services).toEqual([{ id: 'x', name: 'S', description: '' }]);
    expect(saved.tagline).toBe('Fiber');
  });

  it('normalizeCompanyProfileShapes leaves absent keys absent', () => {
    expect(Object.keys(normalizeCompanyProfileShapes({ tagline: 'x' }))).toEqual(['tagline']);
  });
});

describe('the agent surface describes the shapes it will be judged on', () => {
  const seed = readFileSync(resolve(__dirname, '../modules/company-insights-module.ts'), 'utf-8');

  it('update_company_profile documents every structured field', () => {
    for (const key of ['proof_points', 'primary_cta', 'client_testimonials', 'differentiators']) {
      expect(seed).toContain(`${key}: {`);
    }
  });

  it('tells the operator that empty beats invented', () => {
    expect(seed).toMatch(/Never fill an attribution or a figure you cannot source/);
  });
});
