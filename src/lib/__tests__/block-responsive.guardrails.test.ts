import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  GRID_BLOCK_TYPES,
  hiddenEverywhere,
  normalizeResponsive,
  responsiveGridClasses,
  responsiveShellClasses,
} from '../block-responsive';

/**
 * Per-width overrides on the block envelope (#939). Three things have to stay
 * true together: the rule honours only what it says it honours, every block
 * the rule names as a grid block actually reads the column classes, and the
 * agent is told the same list the renderer keeps.
 */
describe('per-width block overrides', () => {
  it('keeps what the renderer honours and drops the rest', () => {
    expect(normalizeResponsive({
      sm: { hidden: true, columns: 1, align: 'center' },
      md: { columns: 9, align: 'justify', hidden: 'yes' },
      xl: { hidden: true },
      lg: { columns: '3' },
    })).toEqual({ sm: { hidden: true, columns: 1, align: 'center' }, lg: { columns: 3 } });
  });

  it('nothing honoured is no override at all', () => {
    for (const raw of [undefined, null, 'sm', [], {}, { sm: {} }, { sm: { columns: 0 } }, { md: { hidden: false } }]) {
      expect(normalizeResponsive(raw)).toBeUndefined();
      expect(responsiveShellClasses(raw)).toBe('');
      expect(responsiveGridClasses(raw)).toBe('');
    }
  });

  it('hides a block at its own width only', () => {
    expect(responsiveShellClasses({ sm: { hidden: true } })).toBe('max-md:!hidden');
    expect(responsiveShellClasses({ md: { hidden: true } })).toBe('md:max-lg:!hidden');
    expect(responsiveShellClasses({ lg: { hidden: true } })).toBe('lg:!hidden');
  });

  it('aligns the text of the block and of what is inside it', () => {
    const classes = responsiveShellClasses({ sm: { align: 'center' } });
    expect(classes).toContain('max-md:!text-center');
    expect(classes).toContain('max-md:[&_*]:!text-center');
    expect(classes).not.toMatch(/\blg:/);
  });

  it('gives a grid its column count per width, bounded to that width', () => {
    expect(responsiveGridClasses({ sm: { columns: 1 }, md: { columns: 2 }, lg: { columns: 4 } }).split(' ')).toEqual([
      'max-md:!grid-cols-1', 'max-md:!columns-1',
      'md:max-lg:!grid-cols-2', 'md:max-lg:!columns-2',
      'lg:!grid-cols-4', 'lg:!columns-4',
    ]);
  });

  it('knows a block hidden at every width', () => {
    expect(hiddenEverywhere({ sm: { hidden: true }, md: { hidden: true }, lg: { hidden: true } })).toBe(true);
    expect(hiddenEverywhere({ sm: { hidden: true }, lg: { hidden: true } })).toBe(false);
  });

  it('every class is written out in the source — Tailwind ships only what it can read', () => {
    const source = readFileSync('src/lib/block-responsive.ts', 'utf8');
    expect(source).not.toMatch(/`[^`]*\$\{[^`]*`/);
  });
});

describe('the blocks the rule calls grid blocks', () => {
  const dir = 'src/components/public/blocks';
  const readers = readdirSync(dir)
    .filter((file) => file.endsWith('.tsx'))
    .filter((file) => readFileSync(`${dir}/${file}`, 'utf8').includes('useResponsiveGrid()'));
  const renderer = readFileSync('src/components/public/BlockRenderer.tsx', 'utf8');

  it('each one is a block the renderer dispatches', () => {
    for (const type of GRID_BLOCK_TYPES) expect(renderer, type).toContain(`case '${type}':`);
  });

  it('as many blocks read the column classes as the rule names', () => {
    // A block added to the list without the one line that reads the classes
    // would be promised to agents and honoured by nobody.
    expect(readers.length).toBe(GRID_BLOCK_TYPES.length);
  });

  it('a block that reads them puts them on a class list', () => {
    for (const file of readers) {
      const source = readFileSync(`${dir}/${file}`, 'utf8');
      expect(source.match(/responsiveGrid\b/g)?.length ?? 0, file).toBeGreaterThanOrEqual(2);
    }
  });

  it('the agent is told the same list', () => {
    const envelope = readFileSync('supabase/functions/_shared/handlers/describe-blocks.ts', 'utf8');
    // The list is read from the rule, never written a second time.
    const line = envelope.split('\n').find((l) => l.trimStart().startsWith('responsive:')) ?? '';
    expect(line).toContain("${GRID_BLOCK_TYPES.join(', ')}");
    expect(envelope).toContain("from '../blocks/envelope.ts'");
  });

  it('the shell carries the classes on both of its outer elements', () => {
    expect(renderer.match(/responsiveShell\b/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(renderer).toContain('BlockResponsiveGridContext.Provider');
  });
});
