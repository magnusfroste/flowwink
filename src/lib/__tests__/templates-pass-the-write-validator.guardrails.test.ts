import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import {
  normalizeBlocks,
  normalizeBlockData,
} from '../../../supabase/functions/_shared/normalize-blocks';

/**
 * The shipped templates go through the SAME gate an agent's manage_page write
 * goes through — and must pass it clean.
 *
 * 2026-09-02: applying consult-agency's home page to labs1100 through the
 * gateway was refused: the hero carried `buttonAnimation`, a field the type
 * declared and no renderer read. The template had shipped for months; nothing
 * ran it through the validator because the installer writes rows directly.
 * The same day's review found timelines seeded as `items`/`layout` and stats
 * as `items` — shapes only the renderers' fallbacks rescue. A template is the
 * product's shop window AND the reference an agent copies from; it must not
 * teach a shape the gate refuses or the renderer merely tolerates.
 *
 * Three claims per template page:
 *  1. the write validator drops nothing (fail-closed, like the gateway);
 *  2. normalisation changes nothing — the block is already in the renderer's
 *     own field names (a ratchet: the count may only shrink);
 *  3. every /templates/… image exists under public/, and every `#anchor` link
 *     points at a block id on the same page.
 */
const TEMPLATE_DIR = resolve(__dirname, '../../../templates');
const PUBLIC_DIR = resolve(__dirname, '../../../public');

interface TemplatePage { slug: string; blocks: Array<Record<string, unknown>> }
interface Template { id: string; pages: TemplatePage[] }

const templates: Template[] = readdirSync(TEMPLATE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(TEMPLATE_DIR, f), 'utf-8')) as Template)
  .filter((t) => Array.isArray(t.pages));

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Every string value in a block, with its dotted path. */
function strings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/**
 * Pages whose authoring still leans on renderer fallbacks (the block changes
 * under normalisation). Listed so the number can only shrink; a new entry is
 * a new template teaching an old shape. Empty = every template is clean.
 */
const NORMALISATION_BASELINE: Record<string, number> = {};

describe('every shipped template passes the write validator', () => {
  for (const t of templates) {
    for (const page of t.pages) {
      it(`${t.id}/${page.slug}: the gate drops nothing`, () => {
        const dropped = normalizeBlocks(clone(page.blocks));
        expect(dropped, dropped.join('\n')).toEqual([]);
      });
    }
  }
});

describe('templates are written in the renderers’ own field names', () => {
  const changed: Record<string, string[]> = {};
  for (const t of templates) {
    for (const page of t.pages) {
      for (const block of page.blocks) {
        const before = JSON.stringify(block);
        const after = clone(block);
        normalizeBlockData(after);
        if (JSON.stringify(after) !== before) {
          (changed[t.id] ??= []).push(`${page.slug}/${String(block.id)} (${String(block.type)})`);
        }
      }
    }
  }
  it('no template leans on a fallback the baseline does not already list', () => {
    const offenders = Object.entries(changed)
      .filter(([id, list]) => list.length > (NORMALISATION_BASELINE[id] ?? 0))
      .map(([id, list]) => `${id}: ${list.join(', ')}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
  it('the baseline never overstates — shrink it when a template is cleaned', () => {
    const stale = Object.entries(NORMALISATION_BASELINE)
      .filter(([id, n]) => (changed[id]?.length ?? 0) < n)
      .map(([id, n]) => `${id}: baseline ${n}, actual ${changed[id]?.length ?? 0}`);
    expect(stale).toEqual([]);
  });
});

describe('template assets and anchors resolve', () => {
  for (const t of templates) {
    for (const page of t.pages) {
      it(`${t.id}/${page.slug}: images exist and #anchors hit a block`, () => {
        const ids = new Set(page.blocks.map((b) => String(b.id)));
        const problems: string[] = [];
        for (const block of page.blocks) {
          for (const [path, s] of strings(block.data)) {
            if (s.startsWith('/templates/') && !existsSync(join(PUBLIC_DIR, s))) {
              problems.push(`${String(block.id)}.${path}: missing file ${s}`);
            }
            if (/^#[A-Za-z0-9_-]+$/.test(s) && /url$/i.test(path) && !ids.has(s.slice(1))) {
              problems.push(`${String(block.id)}.${path}: anchor ${s} has no block on this page`);
            }
          }
        }
        expect(problems, problems.join('\n')).toEqual([]);
      });
    }
  }
});
