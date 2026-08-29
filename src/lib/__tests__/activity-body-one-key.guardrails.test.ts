/**
 * En nyckel för aktivitetens text — och läsaren minns de gamla.
 *
 * Fyndet (Magnus 2026-08-29, kontakten Johan Berglind): en mötessammanfattning
 * på 2 608 tecken med 38 radbrytningar låg i `metadata.note`, klippt till två
 * rader utan väg vidare. Samtidigt skrev kontaktskapandet sin notering under
 * `metadata.text` — en nyckel tidslinjen aldrig läste, så den raden hade
 * renderats helt utan text sedan den skrevs.
 *
 * Två regler faller ur det: skriv EN nyckel (`note`), och läs alla som redan
 * finns i drift. En läsare som bara kan dagens nyckel tömmer gårdagens logg.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const timelineHook = read('src/hooks/useUnifiedTimeline.ts');
const timelineUi = read('src/components/admin/crm/UnifiedTimeline.tsx');
const createDialog = read('src/components/admin/CreateLeadDialog.tsx');
const logActivity = read('src/hooks/useLogActivity.ts');
const crmTasks = read('src/hooks/useCrmTasks.ts');

describe('alla skrivare använder samma nyckel', () => {
  it("den interaktiva loggaren skriver `note`", () => {
    expect(logActivity).toMatch(/metadata: Record<string, unknown> = \{ note: body \}/);
  });

  it('kontaktskapandet skriver `note`, inte den föräldralösa `text`', () => {
    expect(createDialog).toMatch(/metadata: \{ note:/);
    expect(createDialog).not.toMatch(/metadata: \{ text:/);
  });

  it('task-loggen skriver `note`', () => {
    expect(crmTasks).toMatch(/\{ note: note\.trim\(\) \}/);
  });
});

describe('läsaren tappar inte det som redan står skrivet', () => {
  it('faller tillbaka på description och text — rader som finns i drift', () => {
    const desc = timelineHook.slice(timelineHook.indexOf('id: `activity-'));
    expect(desc).toMatch(/meta\?\.note as string/);
    expect(desc).toMatch(/meta\?\.description as string/);
    expect(desc).toMatch(/meta\?\.text as string/);
  });
});

describe('en lång anteckning går att läsa, utan att flödet blir en uppsats', () => {
  it('klippet finns kvar som utgångsläge', () => {
    expect(timelineUi).toMatch(/'line-clamp-2'/);
  });

  it('men det som klipps går att fälla ut, med sina radbrytningar kvar', () => {
    expect(timelineUi).toMatch(/expanded\.has\(event\.id\) \? 'whitespace-pre-wrap' : 'line-clamp-2'/);
    expect(timelineUi).toMatch(/isExpandable\(event\.description\)/);
    expect(timelineUi).toMatch(/Show more/);
  });

  it('bara det som faktiskt kan vara avklippt får en knapp', () => {
    expect(timelineUi).toMatch(/text\.length > 160 \|\| text\.includes\('\\n'\)/);
  });
});
