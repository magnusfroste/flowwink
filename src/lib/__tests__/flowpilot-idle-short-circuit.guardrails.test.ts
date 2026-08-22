import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spärr: FlowPilots tomgångs-kortslutning bär defaulten.
 *
 * 2026-08-23 slogs FlowPilot på som DEFAULT för nya instanser. Beslutet vilar
 * på två mätta fakta, och det andra är det här testets uppgift att skydda:
 *
 *  1. Cronen körs ändå. flowpilot-heartbeat/-learn/-daily-briefing ligger i
 *     plattformens cron-golv (ensurePlatformCron) och registreras oavsett
 *     modultoggeln. Med modulen AV fyrade jobben alltså i alla fall — men utan
 *     admin-yta att se dem i. "Av" var inte säkrare, bara mer osynligt.
 *  2. **Den är tyst utan mål.** Heartbeaten kortsluter innan något modellanrop
 *     när det inte finns aktiva objectives och inget uppföljningsarbete:
 *     `{ skipped: true, reason: 'idle_no_standing_work' }`.
 *
 * Punkt 2 är hela skillnaden mellan en default som kostar noll och en default
 * som ringer en betald modell var tolfte timme på varje nyfödd instans som
 * ännu inte fått ett enda mål. Försvinner kortslutningen måste defaulten
 * omprövas — därför faller det här testet i stället för fakturan.
 *
 * Testet läser edge-funktionen som text: den körs i Deno och kan inte
 * importeras härifrån. Det är en svagare koppling än ett enhetstest, men
 * starkare än ingen — och det som ska fångas är att SATSEN tas bort.
 */

const HEARTBEAT = join(
  __dirname,
  '../../../supabase/functions/flowpilot-heartbeat/index.ts',
);
const MODULES = join(__dirname, '../../hooks/useModules.tsx');

describe('FlowPilots default vilar på tomgångs-kortslutningen', () => {
  const heartbeat = readFileSync(HEARTBEAT, 'utf8');
  const modules = readFileSync(MODULES, 'utf8');

  it('heartbeaten kortsluter på tomgång, med en läsbar orsak', () => {
    expect(
      heartbeat,
      'Tomgångs-kortslutningen är borta. Utan den ringer varje nyfödd instans ' +
        'en betald modell var tolfte timme utan att ha ett enda mål — och ' +
        'FlowPilot är PÅ som default just för att den inte gör det. Antingen ' +
        'återinför kortslutningen, eller sätt flowpilot.enabled tillbaka till ' +
        'false i defaultModulesSettings och motivera det där.',
    ).toContain('idle_no_standing_work');
  });

  it('kortslutningen sker FÖRE modellanropet, inte efter', () => {
    // Maskera kommentarer först. Filens egen docstring säger "Delegates to the
    // shared reason() loop", och en naiv textsökning läser den som ett
    // modellanrop på rad 30 — samma fälla som lät en migrationstransformation
    // generera skarp SQL ur svensk prosa tidigare samma vecka. Kod är kod;
    // kommentarer är text som ser ut som kod.
    const code = heartbeat
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
    const idleAt = code.indexOf('idle_no_standing_work');
    // Första anropet mot reason-loopen/AI:n i filen. Kortslutningen måste ligga
    // före den, annars har vi betalat för svaret innan vi konstaterar tomgång.
    const firstModelCall = Math.min(
      ...['runReasonLoop', 'callAi(', 'chat/completions', 'await reason('].map((needle) => {
        const i = code.indexOf(needle);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    expect(idleAt, 'hittade ingen kortslutning alls').toBeGreaterThan(-1);
    expect(
      firstModelCall === Number.MAX_SAFE_INTEGER || idleAt < firstModelCall,
      'Kortslutningen ligger EFTER första modellanropet — då sparar den ingenting.',
    ).toBe(true);
  });

  it('defaulten och skyddet hänger ihop: är FlowPilot på måste skälet stå kvar', () => {
    const onByDefault = /flowpilot:\s*\{[\s\S]{0,2000}?enabled:\s*true/.test(modules);
    if (!onByDefault) return; // Någon har slagit av den igen — då bär inte defaulten något.
    expect(
      modules,
      'FlowPilot är på som default men motiveringen är borta ur koden. ' +
        'Defaulten vilar på tomgångs-kortslutningen; står det inte skrivet ' +
        'vet nästa läsare inte vad som håller den uppe.',
    ).toMatch(/idle_no_standing_work|tomgång/i);
  });
});
