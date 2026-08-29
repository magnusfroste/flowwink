/**
 * Det som prospekteringen fann ska synas på bolaget det handlar om.
 *
 * Fyndet (Magnus 2026-08-29, efter research på Vinge): "det finns är jag säker
 * på men det presenteras förmodligen inte". Han hade rätt. prospect_research
 * och prospect_fit_analysis skriver till `activities` (entity_type 'company')
 * sedan handlarna skrevs: destillerad sammanfattning, erbjudanden, smärtpunkter,
 * källor — och ur fit-passet ett poäng, en rådgivningsparagraf, beslutsfattaren
 * och en problem↔lösning-mappning. På Vinge blev det fit 86/100 och en namngiven
 * CFO med 99% konfidens. Företagssidan renderade bara `web_summary`.
 *
 * Det här är alltså ingen ny intelligens — det är den plattformen redan betalat
 * för, äntligen visad. Grinden finns för att den inte ska bli osynlig igen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const comp = read('src/components/admin/companies/CompanyResearchHistory.tsx');
const hook = read('src/hooks/useEntityActivities.ts');
const page = read('src/pages/admin/CompanyDetailPage.tsx');
const handler = read('supabase/functions/_shared/handlers/prospect-research.ts');

describe('läsaren hittar det skrivaren skrev', () => {
  it('samma tabell, samma entity_type, samma activity_types', () => {
    // Skrivarsidan: research-aktiviteten skrivs mot company-entiteten.
    expect(handler).toMatch(/activity_type: 'research'/);
    // Läsarsidan måste matcha exakt — det är här ett par som detta glider isär.
    // Läsningen bor i hooken som ÄGER activities — table-ownership-grinden
    // fångade att komponenten först läste tabellen rått, och hade rätt.
    expect(hook).toMatch(/\.eq\('entity_type', 'company'\)/);
    expect(hook).toMatch(/COMPANY_RESEARCH_TYPES = \['research', 'fit_analysis'\]/);
    expect(comp).toMatch(/useCompanyResearch\(companyId\)/);
    expect(comp).not.toMatch(/from\('activities'\)/);
  });

  it('och företagssidan monterar den', () => {
    expect(page).toMatch(/<CompanyResearchHistory companyId=\{company\.id\} \/>/);
  });
});

describe('fit-passets resultat visas, inte bara att det kördes', () => {
  for (const [field, label] of [
    ['fit_score', 'poängen'],
    ['fit_advice', 'rådgivningen'],
    ['decision_maker', 'beslutsfattaren'],
    ['problem_mapping', 'problem→lösning'],
  ] as const) {
    it(`${label} renderas`, () => {
      expect(comp).toMatch(new RegExp(`fit\\.${field}|${field}`));
    });
  }
});

describe('den ljuger inte när det saknas', () => {
  it('ingen research → ingen kortyta alls', () => {
    expect(comp).toMatch(/if \(rows\.length === 0\) return null;/);
  });

  it('varje fält behandlas som möjligen frånvarande — raderna är skrivna av agenter', () => {
    expect(comp).toMatch(/const str = \(v: unknown\)/);
    expect(comp).toMatch(/const list = \(v: unknown\)/);
    expect(comp).toMatch(/typeof fit\.fit_score === 'number' \? fit\.fit_score : null/);
  });
});
