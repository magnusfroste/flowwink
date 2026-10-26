import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickTermsInLanguage } from '@/lib/terms-language';

/**
 * First pass over the platform for language bugs (2026-10-26). Each case is a
 * control that looked right and did nothing, or a reader that answered in the
 * wrong language.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('terms: one version per kind, in the visitor\'s language', () => {
  const rows = [
    { id: '1', contract_type: 'customer', language: 'sv', name: 'Villkor' },
    { id: '2', contract_type: 'customer', language: 'en', name: 'Terms' },
    { id: '3', contract_type: 'privacy', language: 'sv', name: 'Integritet' },
    { id: '4', contract_type: null, language: 'en', name: 'Loose' },
  ];
  it('/en/terms shows the English customer terms, not both', () => {
    expect(pickTermsInLanguage(rows, 'en', 'sv').map((r) => r.id)).toEqual(['2', '3', '4']);
  });
  it('/terms on a Swedish site shows the Swedish ones', () => {
    expect(pickTermsInLanguage(rows, 'sv', 'sv').map((r) => r.id)).toEqual(['1', '3', '4']);
  });
});

describe('email templates are saved per language', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const latest = (fn: string) => readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => read(`supabase/migrations/${f}`).includes(`FUNCTION public.${fn}(`)).pop()!;

  it('upsert conflicts on (name, locale) — the key since 20260903110000', () => {
    const sql = read(`supabase/migrations/${latest('upsert_email_template')}`);
    expect(sql).toMatch(/ON CONFLICT \(name, locale\)/);
  });
  it('partner_language reads the site language, not the whole format object', () => {
    const sql = read(`supabase/migrations/${latest('partner_language')}`);
    const body = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.partner_language('));
    expect(body).toMatch(/key = 'site_languages'/);
    expect(body).not.toMatch(/#>> '\{\}'/);
  });
  it('email-send resolves a named template by language', () => {
    expect(read('supabase/functions/email-send/index.ts')).toMatch(/rpc\("resolve_email_template"/);
  });
  it('the mail frame is not hard-coded Swedish', () => {
    expect(read('supabase/functions/_shared/email-shell.ts')).not.toMatch(/<html lang="sv">/);
  });
});

describe('the header follows the visitor when the page says nothing', () => {
  it('PublicNavigation falls back to the visitor language', () => {
    expect(read('src/components/public/PublicNavigation.tsx')).toMatch(/localeProp \?\? visitorLang/);
  });
});

describe('no row-model translation dialog in the pages list', () => {
  it('Translations opens the editor\'s view', () => {
    const src = read('src/pages/admin/PagesListPage.tsx');
    expect(src).not.toMatch(/PageTranslationsDialog/);
    expect(src).toMatch(/\?translations=/);
  });
});
