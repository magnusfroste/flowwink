/**
 * Två blödande buggar av samma klass: en frågekolumn som inte finns, ett fel
 * som sväljs, och ett fallback-värde som ser ut som ett svar.
 *
 * 1. `score-visitor-intent` frågade efter `leads.company` — en kolumn som
 *    normaliserades bort till companies för länge sedan och inte finns i NÅGON
 *    instans. PostgREST svarade 400, felet fångades aldrig, raden blev null,
 *    nuvarande poäng lästes som 0 — och nästa rad SKREV regelns poäng över
 *    historiken. Varje besökssignal nollställde leadets poäng.
 *
 * 2. SIE-exporten läste `site_name` och `org_number` som KOLUMNER på
 *    site_settings, som är ett nyckel-värde-lager. Samma svalda 400, och
 *    fallbacken skickade kundens bokföring under plattformens eget namn:
 *    "FlowWink", organisationsnummer null. På optic låg rätt identitet en rad
 *    bort hela tiden — Optic Tunnels Networks Nordic AB, 559532-3659.
 *
 * Grinden IMPORTERAR och KÖR båda besluten. Kvällens mutationsrevision visade
 * mönstret utan undantag: varje grind som kör koden den skyddar dödade sin
 * mutation, varje grind som letade efter en textsträng överlevde. Den här
 * grinden härdade jag en gång på fel nivå redan; den här gången anropas
 * funktionerna.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveExportIdentity } from '@/lib/export-identity';

describe('en poäng som inte kunde läsas får inte skrivas över', () => {
  it('bumpen ADDERAR — den ersätter aldrig', async () => {
    const { nextScore } = await import(
      '../../../supabase/functions/_shared/scoring.ts'
    );
    expect(nextScore(40, 10)).toBe(50);
    expect(nextScore(0, 10)).toBe(10);
  });

  it('okänd nuvarande poäng behandlas som noll — men bara som utgångspunkt', async () => {
    const { nextScore } = await import(
      '../../../supabase/functions/_shared/scoring.ts'
    );
    expect(nextScore(null, 10)).toBe(10);
    expect(nextScore(undefined, 10)).toBe(10);
  });

  it('och en misslyckad läsning skriver ingenting alls', () => {
    // Den delen bor i anroparen: fel eller saknad rad → continue, ingen UPDATE.
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/score-visitor-intent/index.ts'),
      'utf-8',
    );
    const bump = src.slice(src.indexOf('// Bump lead score'), src.indexOf('signalsFired++'));
    expect(bump).toMatch(/if \(leadErr \|\| !leadRow\) \{[\s\S]*?continue;/);
    // Och kolumnen som inte finns får aldrig tillbaka.
    expect(bump).not.toMatch(/select\('score, name, email, company'\)/);
    expect(bump).toMatch(/company_id, companies\(name\)/);
  });
});

describe('en bokföringsexport ljuger aldrig om vem den är', () => {
  it('tar den juridiska personen ur Business Identity', () => {
    const id = resolveExportIdentity({
      legal_name: 'Optic Tunnels Networks Nordic AB',
      company_name: 'Optic Tunnels',
      org_number: '559532-3659',
    });
    expect(id).toEqual({
      name: 'Optic Tunnels Networks Nordic AB',
      org_number: '559532-3659',
      complete: true,
    });
  });

  it('faller tillbaka på varumärket bara när juridiskt namn saknas', () => {
    expect(resolveExportIdentity({ company_name: 'Resta Gård' }).name).toBe('Resta Gård');
  });

  it('hittar ALDRIG på ett namn — tomt är ärligt, fel blir importerat', () => {
    for (const input of [null, undefined, {}, { org_number: '559532-3659' }]) {
      const id = resolveExportIdentity(input);
      expect(id.name).toBe('');
      expect(id.complete).toBe(false);
      expect(id.name).not.toMatch(/FlowWink/);
    }
  });

  it('och exporten läser rätt rad, inte påhittade kolumner', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/admin/accounting/ExportTab.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/\.eq\('key', 'company_profile'\)/);
    expect(src).not.toMatch(/select\('site_name, org_number'\)/);
    expect(src).not.toMatch(/\?\? 'FlowWink'/);
  });
});
