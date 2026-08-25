/**
 * En tvärsideslänk till ett block (/products#internet) måste vänta in sidan.
 *
 * Infrastrukturen fanns hela vägen: BlockRenderer sätter id={anchorId||block.id}
 * på varje block, BlockAnchorControl låter redaktören namnge ankaret, och
 * useAnchorScroll scrollar på hash. Men hooken sköt två skott (0ms + 100ms)
 * mot innehåll som hämtas asynkront via get-page — tvärsideslandningen
 * förlorade racet på varje kall last och gav upp tyst, och effekten omkördes
 * aldrig när datan landade. Samma-sida-klick fungerade alltid, vilket är
 * varför hålet överlevde: det trasiga fallet var det man bara når UTIFRÅN.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOOK = readFileSync(join(__dirname, '../../hooks/useAnchorScroll.ts'), 'utf-8');
const PAGE = readFileSync(join(__dirname, '../../pages/PublicPage.tsx'), 'utf-8');

describe('tvärsides-ankare väntar in innehållet', () => {
  it('hooken tar en ready-flagga och bär den i beroendelistan — datan som landar omkör effekten', () => {
    expect(HOOK).toMatch(/useAnchorScroll\(ready: boolean = true\)/);
    expect(HOOK).toMatch(/\[location\.hash, ready\]/);
  });

  it('försöken är pollade och BEGRÄNSADE — inte två skott, inte för evigt', () => {
    expect(HOOK).toContain('setInterval');
    expect(HOOK).toMatch(/attempts >= \d+/);
    expect(HOOK).toContain('clearInterval');
  });

  it('PublicPage passerar sidans dataflagga — inte ett blint true', () => {
    expect(PAGE).toMatch(/useAnchorScroll\(!!page\)/);
  });

  it('varje block förblir adresserbart: BlockRenderer sätter id på sektionen', () => {
    const renderer = readFileSync(
      join(__dirname, '../../components/public/BlockRenderer.tsx'), 'utf-8',
    );
    expect(renderer).toMatch(/anchorId = block\.anchorId \|\| block\.id/);
  });
});
