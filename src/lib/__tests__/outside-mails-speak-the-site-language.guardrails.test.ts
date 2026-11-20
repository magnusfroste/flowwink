/**
 * Mail to people outside the business speaks the site's language (2026-11-20).
 *
 * The signature request ("Signature requested — …") and the purchase order to a
 * vendor ("Purchase Order …") were English on every site. The signature request
 * also wrote the document title and the sender's message into its HTML as
 * typed, and fell back to another site's address when the site had none.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

describe('mail to outsiders', () => {
  const sign = read('supabase/functions/document-sign-request/index.ts');

  it('the signature request is written with visitor texts, escaped', () => {
    expect(sign).toMatch(/t\("docsign\.mail\.subject"/);
    expect(sign).not.toMatch(/Signature requested/);
    expect(sign).toMatch(/escapeHtml\(rq\.message\)/);
    expect(sign).not.toMatch(/\$\{docTitle\}/);
  });

  it('a signing link never points at another site', () => {
    expect(sign).not.toMatch(/lovable\.app/);
    expect(sign).toMatch(/if \(!origin\)/);
  });

  it('the purchase order to a vendor is written with visitor texts', () => {
    const core = read('supabase/functions/_shared/execute/core.ts');
    expect(core).toMatch(/t\('po\.mail\.subject'/);
    expect(core).not.toMatch(/subject: `Purchase Order \$\{/);
  });
});
