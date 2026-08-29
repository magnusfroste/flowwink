/**
 * `leads.company` finns inte — och typen får inte påstå motsatsen.
 *
 * Fyndet (2026-08-29): den nya lägesbilden föll på sitt FÖRSTA skarpa anrop med
 * "column leads.company does not exist". Kolumnen är normaliserad bort till
 * companies via company_id och saknas i samtliga fyra instanser jag kunde nå
 * (optic, www, resta, autoversio) — men frontend-typen deklarerade den
 * fortfarande, med en "legacy fallback" som läste ett fält som aldrig kan bli
 * satt.
 *
 * Spökfältsklassen, spegelvänd: vanligtvis är det en whitelist som lovar fält
 * ingen renderare läser; här lovade TYPEN en kolumn databasen inte har. Den
 * sortens lögn är osynlig så länge alla gör `select('*')` — PostgREST utelämnar
 * bara fältet och fallbacken faller igenom — och smäller först när någon skriver
 * ut kolumnnamnet i en select. Fyra ytor hade läst det i månader.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

/**
 * Kommentarer får nämna spöket — de är just det som förklarar varför det inte
 * ska tillbaka. Grinden ska falla på KOD, inte på en förklaring.
 */
const code = (p: string) =>
  read(p)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');

describe('ingen typ lovar kolumnen', () => {
  for (const f of ['src/lib/lead-utils.ts', 'src/pages/admin/LeadsPage.tsx']) {
    it(`${f} deklarerar inte company på en lead-form`, () => {
      // company_id och companies(...) är riktiga; ett blankt `company` är spöket.
      expect(code(f)).not.toMatch(/^\s*company: string \| null;/m);
    });
  }
});

describe('ingen yta läser den', () => {
  for (const f of [
    'src/pages/admin/LeadsPage.tsx',
    'src/pages/admin/DealsPage.tsx',
    'src/pages/admin/DealDetailPage.tsx',
    'supabase/functions/_shared/handlers/contact-state.ts',
  ]) {
    it(`${f} går via relationen companies, inte det borttagna fältet`, () => {
      expect(code(f)).not.toMatch(/lead\.company\b(?!_id|s)/);
      expect(code(f)).not.toMatch(/l\.company\b(?!_id|s)/);
    });
  }

  it('och ingen select nämner kolumnen vid namn', () => {
    const handler = read('supabase/functions/_shared/handlers/contact-state.ts');
    expect(handler).toMatch(/\.select\('id, name, email, status, score, company_id, companies\(name, notes\)'\)/);
  });
});
