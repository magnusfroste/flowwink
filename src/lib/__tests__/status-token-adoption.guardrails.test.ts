import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Status-tokens: rälsen finns (--success/--warning/--info i index.css +
 * Tailwind-mappning) — problemet är ADOPTION. ~900 råa träffar levde bredvid
 * en färdig token-räls (adoptionslagen, 2026-08-27). Tre pinnar:
 *
 * 1. Rälsen består — tokens + mappning får inte försvinna.
 * 2. Besökarytan (public + account) är NOLL rå statusfärg.
 * 3. Ratchet över hela src: populationen får aldrig VÄXA. Semantisk status
 *    (bock/varning/godkänd/låg nivå) ska ta text-success/text-warning;
 *    kategorihuear (kanal-/aktivitetsfärger) hör till en framtida
 *    kategoripalett — sänk då baselinen i takt med att du konverterar.
 */

const SRC = join(__dirname, '../..');
const RAW_STATUS = /(text|bg|border)-(green|emerald|amber|yellow|orange)-\d/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

function countRaw(dir: string): { count: number; hits: string[] } {
  const hits: string[] = [];
  let count = 0;
  for (const f of walk(dir)) {
    const matches = readFileSync(f, 'utf-8').match(RAW_STATUS);
    if (matches) {
      count += matches.length;
      hits.push(`${f.replace(SRC + '/', '')} (${matches.length})`);
    }
  }
  return { count, hits };
}

describe('status-tokens: rälsen består', () => {
  it('index.css definierar success/warning/info i båda teman', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf-8');
    for (const token of ['--success:', '--success-foreground:', '--warning:', '--warning-foreground:', '--info:']) {
      expect((css.match(new RegExp(token, 'g')) ?? []).length,
        `${token} ska finnas i :root OCH .dark`).toBeGreaterThanOrEqual(2);
    }
  });

  it('tailwind.config.ts mappar tokensen', () => {
    const cfg = readFileSync(join(SRC, '../tailwind.config.ts'), 'utf-8');
    for (const key of ['--success', '--warning', '--info']) {
      expect(cfg).toContain(`hsl(var(${key}))`);
    }
  });
});

describe('status-tokens: besökarytan är ren', () => {
  it('public + account har noll råa statusfärger', () => {
    for (const surface of ['components/public', 'components/account']) {
      const { count, hits } = countRaw(join(SRC, surface));
      expect(count, `råa statusfärger i ${surface}:\n${hits.join('\n')}`).toBe(0);
    }
  });
});

describe('status-tokens: populationen krymper', () => {
  // Mätt 2026-08-27 efter svepet (85 mönsterersättningar + besökarytan till
  // noll). FÖREKOMSTER, inte rader — flera klasser per rad räknas var för sig.
  // Får SÄNKAS när fler konverteras — aldrig höjas.
  const BASELINE = 1117;

  it(`ratchet: max ${BASELINE} råa statusfärger i src`, () => {
    const { count } = countRaw(SRC);
    expect(count,
      `${count} råa statusfärger (baseline ${BASELINE}). Ny statusfärg? ` +
      `Använd text-success/text-warning/text-info — rälsen finns redan. ` +
      `Konverterade du? Sänk BASELINE till ${count}.`).toBeLessThanOrEqual(BASELINE);
  });

  it('de svepta mönstren återuppstår inte', () => {
    const SWEPT = [
      /bg-(green|emerald)-100 text-(green|emerald)-800 dark:bg-(green|emerald)-900(\/30)? dark:text-(green|emerald)-300/,
      /bg-(amber|yellow)-100 text-(amber|yellow)-800 dark:bg-(amber|yellow)-900(\/30)? dark:text-(amber|yellow)-300/,
      /text-(green|emerald)-600 dark:text-(green|emerald)-400/,
      /text-(amber|yellow)-600 dark:text-(amber|yellow)-400/,
    ];
    for (const f of walk(SRC)) {
      const src = readFileSync(f, 'utf-8');
      for (const pattern of SWEPT) {
        expect(pattern.test(src),
          `svept mönster tillbaka i ${f}: ${pattern.source.slice(0, 60)}`).toBe(false);
      }
    }
  });
});
