/**
 * translate_site — the whole site into a language, in one call (2026-11-20).
 *
 * Adding a language was a checklist: enable_language, translate_page per page
 * from the browser (the tab had to stay open), then posts, products,
 * categories, variant labels and the interface texts one skill each. These pin
 * the one call that replaces it, and the sweep that finishes what one call
 * cannot fit in the edge wall clock.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runTranslateSite, type StaleFinding, type SweepState, type TranslateSiteDeps,
} from '../../../supabase/functions/_shared/handlers/translate-site';
import { sweepFor, sweepLine, anyRunning } from '@/lib/translation-sweep';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

function fake(opts: {
  stale?: StaleFinding[];
  enabled?: string[];
  itemMs?: number;
  failSlugs?: string[];
  uiFails?: boolean;
  state?: SweepState;
} = {}) {
  let clock = 0;
  let state: SweepState = opts.state ?? {};
  const calls = { enabled: [] as string[], items: [] as string[], ui: [] as string[] };
  let stale = [...(opts.stale ?? [])];
  const deps: TranslateSiteDeps = {
    languages: async () => ({ default: 'sv', enabled: opts.enabled ?? ['sv'] }),
    enableLanguage: async (l) => { calls.enabled.push(l); return { success: true }; },
    listStale: async () => ({ success: true, stale: [...stale] }),
    translateItem: async (f) => {
      clock += opts.itemMs ?? 1000;
      calls.items.push(f.slug);
      if (opts.failSlugs?.includes(f.slug)) return { success: false, error: 'No AI provider configured.' };
      stale = stale.filter((x) => x.slug !== f.slug);
      return { success: true };
    },
    translateUi: async (l) => { calls.ui.push(l); clock += 5000; return opts.uiFails ? { success: false, error: 'ui failed' } : { success: true, translated: 300 }; },
    platformSpeaks: (l) => l === 'sv',
    readState: async () => JSON.parse(JSON.stringify(state)),
    writeState: async (s) => { state = s; },
    now: () => clock,
  };
  return { deps, calls, get state() { return state; } };
}

const items = (n: number): StaleFinding[] =>
  Array.from({ length: n }, (_, i) => ({ entity: i % 2 ? 'blog_post' : 'page', id: `id-${i}`, slug: `item-${i}`, locale: 'de', missing: 3 }));

describe('translate_site', () => {
  it('declares the language, translates everything, then the interface texts', async () => {
    const f = fake({ stale: items(4) });
    const r = await runTranslateSite({ locale: 'de' }, f.deps);
    expect(f.calls.enabled).toEqual(['de']);
    expect(f.calls.items).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
    expect(f.calls.ui).toEqual(['de']);
    expect(r.status).toBe('done');
    expect(f.state.de.status).toBe('done');
  });

  it('stops inside the budget and leaves the rest to the sweep', async () => {
    const f = fake({ stale: items(10), itemMs: 30_000 });
    const r = await runTranslateSite({ locale: 'de', budget_seconds: 100 }, f.deps);
    expect(f.calls.items.length).toBeLessThan(10);
    expect(r.status).toBe('running');
    expect(r.remaining).toBe(10 - f.calls.items.length);
    expect(f.calls.ui).toEqual([]);
    // The sweep's call carries on where it stopped.
    const again = await runTranslateSite({ continue: true, budget_seconds: 120 }, f.deps);
    expect(again.locale).toBe('de');
    expect(f.state.de.translated).toBeGreaterThan(Number(r.translated_now));
  });

  it('a run that moves nothing is stuck, and the sweep leaves it alone', async () => {
    const f = fake({ stale: items(2), failSlugs: ['item-0', 'item-1'] });
    const r = await runTranslateSite({ locale: 'de' }, f.deps);
    expect(r.status).toBe('stuck');
    expect(String((r.failed as Array<{ error: string }>)[0].error)).toMatch(/AI provider/);
    const sweep = await runTranslateSite({ continue: true }, f.deps);
    expect(sweep.work_done).toBe(0);
  });

  it('the same error three times running stops the run: it is the setup, not the items', async () => {
    const f = fake({ stale: items(50), failSlugs: items(50).map((x) => x.slug) });
    const r = await runTranslateSite({ locale: 'de' }, f.deps);
    expect(f.calls.items.length).toBe(3);
    expect(r.status).toBe('stuck');
    expect(r.remaining).toBe(50);
  });

  it('Swedish needs no interface pass: the platform speaks it', async () => {
    const f = fake({ stale: [{ entity: 'blog_post', id: 'p', slug: 'en-post', locale: 'sv' }], enabled: ['sv', 'en'] });
    const r = await runTranslateSite({ locale: 'sv' }, f.deps);
    expect(f.calls.ui).toEqual([]);
    expect(f.calls.enabled).toEqual([]);
    expect(r.status).toBe('done');
  });

  it('dry_run counts and changes nothing', async () => {
    const f = fake({ stale: items(3) });
    const r = await runTranslateSite({ locale: 'de', dry_run: true }, f.deps);
    expect(r.items_to_translate).toBe(3);
    expect(f.calls.items).toEqual([]);
    expect(f.calls.enabled).toEqual([]);
    expect(f.state).toEqual({});
  });

  it('refuses a tag that is not a language', async () => {
    const r = await runTranslateSite({ locale: 'Swedish!' }, fake().deps);
    expect(r.code).toBe('INVALID_INPUT');
  });
});

describe('the admin and the sweep', () => {
  it('the language card says how far it has come', () => {
    const s = { de: { status: 'running', translated: 12, remaining: 30, ui_done: false } };
    expect(sweepLine(sweepFor(s, 'de'))).toMatch(/12 done, 30 left/);
    expect(anyRunning(s)).toBe(true);
    expect(sweepLine(sweepFor({ de: { status: 'stuck', failed: [{ entity: 'page', slug: 'x', error: 'No AI provider configured.' }] } }, 'de'))).toMatch(/AI provider/);
    expect(sweepFor({}, 'de')).toBeNull();
  });

  it('adding a language starts the translation; the button calls translate_site, not a page loop', () => {
    const ui = read('src/components/admin/settings/SiteLanguagesSettings.tsx');
    expect(ui).toMatch(/runTranslationSkill\('translate_site'/);
    expect(ui).not.toMatch(/runTranslationSkill\('translate_page'/);
    expect(ui).toMatch(/onSuccess: \(\) => \{ void translateSite\(tag\); \}/);
  });

  it('the sweep is a probed automation, and the probe exists', () => {
    const mod = read('src/lib/modules/pages-module.ts');
    expect(mod).toMatch(/name: 'Finish site translations'[\s\S]{0,600}work_probe: 'translation_sweep_running'[\s\S]{0,200}skill_name: 'translate_site'/);
    const sql = readdirSync(join(ROOT, 'supabase/migrations')).map((f) => read(`supabase/migrations/${f}`)).join('\n');
    expect(sql).toMatch(/FUNCTION public\.work_probe_translation_sweep_running\(\)/);
  });
});
