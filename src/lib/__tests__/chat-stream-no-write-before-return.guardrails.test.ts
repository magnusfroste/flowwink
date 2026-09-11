import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Chatten hängde på sitt eget kvitto (#510 → fix 2026-09-11).
 *
 * En TransformStream föds med mottryck PÅ: den första write() släpps först
 * när läsarsidan dras, och den dras först när Response har RETURNERATS. Ett
 * `await writer.write()` före returen väntar alltså på en läsare som inte kan
 * finnas än. Varje chatt på varje instans hängde i exakt 150 s — körtidens
 * väggklocka — och dog som WORKER_RESOURCE_LIMIT, som låter som minne och inte
 * är det. Inget loggades: processen dödades före catch-blocket.
 *
 * Två vakter. Mekanismen bevisas i kod (så nästa person inte behöver tro på
 * kommentaren), och FORMEN pinnas i källan: mellan att strömmen skapas och att
 * svaret returneras får ingen skrivning inväntas utanför pumpen.
 */
describe('chattens utström', () => {
  it('mekanismen: en inväntad första skrivning blockerar tills någon läser', async () => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const write = writer.write(new TextEncoder().encode('data: {}\n\n'));
    const beforeReader = await Promise.race([
      write.then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('blocked'), 150)),
    ]);
    expect(beforeReader, 'skrivningen får INTE släppas innan någon läser — annars vore buggen omöjlig').toBe('blocked');
    // …och släpps i samma stund som en läsare finns (det Response ger).
    const reader = readable.getReader();
    const [chunk] = await Promise.all([reader.read(), write]);
    expect(chunk.value?.length).toBeGreaterThan(0);
  });

  it('formen: ingen inväntad skrivning mellan att strömmen skapas och att svaret returneras', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../supabase/functions/chat-completion/index.ts'),
      'utf8',
    );
    const start = src.indexOf('new TransformStream<Uint8Array, Uint8Array>()');
    const pump = src.indexOf('(async () => {', start);
    expect(start, 'hittade inte utströmmen').toBeGreaterThan(-1);
    expect(pump, 'hittade inte pumpen efter strömmen').toBeGreaterThan(start);
    // Kommentarer är inte kod: förklaringen på plats nämner själva mönstret,
    // och en vakt som läser kommentarer som kod skulle fälla sin egen rättelse.
    const between = src.slice(start, pump)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(
      /await\s+writer\.write\(/.test(between),
      'en `await writer.write()` före pumpen väntar på en läsare som inte finns än — det är hängningen från #510',
    ).toBe(false);
  });
});
