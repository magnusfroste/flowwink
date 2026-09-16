import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const SRC = resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Hela ikonbiblioteket får inte nå den publika sidans första chunk.
 *
 * `import { icons } from 'lucide-react'` och `import * as X from 'lucide-react'`
 * drar in varje ikon — 1 541 st, ~630 KB att tolka — oavsett hur många sidan
 * använder. Fem publika block gjorde just så, och på optics startsida var det
 * vad en iPhone väntade på innan första raden text (2026-09-16).
 *
 * Vakten SKANNAR formen i all publik kod i stället för att räkna upp fem filer:
 * ett sjätte block som gör samma sak ska fällas utan att någon lagt till det i
 * en lista. Admin är undantaget, för admin laddas lat. Den enda tillåtna vägen
 * till hela setet är src/lib/lucide-icon-map.ts, som bara nås dynamiskt.
 */
describe('publik kod drar inte in hela ikonbiblioteket', () => {
  const FULL_SET = /import\s*(?:\{[^}]*\bicons\b[^}]*\}|\*\s+as\s+\w+)\s*from\s*['"]lucide-react['"]/;
  const files = walk(SRC).filter((f) => {
    const r = relative(SRC, f);
    if (r.startsWith('components/admin') || r.startsWith('pages/admin')) return false;
    if (r === 'lib/lucide-icon-map.ts') return false;
    return true;
  });

  it('skannar faktiskt publik kod', () => {
    expect(files.some((f) => f.includes('components/public/blocks'))).toBe(true);
  });

  it('ingen publik fil importerar hela setet', () => {
    const offenders = files
      .filter((f) => FULL_SET.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
      .map((f) => relative(SRC, f));
    expect(offenders, 'använd <BlockIcon name fallback> — den laddar setet efter första ritningen').toEqual([]);
  });

  it('ikonkartan nås bara dynamiskt', () => {
    const staticImporters = walk(SRC)
      .filter((f) => /from\s*['"]@\/lib\/lucide-icon-map['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(staticImporters, 'en statisk import lägger tillbaka hela setet i huvudchunken').toEqual([]);
  });
});
