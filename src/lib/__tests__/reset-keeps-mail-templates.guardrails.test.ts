import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: a reset does not take the mail templates with it (2026-11-20).
 *
 * sandbox's nightly rebuild emptied email_templates and nothing put the rows
 * back — they are seeded by migrations, which run once. Every mail sandbox
 * sent was the built-in English fallback. The platform's templates now have
 * one reseedable home, seed_platform_email_templates(), and a template added
 * by a later migration must be added there too, or the next rebuild loses it.
 */
const dir = join(process.cwd(), 'supabase/migrations');
const FIX = '20261120090000_en-aterstallning-tar-inte-mejlmallarna.sql';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sqlOnly = (text: string) => text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const fix = sqlOnly(readFileSync(join(dir, FIX), 'utf-8'));

describe('a reset does not take the mail templates with it', () => {
  it('the sandbox rebuild reseeds them after its wipe', () => {
    const wipe = fix.slice(fix.indexOf('FUNCTION public.sandbox_reset_wipe'), fix.indexOf('FUNCTION public.reset_site_data'));
    expect(wipe).toMatch(/PERFORM public\.seed_platform_email_templates\(\);\s+RETURN jsonb_build_object/);
  });

  it('resetting a site\'s data keeps the business\'s templates', () => {
    const reset = fix.slice(fix.indexOf('FUNCTION public.reset_site_data'));
    const keep = reset.slice(reset.indexOf('KEEP text[] := ARRAY['), reset.indexOf('];'));
    expect(keep).toMatch(/'email_templates'/);
  });

  it('the seed never replaces a version an instance wrote, and carries both languages', () => {
    const seed = fix.slice(fix.indexOf('FUNCTION public.seed_platform_email_templates'), fix.indexOf('$seed$;'));
    expect(seed).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM public\.email_templates e WHERE e\.name = t\.name AND e\.locale = t\.locale\)/);
    expect(seed).not.toMatch(/ON CONFLICT[^;]*DO UPDATE/);
    for (const kind of ['invoice_email', 'quote_email', 'contract_email', 'booking_confirmation', 'order_receipt']) {
      expect(seed, kind).toContain(`('${kind}', 'en',`);
      expect(seed, kind).toContain(`('${kind}', 'sv',`);
    }
  });

  it('a later migration that seeds a template also teaches the reseed', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f <= FIX) continue;
      const sql = sqlOnly(readFileSync(join(dir, f), 'utf-8'));
      if (/INSERT INTO (public\.)?email_templates/i.test(sql) && !/FUNCTION public\.seed_platform_email_templates/.test(sql)) offenders.push(f);
    }
    expect(offenders, 'redefine public.seed_platform_email_templates() with the new rows in the same migration').toEqual([]);
  });
});
