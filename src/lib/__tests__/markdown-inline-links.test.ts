import { describe, it, expect } from 'vitest';
import { markdownToTiptap, parseInline, inlineClean } from '../../../supabase/functions/_shared/markdown-to-tiptap';

/**
 * FlowPilot's blog posts on www.liteit.se showed `[liteIT.se](https://…)` as raw
 * text — parseInline knew only bold and italic (handoff 2026-10-12, 5 links in
 * 4 of 7 posts). These pin the inline grammar both write paths use.
 */
describe('markdown inline → Tiptap marks', () => {
  it('the handoff case: plain, link, plain + bold — no bracket left', () => {
    const nodes = parseInline('Läs mer på [liteit.se](https://www.liteit.se) och **Clawable**.');
    expect(nodes).toEqual([
      { type: 'text', text: 'Läs mer på ' },
      { type: 'text', text: 'liteit.se', marks: [{ type: 'link', attrs: { href: 'https://www.liteit.se' } }] },
      { type: 'text', text: ' och ' },
      { type: 'text', text: 'Clawable', marks: [{ type: 'bold' }] },
      { type: 'text', text: '.' },
    ]);
    expect(nodes.map((n) => n.text).join('')).not.toMatch(/[[\]]|\]\(/);
  });

  it('own-site paths open in place (no target, no nofollow); fragments and mailto are links too', () => {
    expect(parseInline('[KB](/kb/privat-ai)')[0].marks[0]).toEqual({ type: 'link', attrs: { href: '/kb/privat-ai', target: null, rel: null } });
    expect(parseInline('[offer](https://www.liteit.se/#erbjudandet)')[0].marks[0].attrs.href).toBe('https://www.liteit.se/#erbjudandet');
    expect(parseInline('<https://example.com/a_b>')[0]).toEqual({ type: 'text', text: 'https://example.com/a_b', marks: [{ type: 'link', attrs: { href: 'https://example.com/a_b' } }] });
    expect(parseInline('[mail](mailto:hej@liteit.se)')[0].marks[0].attrs.href).toBe('mailto:hej@liteit.se');
  });

  it('an unsafe href never becomes a link — the reader gets the label, nothing runs', () => {
    for (const href of ['javascript:alert(1)', 'javascript:void0', 'data:text/html,x', 'vbscript:x', '//evil.example']) {
      const nodes = parseInline(`[klick](${href})`);
      expect(nodes.some((n) => n.marks?.some((m: { type: string }) => m.type === 'link')), href).toBe(false);
      expect(nodes[0]).toEqual({ type: 'text', text: 'klick' });
    }
  });

  it('code is literal, images become a link to the image, underscores inside words stay', () => {
    expect(parseInline('kör `skill_read` nu')).toEqual([
      { type: 'text', text: 'kör ' },
      { type: 'text', text: 'skill_read', marks: [{ type: 'code' }] },
      { type: 'text', text: ' nu' },
    ]);
    expect(parseInline('![diagram](https://cdn.example/x.png)')[0]).toEqual({ type: 'text', text: 'diagram', marks: [{ type: 'link', attrs: { href: 'https://cdn.example/x.png' } }] });
    expect(parseInline('snake_case_name och _kursiv_')).toEqual([
      { type: 'text', text: 'snake_case_name och ' },
      { type: 'text', text: 'kursiv', marks: [{ type: 'italic' }] },
    ]);
  });

  it('the space between two marks survives (it used to be dropped)', () => {
    expect(parseInline('**a** *b*').map((n) => n.text)).toEqual(['a', ' ', 'b']);
  });

  it('headings and list items: links reduce to their label in a heading, stay links in a list', () => {
    const doc = markdownToTiptap('## Se [liteIT.se](https://www.liteit.se)\n- punkt med [länk](https://a.se)');
    expect(doc.content[0]).toEqual({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Se liteIT.se' }] });
    const li = doc.content[1].content[0].content[0].content;
    expect(li[1]).toEqual({ type: 'text', text: 'länk', marks: [{ type: 'link', attrs: { href: 'https://a.se' } }] });
    expect(inlineClean('`x` och ![alt](u) och <https://a.se>')).toBe('x och alt och https://a.se');
  });
});

describe('the admin-side markdown import follows the same href rule', () => {
  it('createDocumentFromMarkdown keeps a safe link and refuses javascript:', async () => {
    const { createDocumentFromMarkdown } = await import('../tiptap-utils');
    const ok = JSON.stringify(createDocumentFromMarkdown('Se [liteit](https://www.liteit.se)'));
    expect(ok).toContain('"href":"https://www.liteit.se"');
    const bad = JSON.stringify(createDocumentFromMarkdown('Se [klick](javascript:void0)'));
    expect(bad).not.toContain('javascript:');
    expect(bad).toContain('klick');
  });
});
