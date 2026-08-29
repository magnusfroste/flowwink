/**
 * En dialog som ska vara en flexkolumn måste säga det med eftertryck.
 *
 * Fyndet (Magnus 2026-08-30, efter att #346 INTE räckte): "jag kan inte se hela
 * meddelandetråden i pop-upen". Rätt diagnos var bara halva sanningen.
 *
 * shadcns DialogContent har `grid` i sin bas. En konsument som skriver
 * `flex flex-col` i sin className får INTE flex: Tailwind genererar `.grid`
 * EFTER `.flex` i stilmallen, och vid samma specificitet vinner den senare
 * regeln — oavsett ordningen i class-attributet. Uppmätt i den byggda CSS:en:
 * `.flex` på position 46552, `.grid` på 46658.
 *
 * Följden: `flex-1` på scrollområdet betyder ingenting (det är inget flexbarn),
 * och min-h-0 från #346 hade inget att verka på. Dialogen växte förbi sin
 * maxhöjd och klippte slutet av tråden.
 *
 * `!flex` genererar `display:flex!important` och vinner. SheetContent har
 * ingen display i basen och behöver därför inget utropstecken — det är just
 * skillnaden som gör att bara dialoger står här.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync(
  'grep -rl \'DialogContent className="\' src || true',
  { encoding: 'utf-8' },
).split('\n').filter(Boolean);

describe('flex på en DialogContent måste vara !flex', () => {
  it('svepet hittar dialoger — annars mäter grinden ingenting', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('ingen DialogContent förlitar sig på ett vanligt flex', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of readFileSync(f, 'utf-8').split('\n')) {
        const m = line.match(/DialogContent className="([^"]*)"/);
        if (m && /\bflex flex-col\b/.test(m[1]) && !/!flex/.test(m[1])) {
          offenders.push(`${f}: ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('basen sätter fortfarande grid — det är hela skälet regeln finns', () => {
    // Skulle basen någon gång byta till flex blir regeln onödig, och då ska
    // den här raden tvinga fram en omprövning i stället för att tyst bestå.
    const base = readFileSync('src/components/ui/dialog.tsx', 'utf-8');
    expect(base).toMatch(/z-50 grid w-full max-w-lg/);
  });
});
