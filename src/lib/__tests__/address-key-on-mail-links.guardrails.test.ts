import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// An e-mail address is not a credential (2026-11-23). Three doors opened for
// whoever knew one: the newsletter's unsubscribe link, the function behind it,
// and the "my data" page, whose request answered with the secret itself.
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('a link about an address carries its key', () => {
  it('the newsletter mail signs its unsubscribe link', () => {
    const send = read('supabase/functions/newsletter/send.ts');
    expect(send).toMatch(/action=unsubscribe&email=\$\{[^}]+\}&t=\$\{await addressToken\(/);
  });

  it('unsubscribing checks the key before it writes', () => {
    const sub = read('supabase/functions/newsletter/subscribe.ts');
    const branch = sub.slice(sub.indexOf('action === "unsubscribe"'));
    expect(branch.indexOf('addressTokenMatches(')).toBeGreaterThan(-1);
    expect(branch.indexOf('addressTokenMatches(')).toBeLessThan(branch.indexOf('.update('));
  });

  it('the data page is never handed its key in an answer', () => {
    const gdpr = read('supabase/functions/newsletter/gdpr.ts');
    expect(gdpr).not.toMatch(/_dev_token|confirmation_token/);
    // The only place the key is made is the mailed link.
    expect(gdpr.match(/addressToken\(/g)?.length).toBe(1);
    expect(gdpr).toMatch(/manage\?token=\$\{await addressToken\(/);
    expect(gdpr).toMatch(/action === "verify" \|\| action === "export" \|\| action === "delete"[\s\S]{0,80}addressTokenMatches/);
    expect(read('src/pages/NewsletterManagePage.tsx')).not.toMatch(/_dev_token|unsubscribe_newsletter_by_email/);
  });

  it('no browser code calls a function a visitor may no longer execute', () => {
    const closed = ['request_callback', 'unsubscribe_newsletter_by_email', 'stitch_visitor_to_lead'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'integrations') walk(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const src = read(p);
        for (const fn of closed) if (new RegExp(`rpc\\(\\s*['"\`]${fn}['"\`]`).test(src)) hits.push(`${p}: ${fn}`);
      }
    };
    walk('src');
    expect(hits).toEqual([]);
  });
});
