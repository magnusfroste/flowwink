import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * quotes.accept_behavior decides what the quote flow's language may CLAIM.
 *
 * In 'invoice' mode the quote is the final document — accepting it is a
 * binding e-signature, and saying so is correct. In 'contract' mode the
 * binding moment is the agreement signature that follows; if the quote page
 * still says "Accept & Sign" / "binding electronic signature", the customer
 * signs twice for one deal and the second, real signature reads as a
 * formality. The dial already governed the server (quote-sign) and the admin
 * sheet — these guards make sure the customer-facing language obeys it too,
 * and stays SWITCHED, never hardcoded to either mode.
 */

const read = (p: string) =>
  readFileSync(resolve(__dirname, '../../../', p), 'utf-8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');

describe('public quote page', () => {
  const code = read('src/pages/PublicQuotePage.tsx');

  it('reads the dial', () => {
    expect(code).toContain('useQuoteProcessSettings');
    expect(code).toMatch(/accept_behavior\s*===\s*'contract'/);
  });

  it('keeps both modes — neither wording is hardcoded away', () => {
    // Invoice mode must still be a signing ceremony…
    expect(code).toContain('Accept & Sign');
    expect(code).toContain('binding electronic signature');
    // …and contract mode must exist as the approval alternative.
    expect(code).toContain('Approve quote');
  });

  it('gates the signature pad on the dial', () => {
    // The pad may only render when NOT in contract mode.
    expect(code).toMatch(/mode === 'accept' && !contractMode/);
  });

  it('tells the contract-mode customer what happens next', () => {
    // The agreement arriving for signature must read as the plan,
    // not a surprise second round of paperwork.
    expect(code).toMatch(/agreement[\s\S]{0,80}signature/i);
  });
});

describe('quote email', () => {
  const code = read('supabase/functions/comms-send/quote_email.ts');

  it('reads the dial from settings, not a hardcoded assumption', () => {
    expect(code).toMatch(/eq\(\s*['"]key['"]\s*,\s*['"]quotes['"]\s*\)/);
    expect(code).toMatch(/accept_behavior/);
  });

  it('switches the button between sign and approve', () => {
    expect(code).toContain('View &amp; approve quote');
    expect(code).toContain('View &amp; sign quote');
    // The choice must reach the renderer as data, not stay in dead code.
    expect(code).toMatch(/contractMode\s*\?/);
  });
});

describe('certificate page', () => {
  const code = read('src/pages/SignatureCertificatePage.tsx');

  it('a quote accept in contract mode is a record, not a certificate', () => {
    expect(code).toContain("t('certificate.acceptanceTitle', 'Acceptance record')");
    // Contract certificates keep the signature framing in BOTH modes —
    // the agreement is always signed.
    expect(code).toMatch(/kind === 'quote' && contractMode/);
  });
});
