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

const ROOT = resolve(__dirname, '../../..');
const FUNCTIONS = join(ROOT, 'supabase/functions');
const read = (p: string) => readFileSync(p, 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const rel = (p: string) => p.replace(ROOT + '/', '');

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/**
 * Any absolute URL naming a FlowWink instance. `www.flowwink.com` is the
 * product's own marketing site and legitimately absolute; every *instance*
 * subdomain is not — instances are spun up, run and taken down, so an address
 * baked into shipped content is a link to someone else's site at best and to
 * nothing at all once that instance is gone.
 */
const INSTANCE_URL = /['"`]https?:\/\/(?!www\.flowwink\.com)[a-z0-9-]+\.flowwink\.com/i;

describe('no edge function hardcodes an instance address', () => {
  it('the decommissioned demo domain appears in no code path', () => {
    // No grandfathering left: agent-execute:3148 was the last holdout and now
    // resolves the address like everything else.
    //
    // A quoted occurrence is a value the code carries; an unquoted one is prose
    // in a comment (survey_send documents it as an example override). Stripping
    // trailing `//` comments is not an option here — every https:// URL would
    // be mangled by it.
    const offenders = walk(FUNCTIONS, ['.ts'])
      .filter((f) => /['"`][^'"`\n]*demo\.flowwink\.com/.test(strip(read(f))))
      .map(rel);
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

// ---------------------------------------------------------------------------
// Templates: a seeded site links to ITSELF, with a relative path
// ---------------------------------------------------------------------------

describe('no template ships an absolute URL to a FlowWink instance', () => {
  /**
   * The one that got past the first version of this guard.
   *
   * flowwink-agency carried seven `https://demo.flowwink.com` links — four CTA
   * buttons, a /docs link, a nav item, and a line of chat instructions telling
   * visitors to go there. Every site seeded from that template got dead buttons
   * and a nav entry pointing at a deleted project, and its assistant sent
   * people to a domain that NXDOMAINs.
   *
   * The category error is the interesting part, not the dead host: "Try Product
   * Demo" IS the site the visitor is already on. It was written when demo was a
   * separate neighbour to link across to; instances are spun up, run and taken
   * down, so there is no fixed neighbour. The same template already knew the
   * right shape one line above — `buttonUrl: '/roi-calculator'`.
   *
   * Relative wins on every domain and needs no substitution. Absolute is for
   * things that genuinely live elsewhere (the GitHub link beside these is
   * correctly absolute).
   */
  const TEMPLATE_DIRS = [
    join(ROOT, 'src/data/templates'),
    join(ROOT, 'templates'),
    join(FUNCTIONS, 'agent-execute'),
  ].filter((d) => {
    try { return statSync(d).isDirectory(); } catch { return false; }
  });

  it('no instance subdomain appears in template data', () => {
    const offenders: string[] = [];
    for (const dir of TEMPLATE_DIRS) {
      for (const f of walk(dir, ['.ts', '.json'])) {
        // Source templates are commented; generated JSON is not. Strip either
        // way so a comment explaining the rule cannot violate it.
        const src = f.endsWith('.json') ? read(f) : strip(read(f));
        if (INSTANCE_URL.test(src)) offenders.push(rel(f));
      }
    }
    expect(offenders, 'absolute instance URL in template data').toEqual([]);
  });

  it('the self-referential links became relative, not merely repointed', () => {
    // Repointing at sandbox.flowwink.com would have reproduced the bug with a
    // fresh host: still one named instance shipped to all of them.
    const agency = read(join(ROOT, 'src/data/templates/flowwink-agency.ts'));
    expect(agency).toMatch(/buttonUrl: '\/'/);
    expect(agency).toMatch(/secondaryButtonUrl: '\/docs'/);
    expect(agency).toMatch(/id: 'demo'[^}]*url: '\/'[^}]*openInNewTab: false/);
    // A link that truly points elsewhere stays absolute.
    expect(agency).toContain("https://github.com/magnusfroste/flowwink");
  });

  it('the generated artifacts were regenerated from the source', () => {
    // templates-to-json.ts writes three copies. A fix in the .ts that never
    // reaches _templates.json leaves the shipped seed broken — the drift this
    // repo keeps meeting between a source of truth and its emitted artifact.
    const emitted = read(join(FUNCTIONS, 'agent-execute/_templates.json'));
    expect(emitted).not.toMatch(/demo\.flowwink\.com/);
    expect(read(join(ROOT, 'templates/flowwink-agency.json'))).not.toMatch(/demo\.flowwink\.com/);
  });
});
