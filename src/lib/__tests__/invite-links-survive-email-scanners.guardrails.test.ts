/**
 * An invitation link must survive the email security scanner that fetches it
 * before the person does. GoTrue's action_link is consumed on the first GET;
 * on synclair (2026-10-23) a scanner with a "Windows 7 / Chrome 140" agent
 * accepted the invitation at 06:46:13 and the colleague saw "expired". The
 * mail now carries our own page with the hashed token, and the page spends
 * the token only when the person clicks Continue.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('the mail carries our page with the hashed token, never a verify URL', () => {
  const fn = code(read('supabase/functions/invite-colleague/index.ts'));

  it('both the invitation and the reset link are built from hashed_token on /account/activate', () => {
    expect(fn).toMatch(/\/account\/activate\?token_hash=\$\{encodeURIComponent\(props\.hashed_token\)\}&type=\$\{kind\}/);
    expect(fn).toMatch(/activationLink\(siteUrl, linkData\?\.properties, "recovery"\)/);
    expect(fn).toMatch(/activationLink\(siteUrl, linkData\.properties as [^,]+, "invite"\)/);
  });

  it('action_link is only the fallback — no path reads it as the link directly', () => {
    const direct = fn.match(/linkData\??\.properties\??\.action_link/g) ?? [];
    expect(direct).toEqual([]);
  });
});

describe('the activation page spends the token on a click, not on load', () => {
  const page = read('src/pages/account/ActivateAccountPage.tsx');

  it('a token_hash in the URL shows a Continue step and verifies on that click only', () => {
    expect(page).toMatch(/params\.get\('token_hash'\)/);
    expect(page).toMatch(/setStatus\('confirm'\)/);
    expect(page).toMatch(/verifyOtp\(\{ token_hash: tokenHash, type: tokenType \}\)/);
    // the verify lives in a click handler, never in the mount effect
    const effect = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('const [verifying'));
    expect(effect).not.toContain('verifyOtp');
  });

  it('a consumed or bad token lands on the existing expired screen', () => {
    expect(page).toMatch(/if \(error \|\| !data\.session\?\.user\?\.email\) \{\s*setStatus\('invalid'\)/);
  });
});
