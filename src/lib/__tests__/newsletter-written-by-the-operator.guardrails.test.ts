/**
 * The newsletter is written by the operator, from what it read, and leaves
 * inbox-safe (2026-10-31). manage_newsletters used to hand a bare topic to
 * its own Gemini / gpt-4o-mini call — a hardcoded model, English by default,
 * no business identity, none of what the operator had just read in the wiki.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newsletterHtmlFromMarkdown, plainTextFromHtml, assessNewsletter } from '../../../supabase/functions/_shared/email/newsletter-content.ts';

const read = (p: string) => readFileSync(p, 'utf8');
const exec = read('supabase/functions/agent-execute/index.ts');
const branch = exec.slice(exec.indexOf("if (skillName === 'manage_newsletters') {"), exec.indexOf("// lead_nurture_sequence"));

describe('markdown becomes email-safe HTML and a text part', () => {
  const html = newsletterHtmlFromMarkdown('## Nytt i oktober\n\nVi har **ny** kvarn.\n\n- Snabbare\n\n→ [Se Macina 64](https://nordbrygg.se/macina)', '#003399');
  it('styles every element inline', () => {
    expect(html).toMatch(/<h2 style="[^"]+">Nytt i oktober<\/h2>/);
    expect(html).toMatch(/<p style="[^"]+">Vi har <strong>ny<\/strong> kvarn\.<\/p>/);
    expect(html).not.toMatch(/class=/);
  });
  it('a "→ [Label](url)" line is a table button in the brand colour', () => {
    expect(html).toMatch(/<table role="presentation"[\s\S]*background:#003399[\s\S]*href="https:\/\/nordbrygg\.se\/macina"[\s\S]*Se Macina 64/);
  });
  it('the text part keeps lines, bullets and link targets', () => {
    const text = plainTextFromHtml(html);
    expect(text).toContain('Nytt i oktober');
    expect(text).toContain('• Snabbare');
    expect(text).toContain('Se Macina 64 (https://nordbrygg.se/macina)');
  });
});

describe('the blog floor holds for newsletters', () => {
  const sv = 'Vi har en ny kvarn och den är snabbare än den gamla och den är också tystare när den maler och vi tror att den passar alla som har ett kafé och vill ha jämn kvalitet på varje kopp som serveras under dagen och kvällen och helgen.';
  it('no body is refused with the way to write one', () => {
    expect(assessNewsletter({ subject: 'x', text: '', language: 'sv' })?.code).toBe('CONTENT_REQUIRED');
  });
  it('another language than the site’s is refused', () => {
    const en = 'We have a new grinder and it is faster than the old one and it is also quieter when it grinds and we think that it suits everyone who has a cafe and wants the same quality in every cup that is served during the day and the evening and the weekend.';
    expect(assessNewsletter({ subject: 'x', text: en, language: 'sv' })?.code).toBe('LANGUAGE_MISMATCH');
    expect(assessNewsletter({ subject: 'x', text: sv, language: 'sv' })).toBeNull();
  });
  it('a ruled-out claim is refused', () => {
    expect(assessNewsletter({ subject: 'Marknadens bästa kvarn', text: sv, language: 'sv', claimsToAvoid: ['marknadens bästa'] })?.code).toBe('FORBIDDEN_CLAIM');
  });
});

describe('manage_newsletters: no hidden model, the operator’s text', () => {
  it('calls no AI provider of its own', () => {
    expect(branch).not.toMatch(/GEMINI_API_KEY|OPENAI_API_KEY|generativelanguage|api\.openai\.com/);
  });
  it('create and update go through newsletterBody (markdown → HTML, assessed)', () => {
    expect(branch.match(/await newsletterBody\(supabase, args/g)?.length).toBe(2);
    expect(branch).toMatch(/review_url: '\/admin\/newsletter'/);
  });
  it('the skill offers content_md and no topic generation', () => {
    const mod = read('src/lib/modules/newsletter-module.ts');
    const skill = mod.slice(mod.indexOf("name: 'manage_newsletters'"), mod.indexOf("name: 'lead_nurture_sequence'"));
    expect(skill).toMatch(/content_md: \{/);
    expect(skill).not.toMatch(/topic: \{|blog_content: \{/);
  });
  it('the send carries a plain-text part with the unsubscribe link', () => {
    expect(read('supabase/functions/newsletter/send.ts')).toMatch(/text: `\$\{plainTextFromHtml\(contentHtml\)\}\\n\\n—\\nUnsubscribe: \$\{personalUnsubscribe\}`/);
  });
});

describe('the draft is an artifact in FlowChat', () => {
  it('a manage_newsletters result opens NewsletterPanel; sending stays on the Newsletter page', () => {
    const page = read('src/pages/admin/FlowChatPage.tsx');
    expect(page).toMatch(/sr\.skill === 'manage_newsletters'/);
    const panel = read('src/components/admin/chat/NewsletterPanel.tsx');
    expect(panel).toMatch(/<NewsletterEditor\b/);
    expect(panel).toMatch(/<Link to="\/admin\/newsletter">/);
    expect(panel).not.toMatch(/execute_newsletter_send|newsletter\/send/);
  });
});
