/**
 * En scrollyta i en dialog behöver DEFINIT höjd — max-height räcker inte.
 *
 * Tredje försöket på samma bugg, och den här gången uppmätt i en webbläsare i
 * stället för resonerad fram (Magnus 2026-08-30, efter att både #346 och #349
 * misslyckats).
 *
 * Mätvärden från den skarpa komponentens klasser, körda mot en riktig
 * renderare:
 *   före:  dialog 720 px, scrollramen 610 px — men Radix viewport 4 104 px,
 *          scrollTop låst på 0. Alltså: innehållet klipptes.
 *   efter: dialog 660 px, viewport 585 px, innehåll 4 104 px,
 *          scrollTop 3 519 = sista meddelandet nås.
 *
 * Orsaken: `max-height` gör INTE en höjd definit. DialogContent har därför
 * höjd `auto`, och Radix scroll-viewport (`h-full`) kan inte lösa en procent
 * mot en förälder vars höjd bara är flex-fördelad. `flex-1 min-h-0` gav ramen
 * rätt storlek men viewporten växte ändå med innehållet.
 *
 * Sheets drabbas inte: SheetContent är `fixed inset-y-0` och har alltså en
 * definit höjd att räkna mot. Det är just den skillnaden som gör att bara
 * dialoger står här.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const dialogFiles = execSync('grep -rl \'DialogContent className="\' src || true', { encoding: 'utf-8' })
  .split('\n')
  .filter(Boolean)
  // Grinden matchade sin egen regex-literal och pekade ut sig själv som syndare.
  .filter((f) => !f.includes('__tests__'));

describe('ingen dialog låter en scrollyta hänga på flex-1', () => {
  it('svepet hittar dialoger', () => {
    expect(dialogFiles.length).toBeGreaterThan(5);
  });

  it('varje ScrollArea i en dialog har en definit höjd', () => {
    const offenders: string[] = [];
    for (const f of dialogFiles) {
      for (const line of readFileSync(f, 'utf-8').split('\n')) {
        const m = line.match(/<ScrollArea className="([^"]+)"/);
        if (!m) continue;
        const cls = m[1];
        const definite = /\bh-\[|\bh-full\b|\bh-\d/.test(cls);
        if (!definite) offenders.push(`${f}: ${cls}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('och den rapporterade dialogen bär den höjd mätningen bekräftade', () => {
    const src = readFileSync('src/components/admin/chat/VisitorSessionsTab.tsx', 'utf-8');
    expect(src).toMatch(/<ScrollArea className="h-\[65vh\]/);
    expect(src).toMatch(/Radix scroll-viewport \(h-full\) kan inte lösa procent/);
  });

  it('sheets behöver inte regeln — deras höjd är definit via inset-y-0', () => {
    const sheet = readFileSync('src/components/ui/sheet.tsx', 'utf-8');
    expect(sheet).toMatch(/inset-y-0/);
  });
});
