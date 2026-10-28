import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hslTripletToHex,
  isFullDocument,
  wrapInShell,
  applyShell,
  type EmailShell,
} from '../../../supabase/functions/_shared/email-shell.ts';

/**
 * The branded shell is applied centrally in `email-send`, which every outbound
 * rail already passes through. That is what makes one branding setting reach
 * every mail — and also what makes a mistake here reach every mail.
 *
 * Twelve callers (invoice_email, quote_email, order_confirmation,
 * contract-sign, …) build complete HTML documents with their own header.
 * Wrapping those a second time gives the recipient two logos and two footers.
 * The protection is a property of the CONTENT (does it declare <html>?), not a
 * list of caller names that would go stale the day someone adds a thirteenth.
 */

const shell: EmailShell = {
  organizationName: 'Optic Tunnels',
  logoUrl: 'https://cdn.example.com/logo.png',
  primaryHex: '#12b3e6',
  siteUrl: 'https://www.optictunnels.eu',
  tagline: 'Den Nya Operatören', lang: 'sv',
};

describe('hslTripletToHex', () => {
  it('converts the design-token triplet mail clients cannot read', () => {
    expect(hslTripletToHex('0 100% 50%')).toBe('#ff0000');
    expect(hslTripletToHex('195 85% 48%')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('passes through hex an operator pasted into the field', () => {
    expect(hslTripletToHex('#1f6feb')).toBe('#1f6feb');
  });

  it('returns null for junk so the caller falls back to a default', () => {
    expect(hslTripletToHex('')).toBeNull();
    expect(hslTripletToHex(undefined)).toBeNull();
    expect(hslTripletToHex('cornflowerblue')).toBeNull();
  });
});

describe('isFullDocument — the double-branding guard', () => {
  it('detects the documents existing callers already build', () => {
    expect(isFullDocument('<!doctype html><html><body>hi</body></html>')).toBe(true);
    expect(isFullDocument('<html lang="sv"><body>hi</body></html>')).toBe(true);
    expect(isFullDocument('<body style="margin:0">hi</body>')).toBe(true);
    expect(isFullDocument('<!DOCTYPE HTML>\n<HTML>')).toBe(true);
  });

  it('treats ordinary content as a fragment', () => {
    expect(isFullDocument('<p>Hej!</p>')).toBe(false);
    expect(isFullDocument('<div><h1>Nyhetsbrev</h1></div>')).toBe(false);
    expect(isFullDocument('')).toBe(false);
  });

  it('does not mistake prose about html for markup', () => {
    // A newsletter about web development must still get the shell.
    expect(isFullDocument('<p>Skriv &lt;html&gt; i din editor</p>')).toBe(false);
    expect(isFullDocument('<p>htmlkurs på tisdag</p>')).toBe(false);
  });
});

describe('wrapInShell', () => {
  it('keeps the content and adds branding around it', () => {
    const out = wrapInShell('<p>Hej Hopp</p>', shell);
    expect(out).toContain('<p>Hej Hopp</p>');
    expect(out).toContain('https://cdn.example.com/logo.png');
    expect(out).toContain('#12b3e6');
    expect(out).toContain('www.optictunnels.eu');
  });

  it('falls back to a wordmark when no email-safe logo exists', () => {
    // Gmail blocks SVG, and a broken image icon looks worse than no logo.
    const out = wrapInShell('<p>x</p>', { ...shell, logoUrl: null });
    expect(out).not.toContain('<img');
    expect(out).toContain('Optic Tunnels');
  });

  it('escapes branding values instead of injecting them raw', () => {
    const out = wrapInShell('<p>x</p>', {
      ...shell,
      organizationName: 'Ac<script>me & Co',
      logoUrl: null,
    });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&amp;');
  });

  it('degrades to a bare frame when branding is unset', () => {
    const out = wrapInShell('<p>x</p>', {
      organizationName: '',
      logoUrl: null,
      primaryHex: '#1f6feb',
      siteUrl: '',
      tagline: null, lang: 'sv',
    });
    expect(out).toContain('<p>x</p>');
    expect(isFullDocument(out)).toBe(true);
  });
});

describe('applyShell', () => {
  it('wraps fragments', () => {
    expect(applyShell('<p>hej</p>', shell)).toContain('cdn.example.com/logo.png');
  });

  it('leaves complete documents byte-for-byte untouched', () => {
    const doc = '<!doctype html><html><body><h1>Faktura</h1></body></html>';
    expect(applyShell(doc, shell)).toBe(doc);
  });

  it('honours an explicit opt-out', () => {
    expect(applyShell('<p>hej</p>', shell, { skipBranding: true })).toBe('<p>hej</p>');
  });
});

describe('email-send wires the guard in', () => {
  const src = readFileSync(
    resolve(__dirname, '../../../supabase/functions/email-send/index.ts'),
    'utf-8',
  );
  // Strip comments before asserting: this suite has twice been fooled by a
  // comment that merely described the thing it was checking for.
  const code = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

  it('only wraps when the content is not already a document', () => {
    expect(code).toMatch(/!isFullDocument\(\s*body\.html\s*\)/);
  });

  it('applies branding after the signature, so the signature sits inside', () => {
    // Anchor on the CALL, not the identifier — the import line appears first
    // and would satisfy a naive indexOf while proving nothing about order.
    const call = code.indexOf('wrapInShell(body.html');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(code.indexOf('email-signature'));
  });

  it('never lets a branding failure block the send', () => {
    const call = code.indexOf('loadEmailShell(supabase)');
    expect(call).toBeGreaterThan(-1);
    const block = code.slice(call - 200, call + 400);
    expect(block).toContain('catch');
  });
});

describe('newsletter reads siteUrl from the row that actually holds it', () => {
  const src = readFileSync(
    resolve(__dirname, '../../../supabase/functions/newsletter/send.ts'),
    'utf-8',
  );
  const code = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

  it('does not look for a settings row keyed "siteUrl" — there is none', () => {
    // The old query succeeded and returned nothing, so every unsubscribe link
    // pointed at the raw functions URL on supabase.co instead of the
    // operator's domain. Same shape as the `.select('modules')` bug.
    expect(code).not.toMatch(/eq\(\s*["']key["']\s*,\s*["']siteUrl["']\s*\)/);
    expect(code).toMatch(/eq\(\s*["']key["']\s*,\s*["']general["']\s*\)/);
  });

  it('unsubscribe copy stays in the platform language', () => {
    // The fleet is multi-tenant: www and autoversio are English instances.
    // Hardcoding one customer's language in platform code ships it to all.
    const htmlBlock = code.slice(code.indexOf('const html = `'), code.indexOf('email-send'));
    expect(htmlBlock).toContain('Unsubscribe');
  });

  it('stays a fragment so email-send can brand it', () => {
    // If the newsletter emitted a full document it would become the only
    // unbranded mail the platform sends.
    const htmlBlock = code.slice(code.indexOf('const html = `'), code.indexOf('email-send'));
    expect(htmlBlock).not.toMatch(/<!doctype|<html[\s>]|<body[\s>]/i);
  });
});

describe('newsletter confirmation goes through the router', () => {
  const src = readFileSync(
    resolve(__dirname, '../../../supabase/functions/newsletter/subscribe.ts'),
    'utf-8',
  );
  const code = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

  it('does not talk to Resend directly', () => {
    // A direct provider client skipped the branded shell and the suppression
    // list, and — the real defect — made double opt-in impossible for an
    // operator running SMTP: no RESEND_API_KEY meant no confirmation mail at
    // all, silently auto-confirmed.
    expect(code).not.toMatch(/esm\.sh\/resend/);
    expect(code).not.toMatch(/new\s+ResendClass/);
    expect(code).not.toMatch(/RESEND_API_KEY/);
  });

  it('sends via email-send', () => {
    expect(code).toMatch(/functions\.invoke\(\s*["']email-send["']/);
  });

  it('treats a simulated send as "no mail was sent"', () => {
    // email-send answers {success:true, simulated:true} when NO provider is
    // configured. Reading that as a delivered mail leaves the subscriber
    // pending forever — the exact shape of the bug this replaced.
    expect(code).toMatch(/\.simulated/);
    const branch = code.slice(code.indexOf('.simulated'), code.indexOf('.simulated') + 260);
    expect(branch).toContain('autoConfirm');
  });

  it('does not confirm a subscriber whose mail failed to send', () => {
    // An unsent confirmation is not consent. Only an explicitly simulated
    // send (no provider at all) may auto-confirm.
    const failBranch = code.slice(
      code.indexOf('if (sendErr'),
      code.indexOf('} else if'),
    );
    expect(failBranch).not.toContain('autoConfirm');
  });

  it('promises "check your email" only when one was actually sent', () => {
    // The old message keyed off the API key existing, not off a send.
    expect(code).toMatch(/confirmationSent\s*$|confirmationSent\s*\n?\s*\?/m);
    expect(code).not.toMatch(/resendApiKey\s*\?/);
  });
});
