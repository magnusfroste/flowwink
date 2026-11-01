/**
 * A newsletter's body, written once in markdown, made safe for every inbox.
 *
 * The agent writes markdown (what it writes well — and what it has just read
 * in the wiki); a person edits the result in the newsletter editor. What
 * leaves is email HTML: every element styled INLINE (Gmail and Outlook drop
 * <style> blocks unevenly), a call-to-action as a table button (an <a> with
 * padding collapses in Outlook), and a plain-text part beside it — spam
 * filters and screen readers read that one. The branded frame around it is
 * email-shell's, the same as every other mail the platform sends.
 *
 * A line that is ONLY a link prefixed with "→ " becomes a button:
 *   → [See the new grinder](https://example.com/macina)
 *
 * Pure — no Deno, no Supabase — so vitest exercises it directly.
 */

import { markdownToTiptap } from '../markdown-to-tiptap.ts';
import { detectLanguage, findForbiddenClaims } from '../content-quality.ts';

type Node = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: Node[] };

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const P = 'margin:0 0 16px;font-size:16px;line-height:24px;';
const H: Record<number, string> = {
  1: 'margin:0 0 16px;font-size:26px;line-height:32px;font-weight:700;',
  2: 'margin:24px 0 12px;font-size:21px;line-height:28px;font-weight:700;',
  3: 'margin:20px 0 8px;font-size:18px;line-height:24px;font-weight:700;',
};
const LIST = 'margin:0 0 16px;padding-left:24px;font-size:16px;line-height:24px;';
const LI = 'margin:0 0 6px;';

function inline(nodes: Node[] | undefined, linkColor: string): string {
  return (nodes ?? []).map((n) => {
    if (n.type !== 'text') return '';
    let out = esc(n.text ?? '');
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') out = `<strong>${out}</strong>`;
      else if (m.type === 'italic') out = `<em>${out}</em>`;
      else if (m.type === 'code') out = `<code style="font-family:monospace;font-size:14px;">${out}</code>`;
      else if (m.type === 'link') out = `<a href="${esc(String(m.attrs?.href ?? ''))}" style="color:${linkColor};text-decoration:underline;">${out}</a>`;
    }
    return out;
  }).join('');
}

/** "→ [Label](url)" alone on its line — the one call-to-action shape. */
function buttonOf(para: Node): { label: string; href: string } | null {
  const parts = (para.content ?? []).filter((n) => !(n.type === 'text' && !n.marks?.length && /^\s*→?\s*$/.test(n.text ?? '')));
  const first = (para.content ?? [])[0];
  const startsWithArrow = first?.type === 'text' && !first.marks?.length && /^\s*→\s*$/.test(first.text ?? '');
  if (!startsWithArrow || parts.length !== 1) return null;
  const link = parts[0].marks?.find((m) => m.type === 'link');
  return link ? { label: parts[0].text ?? '', href: String(link.attrs?.href ?? '') } : null;
}

function button(label: string, href: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>`
    + `<td style="border-radius:6px;background:${color};">`
    + `<a href="${esc(href)}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(label)}</a>`
    + `</td></tr></table>`;
}

function block(n: Node, color: string): string {
  switch (n.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)));
      return `<h${level} style="${H[level]}">${inline(n.content, color)}</h${level}>`;
    }
    case 'paragraph': {
      if (!n.content?.length) return '';
      const b = buttonOf(n);
      return b ? button(b.label, b.href, color) : `<p style="${P}">${inline(n.content, color)}</p>`;
    }
    case 'bulletList':
    case 'orderedList': {
      const tag = n.type === 'bulletList' ? 'ul' : 'ol';
      const items = (n.content ?? []).map((li) => `<li style="${LI}">${(li.content ?? []).map((c) => inline(c.content, color)).join(' ')}</li>`).join('');
      return `<${tag} style="${LIST}">${items}</${tag}>`;
    }
    case 'image': {
      const src = String(n.attrs?.src ?? '');
      return src ? `<p style="${P}"><img src="${esc(src)}" alt="${esc(String(n.attrs?.alt ?? ''))}" style="display:block;max-width:100%;height:auto;border:0;border-radius:6px;" /></p>` : '';
    }
    case 'horizontalRule':
      return '<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;" />';
    case 'blockquote':
      return `<blockquote style="margin:0 0 16px;padding:8px 16px;border-left:3px solid ${color};">${(n.content ?? []).map((c) => block(c, color)).join('')}</blockquote>`;
    default:
      return '';
  }
}

/** Markdown → the email-safe HTML fragment email-shell frames. */
export function newsletterHtmlFromMarkdown(markdown: string, brandColor = '#1f6feb'): string {
  const doc = markdownToTiptap(markdown ?? '') as Node;
  return (doc.content ?? []).map((n) => block(n, brandColor)).filter(Boolean).join('\n');
}

/**
 * The plain-text part of a mail, from its HTML: paragraphs and list items on
 * their own lines, links as "label (url)", buttons as "label: url".
 */
export function plainTextFromHtml(html: string): string {
  return String(html ?? '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = String(label).replace(/<[^>]+>/g, '').trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|h[1-6]|li|blockquote|tr|table|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n———\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface NewsletterRefusal {
  status: 'refused';
  code: 'CONTENT_REQUIRED' | 'LANGUAGE_MISMATCH' | 'FORBIDDEN_CLAIM';
  retryable: false;
  hint: string;
  reason: string;
}

const refuse = (code: NewsletterRefusal['code'], reason: string, hint: string): NewsletterRefusal =>
  ({ status: 'refused', code, retryable: false, reason, hint });

/**
 * The same floor write_blog_post holds content to, for a newsletter (and a
 * one-to-one lead mail — `what` names it, `contentHint` says what to write):
 * the site's language, none of the identity's claims_to_avoid. A refusal, not an
 * error — self-repair leaves it alone and the operator fixes the text.
 */
export function assessNewsletter(input: { subject: string; text: string; language: string | null; claimsToAvoid?: unknown; what?: string; contentHint?: string }): NewsletterRefusal | null {
  const what = input.what ?? 'newsletter';
  if (!input.text.trim()) {
    return refuse('CONTENT_REQUIRED', 'no content', input.contentHint
      ?? 'Write the newsletter yourself as content_md (markdown): read the sources first (the wiki, recent posts, products), then send the whole body. A line "→ [Label](url)" becomes a button.');
  }
  if (input.language) {
    const v = detectLanguage(input.text);
    if (v && v.language !== input.language) {
      return refuse('LANGUAGE_MISMATCH', `written in ${v.language}, the site speaks ${input.language}`,
        `Write the ${what} in the site's language (${input.language}) and call again.`);
    }
  }
  const hits = findForbiddenClaims(`${input.subject}\n${input.text}`, input.claimsToAvoid);
  if (hits.length) {
    return refuse('FORBIDDEN_CLAIM', `contains ruled-out claims: ${hits.join(', ')}`,
      `Business Identity rules these claims out: ${hits.map((h) => `"${h}"`).join(', ')}. Rewrite without them and call again.`);
  }
  return null;
}
