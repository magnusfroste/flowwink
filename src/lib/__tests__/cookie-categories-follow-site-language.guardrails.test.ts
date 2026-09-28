import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { operatorText } from '@/lib/operator-text';

/**
 * A July seed wrote SWEDISH cookie categories into every instance. The banner
 * lets the operator's words win on the site's own language, and the seed looked
 * like the operator's words — so English sites (www.flowwink.com, the MJP demo)
 * showed "Essentiella — Krävs för att sajten ska fungera." under English
 * headings. The fix reads the site's DECLARED language, never guesses.
 */
const root = join(__dirname, '../../..');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n');

describe('cookie categories follow the site language', () => {
  it('the cleanup reads site_languages and leaves Swedish sites alone', () => {
    const start = migrations.lastIndexOf('CREATE OR REPLACE FUNCTION public.cookie_categories_without_seed_swedish(');
    expect(start).toBeGreaterThan(-1);
    const body = migrations.slice(start, migrations.indexOf('$$;', start));
    expect(body).toMatch(/= 'sv' THEN RETURN p_value/);
    expect(migrations).toMatch(/SELECT l\.value->>'default' FROM public\.site_settings l WHERE l\.key = 'site_languages'/);
  });

  it('a category with no stored text falls to the language chain, English last', () => {
    expect(operatorText(undefined, 'Essential', 'en', 'en', 'Essential')).toBe('Essential');
    expect(operatorText('Nödvändiga', 'Essential', 'sv', 'sv', 'Essential')).toBe('Nödvändiga');
  });
});
