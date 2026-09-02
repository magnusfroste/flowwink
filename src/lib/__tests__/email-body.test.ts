import { describe, it, expect } from 'vitest';
import { formatPlainEmail, linkify, escapeHtml } from '../email-body';

describe('formatPlainEmail — readable, not a mail client', () => {
  it('turns CRLF text into paragraphs and folds the "-- " signature away (the GitHub case)', () => {
    const r = formatPlainEmail('Merged #429 into main.\r\n\r\n-- \r\nReply to this email directly or view it on GitHub:\r\nhttps://github.com/x/y/pull/429\r\n');
    expect(r.main).toBe('<p>Merged #429 into main.</p>');
    expect(r.signature).toContain('<a href="https://github.com/x/y/pull/429"');
    expect(r.quoted).toBeNull();
  });

  it('folds the quoted reply below "On … wrote:" and "Den … skrev:"', () => {
    const en = formatPlainEmail('Thanks, works now.\n\nOn Tue, Sep 2, 2026 at 10:00 Anna <anna@x.se> wrote:\n> Did the fix land?\n> /Anna');
    expect(en.main).toBe('<p>Thanks, works now.</p>');
    expect(en.quoted).toContain('Did the fix land?');
    // the "> " quote prefixes are stripped; the header's <address> stays (escaped)
    expect(en.quoted).not.toContain('&gt; Did');
    expect(en.quoted).toContain('href="mailto:anna@x.se"');
    const sv = formatPlainEmail('Tack!\n\nDen tis 2 sep. 2026 kl 10:00 skrev Anna <anna@x.se>:\n> Landade fixen?');
    expect(sv.main).toBe('<p>Tack!</p>');
    expect(sv.quoted).toContain('Landade fixen?');
  });

  it('a trailing run of "> " lines is quoted even without a header', () => {
    const r = formatPlainEmail('Yes.\n\n> original\n> text');
    expect(r.main).toBe('<p>Yes.</p>');
    expect(r.quoted).toBe('<p>original<br>text</p>');
  });

  it('escapes markup before linking — a stranger’s HTML never executes', () => {
    const r = formatPlainEmail('<img src=x onerror=alert(1)> see https://a.b/c?x=1&y=2');
    expect(r.main).not.toContain('<img');
    expect(r.main).toContain('&lt;img');
    expect(r.main).toContain('<a href="https://a.b/c?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">');
  });

  it('links e-mail addresses and keeps single newlines as line breaks inside a paragraph', () => {
    expect(linkify(escapeHtml('write anna@x.se'))).toContain('<a href="mailto:anna@x.se">anna@x.se</a>');
    expect(formatPlainEmail('line one\nline two').main).toBe('<p>line one<br>line two</p>');
  });

  it('empty input is empty output, not a crash', () => {
    expect(formatPlainEmail(null)).toEqual({ main: '', quoted: null, signature: null });
  });
});
