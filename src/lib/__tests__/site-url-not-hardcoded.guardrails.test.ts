/**
 * An instance knows its own address — it does not carry someone else's.
 *
 * The A2A bridge shipped `_site_url: 'https://demo.flowwink.com'` as a literal
 * into every inbound skill call, and put the same domain in the agent's system
 * prompt. That named ONE instance for the whole fleet, and after the demo
 * project was deleted (2026-08-15) it named a domain that NXDOMAINs.
 *
 * `site_settings.general.siteUrl` was already the platform's answer: the
 * contract renderer reads it for {{terms_url}} and {{site_url}}, the email
 * shell reads it for the header link. Now the edge functions read it through
 * one helper instead of guessing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FUNCTIONS = resolve(__dirname, '../../../supabase/functions');
const read = (p: string) => readFileSync(p, 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('no edge function hardcodes an instance address', () => {
  /**
   * Grandfathered, and tracked — not accepted.
   *
   * agent-execute:3148 hands the autonomous-testing skill
   * `site.url = 'https://demo.flowwink.com'` with the description "test this
   * URL, not any template/example domains", so the QA agent on every instance
   * is pointed at the deleted project. It is a one-line fix (resolveSiteUrl,
   * same as here) but agent-execute belongs to the local session; reported
   * rather than edited. Remove this entry when it lands — the test then guards
   * the whole surface.
   */
  const GRANDFATHERED = ['supabase/functions/agent-execute/index.ts'];

  it('the decommissioned demo domain appears in no code path', () => {
    // A quoted occurrence is a value the code carries; an unquoted one is prose
    // in a comment (survey_send documents it as an example override). Stripping
    // trailing `//` comments is not an option here — every https:// URL would
    // be mangled by it.
    const offenders = walk(FUNCTIONS)
      .filter((f) => /['"`][^'"`\n]*demo\.flowwink\.com/.test(strip(read(f))))
      .map((f) => f.replace(FUNCTIONS + '/', 'supabase/functions/'))
      .filter((f) => !GRANDFATHERED.includes(f));
    expect(offenders, 'hardcoded demo domain in a code path').toEqual([]);
  });

  it('the grandfathered file is still the only one — and still there', () => {
    // If this fails because the file no longer matches, the fix landed: delete
    // the entry above. A guard that silently stops guarding is the failure mode
    // this repo keeps meeting.
    const src = strip(read(join(FUNCTIONS, 'agent-execute/index.ts')));
    expect(/['"`][^'"`\n]*demo\.flowwink\.com/.test(src),
      'agent-execute no longer hardcodes the domain — remove it from GRANDFATHERED').toBe(true);
  });
});

describe('the address has one reader', () => {
  const helper = read(join(FUNCTIONS, '_shared/site-url.ts'));
  const a2a = strip(read(join(FUNCTIONS, 'a2a/index.ts')));

  it('reads the same setting the SQL side reads', () => {
    // 20260808180000 / 20260808230000: value->>'siteUrl' under key 'general'.
    expect(helper).toMatch(/\.eq\('key', 'general'\)/);
    expect(helper).toMatch(/siteUrl/);
  });

  it('answers null rather than a guess when unset or unreadable', () => {
    expect(helper).toMatch(/return url\.length > 0 \? url : null/);
    // The catch must not invent a fallback host.
    const body = helper.slice(helper.indexOf('} catch'));
    expect(body).not.toMatch(/https?:\/\//);
  });

  it('a2a omits the argument entirely when the address is unknown', () => {
    // A skill that builds a link is better off with no value than a wrong one.
    expect(a2a).toMatch(/u \? \{ _site_url: u \} : \{\}/);
  });

  it('a2a names the running instance in the system prompt, or nothing', () => {
    expect(a2a).toMatch(/autonomous CMS operator for FlowWink\$\{siteUrl \? ` \(\$\{siteUrl\}\)` : ''\}/);
  });
});
