/**
 * Block fields are the page's own words, in the page's language. optic
 * (2026-10-25): the English contact form showed the pack's "Send message"
 * instead of Svante's "Send" — before and after the overlay conversion —
 * because the form ran its own fields through operatorText, the rule for
 * SETTINGS written in the site's language.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickBlockText } from '@/lib/page-content-language';

const page = (fallback: string[] = []) => ({ lang: 'en', fallbackUnits: new Set(fallback) });

describe('pickBlockText', () => {
  it('on a public page the block field is shown as written (optic: "Send")', () => {
    expect(pickBlockText('Send', 'Send message', 'ct-form.data.submitButtonText', page(), 'en', 'sv')).toBe('Send');
  });

  it('a field still showing the source language falls back to the pack in the visitor language', () => {
    expect(pickBlockText('Skicka', 'Send message', 'ct-form.data.submitButtonText', page(['ct-form.data.submitButtonText']), 'en', 'sv')).toBe('Send message');
  });

  it('an empty field is the pack', () => {
    expect(pickBlockText('  ', 'Send message', 'x.data.submitButtonText', page(), 'en', 'sv')).toBe('Send message');
  });

  it('without a page context (editor, preview) the settings rule applies unchanged', () => {
    expect(pickBlockText('Skicka', 'Send message', 'x.data.submitButtonText', null, 'en', 'sv')).toBe('Send message');
    expect(pickBlockText('Skicka', 'Skicka (pack)', 'x.data.submitButtonText', null, 'sv', 'sv')).toBe('Skicka');
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('the form block reads its own fields through useBlockText, keyed like translation units', () => {
    const src = read('src/components/public/blocks/FormBlock.tsx');
    expect(src).toContain('useBlockText(blockId)');
    expect(src).toContain("blockText('submitButtonText', data.submitButtonText,");
    expect(src).toContain("blockText('successMessage', data.successMessage,");
    expect(src).toMatch(/blockText\(`fields\[\$\{data\.fields\.indexOf\(field\)\}\]\.placeholder`/);
    expect(src).not.toMatch(/operatorText\(data\./);
  });

  it('the public page provides the served language and the fallback units', () => {
    expect(read('src/pages/PublicPage.tsx')).toMatch(/<PageContentLanguageProvider lang=\{declaredLang\} fallbackUnits=\{rawPageData\?\.language\?\.fallback_units\}>/);
  });
});
