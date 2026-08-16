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
  it('the decommissioned demo domain appears in no code path', () => {
    // No grandfathering left: agent-execute:3148 was the last holdout and now
    // resolves the address like everything else.
    //
    // A quoted occurrence is a value the code carries; an unquoted one is prose
    // in a comment (survey_send documents it as an example override). Stripping
    // trailing `//` comments is not an option here — every https:// URL would
    // be mangled by it.
    const offenders = walk(FUNCTIONS)
      .filter((f) => /['"`][^'"`\n]*demo\.flowwink\.com/.test(strip(read(f))))
      .map((f) => f.replace(FUNCTIONS + '/', 'supabase/functions/'));
    expect(offenders, 'hardcoded demo domain in a code path').toEqual([]);
  });

  it('the QA agent is pointed at the running instance, or at nothing', () => {
    const src = strip(read(join(FUNCTIONS, 'agent-execute/index.ts')));
    expect(src).toMatch(/const siteUrl = await resolveSiteUrl\(supabase\)/);
    expect(src).toMatch(/\.\.\.\(siteUrl \? \{ url: siteUrl \} : \{\}\)/);
    // Without an address the instruction must stop telling it to test one.
    expect(src).toMatch(/no public site URL is configured/);
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

  it('keeps the house convention rather than a tidier one', () => {
    // agent-execute resolved this at two call sites before the helper existed:
    // PUBLIC_SITE_URL first, then four accepted spellings. A helper that read
    // only `siteUrl` would have narrowed those paths on adoption.
    expect(helper).toMatch(/Deno\.env\.get\('PUBLIC_SITE_URL'\)/);
    for (const key of ['siteUrl', 'site_url', 'public_url', 'publicUrl']) {
      expect(helper, `spelling ${key} dropped`).toContain(`'${key}'`);
    }
    // Env before setting, not after — measured on stripped source. The comment
    // above the env read mentions PUBLIC_SITE_URL, so an unstripped indexOf
    // compares against prose and passes even when the order is inverted.
    // (Caught by negative-testing this very assertion; third time comments have
    // sprung this trap in the repo.)
    const code = strip(helper);
    expect(code.indexOf('PUBLIC_SITE_URL')).toBeLessThan(code.indexOf("eq('key', 'general')"));
  });

  it('answers null rather than a guess when unset or unreadable', () => {
    // The property, not one phrasing of it: no host literal anywhere in the
    // module, and the catch returns null instead of inventing a fallback.
    expect(strip(helper), 'a host literal in the resolver is a guess')
      .not.toMatch(/['"`]https?:\/\//);
    const body = helper.slice(helper.indexOf('} catch'));
    expect(body).toMatch(/return null;/);
  });

  it('a2a omits the argument entirely when the address is unknown', () => {
    // A skill that builds a link is better off with no value than a wrong one.
    expect(a2a).toMatch(/u \? \{ _site_url: u \} : \{\}/);
  });

  it('a2a names the running instance in the system prompt, or nothing', () => {
    expect(a2a).toMatch(/autonomous CMS operator for FlowWink\$\{siteUrl \? ` \(\$\{siteUrl\}\)` : ''\}/);
  });
});
