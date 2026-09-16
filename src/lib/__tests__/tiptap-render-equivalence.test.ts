import { describe, it, expect } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { renderToHtml, createDocumentFromMarkdown, isTiptapDocument } from '@/lib/tiptap-utils';
import { ALL_TEMPLATES } from '@/data/templates';

/**
 * The pure renderer must produce EXACTLY what the editor produced.
 *
 * `renderToHtml` used to call @tiptap's generateHTML, which dragged the whole
 * editor into every public page (optic's landing page, 2026-09-16). It is now a
 * hand-written serializer. This test keeps the old implementation, verbatim,
 * as the reference, and compares string for string -- not "looks the same".
 *
 * @tiptap stays a dependency for the admin editor, so the reference is always
 * the version the editor itself uses; an upgrade that changes serialisation
 * fails here instead of drifting silently on a public page.
 */

const X = [StarterKit, Link];

/** The previous renderToHtml, unchanged apart from logging. */
function reference(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') {
    if (/^\s*</.test(content)) {
      try { return generateHTML(generateJSON(content, X), X); } catch { return ''; }
    }
    try { return generateHTML(createDocumentFromMarkdown(content), X); } catch { return ''; }
  }
  if (isTiptapDocument(content)) {
    try { return generateHTML(content, X); } catch { return ''; }
  }
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (first?.type === 'text' && first?.data?.content) {
      try { return generateHTML(first.data.content, X); } catch { /* fall through */ }
    }
  }
  return '';
}

const expectSame = (label: string, input: unknown) =>
  expect(renderToHtml(input), label).toBe(reference(input));

const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const li = (...content: unknown[]) => ({ type: 'listItem', content });
const B = { type: 'bold' }, I = { type: 'italic' }, S = { type: 'strike' }, C = { type: 'code' }, U = { type: 'underline' };
const L = (href: string, extra: Record<string, unknown> = {}) => ({ type: 'link', attrs: { href, ...extra } });
const NBSP = String.fromCharCode(0xa0);

describe('pure renderToHtml === @tiptap generateHTML', () => {
  it('every node type', () => {
    const cases: Record<string, unknown> = {
      para: doc(p(t('Hej & <värld> "citat" \'x\''))),
      emptyPara: doc({ type: 'paragraph' }),
      emptyDoc: doc(),
      headings: doc(...[1, 2, 3, 4, 5, 6].map((l) => ({ type: 'heading', attrs: { level: l }, content: [t('H' + l)] }))),
      headingNoLevel: doc({ type: 'heading', content: [t('h')] }),
      bullet: doc({ type: 'bulletList', content: [li(p(t('a'))), li(p(t('b')))] }),
      ordered: doc({ type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('c')))] }),
      orderedStart1: doc({ type: 'orderedList', attrs: { start: 1 }, content: [li(p(t('a')))] }),
      orderedNoAttrs: doc({ type: 'orderedList', content: [li(p(t('a')))] }),
      nestedLists: doc({ type: 'bulletList', content: [li(p(t('a')), { type: 'orderedList', content: [li(p(t('b')))] })] }),
      blockquote: doc({ type: 'blockquote', content: [p(t('q1')), p(t('q2'))] }),
      code: doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [t('a < b && c')] }),
      codeNoLang: doc({ type: 'codeBlock', attrs: { language: null }, content: [t('x')] }),
      codeEmpty: doc({ type: 'codeBlock' }),
      hrBr: doc(p(t('a'), { type: 'hardBreak' }, t('b')), { type: 'horizontalRule' }),
      nbsp: doc(p(t('a' + NBSP + 'b'))),
      textAlignIgnored: doc({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('c')] }),
    };
    for (const [k, v] of Object.entries(cases)) expectSame(k, v);
  });

  it('marks: ranks, grouping across adjacent text, link attributes', () => {
    const cases: Record<string, unknown> = {
      single: doc(p(t('b', [B]), t('i', [I]), t('s', [S]), t('c', [C]), t('u', [U]))),
      stacked: doc(p(t('x', [B, I]))),
      storedReversed: doc(p(t('x', [I, B]))),
      groupSharedOuter: doc(p(t('a', [B]), t('b', [B, I]), t('c', [B]))),
      groupBreaksOnInner: doc(p(t('a', [B, I]), t('b', [I]), t('c', [B, I]))),
      codeInsideBold: doc(p(t('a', [B]), t('b', [B, C]), t('c', [B]))),
      linkDefault: doc(p(t('l', [L('/intern')]))),
      linkSelf: doc(p(t('l', [L('/x', { target: '_self' })]))),
      linkNullTarget: doc(p(t('l', [L('/x', { target: null, rel: 'me', class: 'k' })]))),
      linkEscapes: doc(p(t('q', [L('/a?x="1"&y=2' + NBSP)]))),
      linkAndBold: doc(p(t('a', [L('/x'), B]), t('b', [L('/x')]))),
      twoLinks: doc(p(t('a', [L('/x')]), t('b', [L('/y')]))),
      sameHrefDifferentTarget: doc(p(t('a', [L('/x')]), t('b', [L('/x', { target: '_self' })]))),
      sameLinkExplicitDefault: doc(p(t('a', [L('/x')]), t('b', [L('/x', { target: '_blank' })]))),
      marksInHeading: doc({ type: 'heading', attrs: { level: 2 }, content: [t('a', [B]), t('b')] }),
      marksAcrossHardBreak: doc(p(t('a', [B]), { type: 'hardBreak' }, t('b', [B]))),
    };
    for (const [k, v] of Object.entries(cases)) expectSame(k, v);
  });

  it('failure semantics: both render nothing', () => {
    expectSame('unknownNode', doc(p(t('ok')), { type: 'mystery', content: [t('x')] }));
    expectSame('unknownMark', doc(p(t('x', [{ type: 'highlight' }]))));
    expectSame('emptyText', doc(p(t(''))));
    expect(renderToHtml(doc(p(t('ok')), { type: 'mystery' }))).toBe('');
  });

  it('legacy HTML strings', () => {
    const cases = [
      '<p>Varje dag <strong>klistras</strong> text in.</p><p>Andra stycket.</p>',
      '<p><b>x</b> <strong>y</strong> <em>z</em> <i>w</i></p>',
      '<div>a <b>b</b></div>',
      '<div>a</div><script>alert(1)</script><p onclick="x">b</p>',
      '<h2>R</h2><ul><li>a</li></ul>',
      '<p>a<br>b</p>',
      '<p>a <br> b</p>',
      '<p><a href="/x" target="_self">l</a> och <a href="https://e.se">e</a></p>',
      '<p><a href="javascript:alert(1)">bad</a></p>',
      '<p><strong><em>x</em></strong></p>',
      '<p><span style="font-weight:bold">x</span> <span style="font-style: italic">y</span></p>',
      '<p>a &amp; b &lt; c</p>',
      '<p></p><p>x</p>',
      '<p>  a   b  </p>',
      '<p>\n  lead\n  and trail  \n</p>',
      '<ul><li>x</li><li><strong>y</strong></li></ul>',
      '<ol start="4"><li><p>a</p></li></ol>',
      '<blockquote><p>q</p></blockquote>',
      '<pre><code class="language-js">const a = 1;</code></pre>',
      '<hr><p>after</p>',
      '<p>x</p>\n\n<p>y</p>',
      '<h1>T</h1>\n<p>body <s>gone</s> <u>under</u> <code>c</code></p>',
    ];
    cases.forEach((h, i) => expectSame(`html#${i}: ${h.slice(0, 40)}`, h));
  });

  it('markdown strings', () => {
    const cases = [
      '# Rubrik\n\nEtt stycke med **fet** och *kursiv* text.',
      '- ett\n- två\n\n1. a\n2. b',
      'Bara en rad.',
      '## H2\n\n> citat\n\n[länk](https://example.com)',
    ];
    cases.forEach((m, i) => expectSame(`md#${i}`, m));
  });

  it('every rich-text value in every bundled template', () => {
    const docs: unknown[] = [];
    const seen = new WeakSet<object>();
    const walk = (v: unknown) => {
      if (!v || typeof v !== 'object') return;
      if (seen.has(v as object)) return;
      seen.add(v as object);
      if (isTiptapDocument(v)) { docs.push(v); return; }
      for (const child of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walk(child);
    };
    walk(ALL_TEMPLATES);
    expect(docs.length, 'the walker must actually find template content').toBeGreaterThan(50);
    docs.forEach((d, i) => expectSame(`template doc #${i}`, d));
  });

  it('500 random documents from the schema', () => {
    // Seeded, so a failure reproduces.
    let seed = 0x5eed;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const words = ['a', 'Hej', 'x & y', '<b>', '"q"', 'lång text här', 'å ä ö', 'n' + NBSP + 'b'];
    const markPool = () => {
      const ms: unknown[] = [];
      for (const m of [B, I, S, C, U]) if (rnd() < 0.25) ms.push(m);
      if (rnd() < 0.15) ms.push(L(pick(['/a', '/b?x=1&y=2', 'https://e.se']), rnd() < 0.3 ? { target: pick(['_self', null, '_blank']) } : {}));
      return ms.length ? ms : undefined;
    };
    const inline = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () =>
      rnd() < 0.1 ? { type: 'hardBreak' } : t(pick(words), markPool()));
    const block = (depth: number): unknown => {
      const r = rnd();
      if (depth > 2 || r < 0.35) return p(...inline());
      if (r < 0.5) return { type: 'heading', attrs: { level: 1 + Math.floor(rnd() * 6) }, content: inline() };
      if (r < 0.65) return { type: 'bulletList', content: [li(block(depth + 1)), li(p(...inline()))] };
      if (r < 0.75) return { type: 'orderedList', attrs: { start: pick([1, 2, 5]) }, content: [li(p(...inline()))] };
      if (r < 0.85) return { type: 'blockquote', content: [block(depth + 1)] };
      if (r < 0.92) return { type: 'codeBlock', attrs: { language: pick([null, 'ts']) }, content: [t(pick(words))] };
      return { type: 'horizontalRule' };
    };
    for (let i = 0; i < 500; i++) {
      const d = doc(...Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => block(0)));
      expectSame(`random #${i}: ${JSON.stringify(d).slice(0, 120)}`, d);
    }
  });
});
