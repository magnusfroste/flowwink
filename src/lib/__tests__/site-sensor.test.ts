import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assessRender,
  titleCandidates,
  splitDocumentTitle,
  classifyImage,
  observeImages,
  observeHeadings,
  observeBranding,
  siteNameFrom,
  declaredSiteName,
  assessRouting,
  slugTokens,
  textFingerprint,
  buildPageObservation,
  buildSiteSurvey,
  visibleTextLength,
} from '../../../supabase/functions/_shared/site-sensor.ts';

/**
 * migrate_url as a sensor.
 *
 * Every case below is a failure the old one-shot actually produced against
 * restagard.se on 2026-08-08, when an agent with a browser beat it on the same
 * nine pages. The extraction was fine; the composition and the honesty were not.
 */

const SHELL_HTML = `<html><head><title>Resta gård</title></head><body>
  <div id="root"></div>
  <script>${'x'.repeat(9000)}</script>
</body></html>`;

const REAL_PAGE = `<html lang="sv"><head>
  <title>Mjölk & mejeri | Resta gård</title>
  <meta name="description" content="Gräsmjölk på glasflaska.">
</head><body>
  <header><a href="/"><img src="/img/resta-logo.png" alt="Resta gård" width="1240" height="1240"></a></header>
  <h1>Resta gård</h1>
  <section class="hero"><img src="/img/betesmark.jpg" alt="Kor på bete" width="2000" height="1200"></section>
  <h2>Kvalitet slår kvantitet</h2>
  <p>${'Att dricka mjölk som kommer direkt från kon är något speciellt. '.repeat(20)}</p>
  <img src="/img/flaska.jpg" alt="Mjölkflaska" width="800" height="800">
  <img src="/icons/pil.svg" alt="" width="24" height="24">
</body></html>`;

describe('render report — the difference between "empty" and "blind"', () => {
  it('calls a JS shell a shell, and says the counts describe the shell', () => {
    const r = assessRender(SHELL_HTML, '', 'firecrawl');
    expect(r.confidence).toBe('shell');
    expect(r.client_rendered).toBe(true);
    expect(r.reason).toMatch(/not what the site contains/i);
    expect(r.suggestion).toMatch(/browser/i);
  });

  it('does NOT call a genuinely short page a shell — a small site is not a blind read', () => {
    const short = '<html><body><h1>Kontakt</h1><p>Ring 070-123 45 67.</p></body></html>';
    const r = assessRender(short, 'Kontakt. Ring 070-123 45 67.', 'firecrawl');
    expect(r.confidence).toBe('partial');
    expect(r.confidence).not.toBe('shell');
  });

  it('a rendered page is high confidence even when the framework markers are present', () => {
    const rendered = `<div id="root">${'Riktig läsbar text på sidan. '.repeat(60)}</div>`;
    const r = assessRender(rendered, '', 'firecrawl-retry');
    expect(r.confidence).toBe('high');
    expect(r.client_rendered).toBe(true); // honest: it IS client-rendered, we just caught it painted
  });

  it('carries the strategy, so a caller can always see HOW the page was read', () => {
    expect(assessRender(REAL_PAGE, '', 'jina').strategy).toBe('jina');
    expect(assessRender(REAL_PAGE, '', 'relay').strategy).toBe('relay');
  });

  it('counts text a human would read, not markup', () => {
    expect(visibleTextLength('<script>var a=1;</script><p>Hej</p>')).toBe(3);
  });
});

describe('title — the disagreement is handed over, never resolved silently', () => {
  it('splits the site name off the document title', () => {
    expect(splitDocumentTitle('Mjölk & mejeri | Resta gård')).toEqual({ page: 'Mjölk & mejeri', site: 'Resta gård' });
  });

  it('THE restagard bug: the only <h1> is the site name, on every single page', () => {
    const t = titleCandidates(REAL_PAGE, 'Mjölk & mejeri | Resta gård', 'https://restagard.se/mejeri');
    expect(t.h1_is_site_name).toBe(true);
    expect(t.recommended).toBe('Mjölk & mejeri');

    const h1 = t.candidates.find((c) => c.source === 'h1')!;
    expect(h1.value).toBe('Resta gård');
    expect(h1.confidence).toBe('low');
    expect(h1.note).toMatch(/SITE name/i);
  });

  it('offers the URL slug as a last resort rather than inventing "Untitled"', () => {
    const t = titleCandidates('<html><body><p>hej</p></body></html>', '', 'https://x.se/gardsbutiken');
    expect(t.recommended).toBe('Gardsbutiken');
  });

  it('trusts the <title> ELEMENT over the scraper\'s metadata.title', () => {
    // Live on restagard.se: Jina reported an FAQ heading from far down the page
    // as the document title while the tag said "Resta gård".
    const t = titleCandidates('<title>Resta gård</title><body>…', 'Hur kan jag köpa era produkter?', 'https://restagard.se/');
    expect(t.recommended).toBe('Resta gård');
  });

  it('THE second restagard bug, found live: <title> is the company on EVERY page', () => {
    // restagard.se ships <title>Resta Gård</title> everywhere and its first h1
    // is a shared FAQ heading. Confidence alone names nine pages after the farm.
    // The path is the one thing /hotell/ has that /gris/ does not.
    const html = '<header><img src="/logo.png" alt="Resta gård"></header>'
      + '<title>Resta Gård</title><h1>Hur kan jag köpa era produkter?</h1>';
    const t = titleCandidates(html, undefined, 'https://www.restagard.se/hotell/');
    expect(t.title_is_site_name).toBe(true);
    expect(t.candidates.find((c) => c.source === 'document_title')!.confidence).toBe('low');
    expect(t.recommended).toBe('Hotell');
  });

  it('decodes %-escaped slugs — "Mj%C3%B6lk Mejeri" is not a title', () => {
    const html = '<header><img src="/logo.png" alt="Resta gård"></header><title>Resta Gård</title>';
    const t = titleCandidates(html, undefined, 'https://www.restagard.se/mj%C3%B6lk-mejeri/');
    expect(t.recommended).toBe('Mjölk Mejeri');
  });

  it('but the path bonus never overrides a good title two tiers up', () => {
    const t = titleCandidates('<title>Vår historia – Acme</title>', undefined, 'https://acme.se/om-oss/');
    expect(t.recommended).toBe('Vår historia'); // not "Om Oss"
  });

  it('the site name must come from a NON-circular source, or every short title is one', () => {
    // Without og:site_name, a title suffix, or a logo alt, there is nothing to
    // compare against — and guessing would disqualify legitimate titles.
    expect(declaredSiteName('<title>Kontakt</title>')).toBeNull();
    expect(titleCandidates('<title>Kontakt</title>', undefined, 'https://x.se/kontakt/').title_is_site_name).toBe(false);
  });

  it('reads the site name off the logo alt when nothing declares it', () => {
    expect(declaredSiteName('<header><img class="logo" src="/l.png" alt="Resta gård"></header>')).toBe('Resta gård');
  });

  it('a normal page keeps its own h1 at usable confidence', () => {
    const html = '<title>Om oss – Acme</title><h1>Om oss</h1>';
    const t = titleCandidates(html, 'Om oss – Acme', 'https://acme.se/om-oss');
    expect(t.h1_is_site_name).toBe(false);
    expect(t.recommended).toBe('Om oss');
  });
});

describe('routing — reading A page is not reading THIS page', () => {
  // Found live on the deployed sensor, 2026-08-08: restagard.se returns the
  // SAME 206 KB document for every URL and routes client-side. /mjölk-mejeri/
  // came back with 6621 characters of the FAQ page — "high confidence" by any
  // length measure, and the wrong page.
  const SHARED_DOC_HEADINGS = [
    { level: 1, text: 'Hur kan jag köpa era produkter?' },
    { level: 2, text: 'Möt upp oss på REKO-ringar' },
  ];

  it('flags a document that never mentions its own path, and names the cause', () => {
    const r = assessRouting({
      url: 'https://www.restagard.se/mj%C3%B6lk-mejeri/',
      documentTitle: 'Resta Gård',
      siteName: 'Resta Gård',
      headings: SHARED_DOC_HEADINGS,
      text: 'Vi jobbar på att ordna så att det skall bli lättare att handla…',
    });
    expect(r.path_reflected).toBe(false);
    expect(r.reason).toMatch(/ONE shared document for every URL/i);
    expect(r.reason).toMatch(/routing client-side/i);
  });

  it('and the observation downgrades confidence — text volume is not identity', () => {
    const obs = buildPageObservation({
      url: 'https://www.restagard.se/mj%C3%B6lk-mejeri/',
      html: '<title>Resta Gård</title><h1>Hur kan jag köpa era produkter?</h1>',
      markdown: 'Möt upp oss på REKO-ringar. '.repeat(60),
      metadata: {}, platform: 'unknown', strategy: 'jina',
    });
    expect(obs.render.confidence).toBe('partial'); // NOT high, despite 1600+ chars
    expect(obs.render.reason).toMatch(/BUT:/);
    expect(obs._next).toMatch(/another page's content/i);
  });

  it('a page that does mention its path passes clean', () => {
    const r = assessRouting({
      url: 'https://restagard.se/mjolk-mejeri/',
      documentTitle: 'Mjölk & mejeri | Resta gård',
      siteName: 'Resta gård',
      headings: [{ level: 2, text: 'Gräsmjölk på glasflaska' }],
      text: 'Från gårdens lilla mejeri…',
    });
    expect(r.path_reflected).toBe(true);
  });

  it('the root URL has nothing to reflect and is never flagged', () => {
    expect(assessRouting({
      url: 'https://restagard.se/', documentTitle: 'Resta gård', siteName: 'Resta gård',
      headings: [], text: '',
    }).path_reflected).toBe(true);
  });

  it('slug tokens ignore extensions and locale noise, and decode %-escapes', () => {
    expect(slugTokens('https://x.se/mj%C3%B6lk-mejeri/index.html')).toEqual(['mjölk', 'mejeri']);
  });

  it('text_fingerprint lets the CALLER prove two URLs served the same document', () => {
    const a = textFingerprint('Möt upp oss på REKO-ringar.');
    const b = textFingerprint('  möt upp oss på  REKO-ringar. ');
    const c = textFingerprint('Gräsmjölk på glasflaska.');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('the site name comes from the site, not from a scraper guess', () => {
  it('prefers og:site_name when the site declared one', () => {
    expect(siteNameFrom('<meta property="og:site_name" content="Resta gård"><title>Mejeri | Annat</title>', 'https://x.se'))
      .toBe('Resta gård');
  });

  it('falls back to the <title> suffix', () => {
    expect(siteNameFrom('<title>Mjölk & mejeri | Resta gård</title>', 'https://x.se')).toBe('Resta gård');
  });

  it('and to the host — uninformative but never wrong', () => {
    expect(siteNameFrom('<html></html>', 'https://www.restagard.se')).toBe('restagard.se');
  });
});

describe('images — role beats size, because the biggest file was the logo', () => {
  it('a 1240x1240 seal named logo is a logo, however many pixels it has', () => {
    const c = classifyImage('/img/resta-logo.png', 'Resta gård', 1240, 1240, '<header>');
    expect(c.role_hint).toBe('logo');
  });

  it('a wide landscape photo is the hero candidate', () => {
    const c = classifyImage('/img/betesmark.jpg', 'Kor på bete', 2000, 1200, '<section>');
    expect(c.role_hint).toBe('hero');
  });

  it('small graphics are icons, not page imagery', () => {
    expect(classifyImage('/icons/pil.svg', '', 24, 24, '').role_hint).toBe('icon');
  });

  it('observeImages resolves relative sources against the page URL', () => {
    const imgs = observeImages(REAL_PAGE, 'https://restagard.se/mejeri');
    expect(imgs.map((i) => i.src)).toContain('https://restagard.se/img/betesmark.jpg');
    expect(imgs.find((i) => i.src.includes('resta-logo'))!.role_hint).toBe('logo');
    expect(imgs.find((i) => i.src.includes('betesmark'))!.role_hint).toBe('hero');
  });

  it('every image carries WHY it got its role — a hint you cannot audit is a guess', () => {
    for (const img of observeImages(REAL_PAGE, 'https://restagard.se/')) {
      expect(img.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('branding — null with a reason, never a silent {}', () => {
  it('an empty payload says which read strategy could not see it', () => {
    const b = observeBranding({}, 'jina');
    expect(b.branding).toBeNull();
    expect(b.branding_reason).toMatch(/text-only/i);
  });

  it('and for Firecrawl it distinguishes "no payload" from "no brand"', () => {
    expect(observeBranding(null, 'firecrawl').branding_reason).toMatch(/Not the same as/i);
  });

  it('a real payload comes through extracted', () => {
    const b = observeBranding({ colors: { primary: '#2b5d34' } } as never, 'firecrawl');
    expect(b.branding).not.toBeNull();
  });
});

describe('the observation is an observation — it contains no page', () => {
  const obs = buildPageObservation({
    url: 'https://restagard.se/mejeri',
    html: REAL_PAGE,
    markdown: 'Att dricka mjölk...'.repeat(60),
    metadata: { title: 'Mjölk & mejeri | Resta gård' },
    platform: 'unknown',
    strategy: 'firecrawl',
  });

  it('returns no blocks at all — composition is the agent\'s decision', () => {
    expect(obs).not.toHaveProperty('blocks');
    expect(obs._contract).toMatch(/no blocks and wrote nothing/i);
  });

  it('says out loud that the source has no hero or CTA to copy', () => {
    expect(obs._contract).toMatch(/no such elements to copy/i);
  });

  it('names the next tools instead of leaving the agent to guess', () => {
    expect(obs._contract).toMatch(/describe_blocks/);
    expect(obs._next).toMatch(/manage_page/);
  });

  it('summarises images by role so a composer can pick without re-scanning', () => {
    expect(obs.image_summary.logo).toBe(1);
    expect(obs.image_summary.hero).toBe(1);
    expect(obs.image_summary.icon).toBe(1);
  });

  it('keeps the heading tree — the section boundaries the text alone loses', () => {
    expect(observeHeadings(REAL_PAGE)).toEqual([
      { level: 1, text: 'Resta gård' },
      { level: 2, text: 'Kvalitet slår kvantitet' },
    ]);
  });

  it('on a shell it refuses forward: do not compose from this', () => {
    const blind = buildPageObservation({
      url: 'https://restagard.se/gris', html: SHELL_HTML, markdown: '',
      metadata: {}, platform: 'unknown', strategy: 'firecrawl',
    });
    expect(blind.render.confidence).toBe('shell');
    expect(blind._next).toMatch(/Do NOT compose/i);
  });
});

describe('the survey is an inventory, not a plan', () => {
  const survey = buildSiteSurvey({
    baseUrl: 'https://restagard.se',
    siteName: 'Resta gård',
    platform: 'wordpress',
    html: REAL_PAGE,
    markdown: 'x'.repeat(900),
    strategy: 'firecrawl',
    pages: [
      { url: 'https://restagard.se/mejeri', title: 'Mejeri', type: 'page', source: 'nav' },
      { url: 'https://restagard.se/blogg/host', title: 'Höst', type: 'blog', source: 'sitemap' },
    ],
    navigation: [{ label: 'Mejeri', url: 'https://restagard.se/mejeri' }],
  });

  it('reports what it found, categorised, with where each page came from', () => {
    expect(survey.page_count).toBe(2);
    expect(survey.has_blog).toBe(true);
    expect(survey.has_knowledge_base).toBe(false);
    expect(survey.pages[1].source).toBe('sitemap');
  });

  it('tells the agent to choose — a sitemap of 48 pages is not 48 pages worth keeping', () => {
    expect(survey._next).toMatch(/not a plan/i);
    expect(survey._next).toMatch(/action="read"/);
  });
});

// ---------------------------------------------------------------------------
// Wiring — the sensor only exists if the skill and the edge action agree
// ---------------------------------------------------------------------------

const moduleSrc = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/site-migration-module.ts'), 'utf-8');
const edgeSrc = readFileSync(
  resolve(__dirname, '../../../supabase/functions/migrate-page/index.ts'), 'utf-8');

describe('migrate_url exposes the sensor, and defaults to the harmless action', () => {
  it('offers survey / read / compose', () => {
    expect(moduleSrc).toMatch(/enum: \['survey', 'read', 'compose'\]/);
    expect(edgeSrc).toMatch(/if \(action === 'survey' \|\| action === 'read'\)/);
  });

  it('survey is the default — omitting action must never trigger a write', () => {
    expect(moduleSrc).toMatch(/survey \(default\)/);
  });

  it('the DESCRIPTION carries the behaviour rules, not only the instructions', () => {
    // The choice tier is what an agent reads before calling; a rule that only
    // lives in instructions is invisible to the skill scorer and to any agent
    // that does not take the lazy tier.
    const desc = moduleSrc.slice(moduleSrc.indexOf('MIGRATE_URL_DESCRIPTION ='), moduleSrc.indexOf('const SITEMIGRATION_SKILLS'));
    expect(desc).toMatch(/Returns NO blocks and writes nothing/);
    expect(desc).toMatch(/render\.confidence is "shell"/);
    expect(desc).toMatch(/Use when:/);
    expect(desc).toMatch(/NOT for:/);
  });

  it('the two description copies are the same constant — they cannot drift', () => {
    const uses = moduleSrc.match(/description: MIGRATE_URL_DESCRIPTION/g) || [];
    expect(uses.length).toBe(2);
  });

  it('sensor actions run before the AI is resolved — no model, no cost, no writes', () => {
    expect(edgeSrc.indexOf("action === 'survey'")).toBeLessThan(edgeSrc.indexOf('Resolve AI provider'));
  });
});

describe('the rendering ladder, and the rung that is a human browser', () => {
  it('retries with a longer paint window before giving up — the cheap unattended fix', () => {
    expect(edgeSrc).toMatch(/firecrawlPass\(6000, 'firecrawl-retry'\)/);
  });

  it('a shell answers in browser_fetch\'s relay envelope, so the extension relay handles it unchanged', () => {
    expect(edgeSrc).toMatch(/action: 'relay_required'/);
    expect(edgeSrc).toMatch(/relay_instruction: \{ type: 'navigate_and_scrape'/);
  });

  it('and still hands back what little it saw, labelled as partial', () => {
    expect(edgeSrc).toMatch(/partial_observation: observation/);
  });

  it('accepts a browser result as the top rung of the ladder', () => {
    expect(edgeSrc).toMatch(/const relay = body\.relay_result/);
    expect(edgeSrc).toMatch(/strategy: 'relay'/);
  });

  it('a rate-limited read says so, and says what to do — "429" alone is not actionable', () => {
    // Hit live on the sandbox: Jina 429s when no Firecrawl key is configured.
    expect(edgeSrc).toMatch(/rate-limiting this instance/);
    expect(edgeSrc).toMatch(/no FIRECRAWL_API_KEY configured/);
  });

  it('threads the survey\'s site_name into read — the fix for "every page is the company"', () => {
    expect(edgeSrc).toMatch(/siteName: body\.site_name/);
    expect(moduleSrc).toMatch(/site_name: \{/);
  });
});

describe('the dead discovery call is re-pointed', () => {
  it('discover no longer invokes firecrawl-map, which was deleted in the edge-surface consolidation', () => {
    expect(moduleSrc).not.toMatch(/invoke\('firecrawl-map'/);
    expect(moduleSrc).toMatch(/action: 'survey'/);
  });
});
