/**
 * Content quality — the structural floor under outward-facing writing.
 *
 * Hermes audited autoversio.ai's blog on 2026-10-28: 112 posts, median ~260
 * words, 18 titles opening with the same phrase, 7 exact duplicates, 8 English
 * posts on a Swedish site, the same over-promises the start page had just
 * lost, and a featured image chosen by sending the whole brief to Unsplash as
 * a search query. None of it was the model writing badly on the day; every one
 * was a floor the platform never had. Prose in a prompt ("write 800 words",
 * "do not repeat yourself") describes; only structure constrains — the same
 * lesson the cadence guard drew for "one post a day".
 *
 * Pure functions, no model, no I/O: callable inline in agent-execute's write
 * path, in the audit skill, and in vitest. Mirrors nothing — this is the one
 * copy, imported by both.
 */

import { normalizeTitle } from './domains/content-memory.ts';
import { extractTextFromTiptap } from './chat-context.ts';

// ─── Words ──────────────────────────────────────────────────────────────────

/** Words in a markdown body: headings, list markers, links and images stripped first. */
export function countWords(markdown: string): number {
  return plainTextOfMarkdown(markdown).split(/\s+/).filter(Boolean).length;
}

export function plainTextOfMarkdown(markdown: string): string {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/[*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `##`/`###` headings — the structure a long piece needs to be read, and the sign it has one. */
export function countHeadings(markdown: string): number {
  return (String(markdown || '').match(/^#{2,6}\s+\S/gm) || []).length;
}

// ─── Language ───────────────────────────────────────────────────────────────

/**
 * Function words, by language. Short lists on purpose: a body of 200+ words
 * hits dozens of them in its own language and almost none in another, which is
 * all the detector needs. It answers only when sure (see detectLanguage), so a
 * missing language here means "no verdict", never a wrong one.
 */
const FUNCTION_WORDS: Record<string, string[]> = {
  sv: ['och', 'att', 'det', 'som', 'en', 'ett', 'är', 'för', 'med', 'på', 'av', 'till', 'den', 'inte', 'om', 'så', 'kan', 'har', 'vi', 'de', 'från', 'eller', 'när', 'vilket', 'också', 'där', 'detta', 'sig', 'blir', 'många'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'with', 'are', 'this', 'from', 'your', 'you', 'not', 'can', 'but', 'have', 'which', 'their', 'will', 'they', 'more', 'also', 'has', 'been', 'what', 'when', 'these', 'into'],
  de: ['und', 'der', 'die', 'das', 'ist', 'nicht', 'mit', 'für', 'auf', 'sie', 'ein', 'eine', 'den', 'dem', 'des', 'auch', 'wird', 'sind', 'oder', 'als', 'wie', 'bei', 'aus', 'nach', 'werden', 'einem', 'einer', 'über', 'noch', 'sich'],
  fr: ['le', 'la', 'les', 'et', 'des', 'est', 'une', 'pour', 'dans', 'que', 'qui', 'pas', 'sur', 'avec', 'vous', 'nous', 'sont', 'plus', 'cette', 'votre', 'aux', 'ont', 'mais', 'comme', 'être', 'leur', 'ses', 'par', 'ce', 'du'],
  es: ['el', 'la', 'los', 'las', 'y', 'de', 'que', 'en', 'es', 'para', 'con', 'una', 'por', 'del', 'se', 'no', 'más', 'como', 'su', 'sus', 'pero', 'son', 'este', 'esta', 'también', 'puede', 'sin', 'sobre', 'hay', 'entre'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'niet', 'met', 'voor', 'zijn', 'ook', 'als', 'maar', 'bij', 'naar', 'wordt', 'worden', 'door', 'heeft', 'deze', 'uit', 'dan', 'nog', 'wat', 'over', 'kunnen', 'onze', 'meer', 'hun'],
  da: ['og', 'at', 'det', 'er', 'en', 'til', 'af', 'for', 'med', 'på', 'ikke', 'den', 'som', 'har', 'kan', 'vi', 'de', 'fra', 'eller', 'når', 'også', 'hvor', 'bliver', 'skal', 'være', 'man', 'mere', 'deres', 'sig', 'efter'],
  no: ['og', 'at', 'det', 'er', 'en', 'til', 'av', 'for', 'med', 'på', 'ikke', 'den', 'som', 'har', 'kan', 'vi', 'de', 'fra', 'eller', 'når', 'også', 'hvor', 'blir', 'skal', 'være', 'man', 'mer', 'deres', 'seg', 'etter'],
  fi: ['ja', 'on', 'ei', 'että', 'se', 'joka', 'ovat', 'kun', 'myös', 'mutta', 'tai', 'kuin', 'niin', 'jos', 'vain', 'sekä', 'tämä', 'voi', 'ole', 'olla', 'ovat', 'sen', 'tässä', 'kanssa', 'jotka', 'nyt', 'vielä', 'mitä', 'siitä', 'koska'],
};

export interface LanguageVerdict {
  /** ISO 639-1 of the language the text is written in. */
  language: string;
  /** Function-word hits for that language. */
  hits: number;
  /** hits ÷ hits of the runner-up (Infinity when the runner-up has none). */
  margin: number;
}

/**
 * The language a body is written in, or null when the text is too short or
 * too mixed to say. Decides only with ≥ 12 hits and a 1.6× lead over the next
 * language — Danish and Norwegian share most of their function words, so a
 * Danish text answers 'da' or 'no' by margin and never 'en'. Diacritics are
 * kept: "på" and "för" are evidence, "pa" and "for" are not the same evidence.
 */
export function detectLanguage(text: string): LanguageVerdict | null {
  const words: string[] = (String(text || '').toLowerCase().match(/[\p{L}']+/gu) ?? []) as string[];
  if (words.length < 30) return null;
  const counts: Record<string, number> = {};
  for (const [lang, list] of Object.entries(FUNCTION_WORDS)) {
    const set = new Set(list);
    let n = 0;
    for (const w of words) if (set.has(w)) n++;
    counts[lang] = n;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] < 12) return null;
  const margin = second && second[1] > 0 ? best[1] / second[1] : Infinity;
  if (margin < 1.6) return null;
  return { language: best[0], hits: best[1], margin };
}

// ─── Claims ─────────────────────────────────────────────────────────────────

const fold = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** The phrases from `claims_to_avoid` that appear in the text, case- and diacritic-insensitively. */
export function findForbiddenClaims(text: string, claims: unknown): string[] {
  if (!Array.isArray(claims)) return [];
  const hay = fold(text);
  const out: string[] = [];
  for (const c of claims) {
    const phrase = typeof c === 'string' ? c.trim() : '';
    if (phrase.length < 3) continue;
    if (hay.includes(fold(phrase))) out.push(phrase);
  }
  return out;
}

// ─── The image query ────────────────────────────────────────────────────────

const QUERY_STOP = new Set([
  'och', 'att', 'det', 'den', 'en', 'ett', 'är', 'som', 'på', 'av', 'för', 'med', 'till', 'i', 'vi', 'de', 'du', 'om', 'så', 'men', 'har', 'kan', 'inte', 'eller', 'när', 'vad', 'hur', 'varför', 'där', 'här', 'sig', 'sin', 'sitt', 'din', 'ditt', 'era', 'vår', 'vårt', 'nya', 'ny', 'nytt',
  'the', 'and', 'of', 'to', 'in', 'for', 'on', 'with', 'a', 'an', 'is', 'are', 'be', 'this', 'that', 'it', 'from', 'by', 'as', 'at', 'or', 'how', 'what', 'why', 'when', 'your', 'our', 'their', 'his', 'her', 'you', 'we', 'new', 'guide', 'latest', 'news', 'about',
  // Numbers and years say nothing a photo can show.
]);

/**
 * What to ask a stock-photo search for. Never the brief: on autoversio the
 * whole task prompt ("Draft the original blog post covering…") reached
 * Unsplash as the query, and the answer was a Dutch parking sign. The title's
 * meaning-bearing words, two to four of them, with the company's industry as
 * the anchor that keeps "trust zones" from returning a ferry.
 */
export function imageQueryFor(title: string, industry?: string | null): string {
  const words = normalizeTitle(title).split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w) && !QUERY_STOP.has(w));
  const base = words.slice(0, 3);
  const ind = normalizeTitle(industry || '').split(' ').filter((w) => w.length > 2 && !QUERY_STOP.has(w)).slice(0, 1);
  return [...base, ...ind.filter((w) => !base.includes(w))].slice(0, 4).join(' ');
}

/** An Unsplash alt like "a sign on a pole" describes the photo, not the article; the title does both. */
export function altTextFor(title: string): string {
  return String(title || '').trim();
}

// ─── A stored post body ─────────────────────────────────────────────────────

/**
 * The plain text of a STORED post body, whatever shape it was stored in: a
 * Tiptap doc (what write_blog_post and the editor write) or a block array with
 * docs inside (`[{ id, type: 'text', data: { content: { type: 'doc', … } } }]`,
 * what the templates seed). audit_blog read only the first: every
 * template-seeded post counted 0 words, and its text escaped the forbidden-
 * claim and language checks.
 */
export function postBodyText(contentJson: unknown): string {
  return extractTextFromTiptap(contentJson);
}

/** Images inside a stored post body (Tiptap `image` nodes, at any depth, in either shape; an image block counts once). */
export function countInlineImages(contentJson: unknown): number {
  let n = 0;
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 40) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    if (o.type === 'image') { n++; return; }
    for (const val of Object.values(o)) if (val && typeof val === 'object') walk(val, depth + 1);
  };
  walk(contentJson, 0);
  return n;
}

/**
 * Brand covers — `blog.coverStyle: 'brand'` (Blog settings → Cover images):
 * every post's picture is drawn from the branding, so the write path fetches
 * no stock photo and the audit reports no missing or stock image. The app's
 * twin is src/lib/blog-cover.ts (blogCoverStyle); anything but 'brand' is photo.
 */
export function isBrandCovers(blogSettings: unknown): boolean {
  return !!blogSettings && typeof blogSettings === 'object' && (blogSettings as { coverStyle?: unknown }).coverStyle === 'brand';
}

/**
 * Minutes to read a stored post body — the editor's rule (useBlogPosts
 * calculateReadingTime): words / 200, rounded up, at least 1. write_blog_post
 * stored none and manage_blog_posts update never recomputed it, so a body
 * rewritten to ~900 words kept saying "2 min read".
 */
export function readingMinutes(contentJson: unknown): number {
  const words = postBodyText(contentJson).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * A post's meta_json after a patch: the patch is MERGED into what is there
 * (seoTitle, description, ogImage, keywords, canonicalUrl … the keys the post
 * page, api/html.ts and api/og.ts read), never a replacement that drops the
 * rest; a key patched to null or an empty string is removed.
 */
export function mergePostMeta(current: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) delete out[k];
    else out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

// ─── The floor ──────────────────────────────────────────────────────────────

export type ContentRefusalCode = 'CONTENT_TOO_THIN' | 'LANGUAGE_MISMATCH' | 'DUPLICATE_CONTENT' | 'FORBIDDEN_CLAIM';

export interface ContentRefusal {
  status: 'refused';
  code: ContentRefusalCode;
  retryable: false;
  reason: string;
  hint: string;
  [key: string]: unknown;
}

export interface ExistingPost { title: string; slug?: string | null; status?: string | null }

export interface AssessInput {
  title: string;
  content: string;
  /** The declared source language (ISO), when the site has one. */
  language?: string | null;
  minWords: number;
  existing: ExistingPost[];
  duplicateThreshold?: number;
  claimsToAvoid?: unknown;
  /** The similarity function — injected so this module stays I/O- and import-light. */
  similarity: (a: string, b: string) => number;
}

/**
 * The first floor the piece fails, as a refusal (not an error: nothing broke,
 * the harness must not retry it, and the hint says what to change). Null when
 * it clears every floor.
 */
export function assessPost(input: AssessInput): ContentRefusal | null {
  const words = countWords(input.content);
  const headings = countHeadings(input.content);
  if (words < input.minWords) {
    return {
      status: 'refused', code: 'CONTENT_TOO_THIN', retryable: false,
      reason: `${words} words; the floor is ${input.minWords}.`,
      hint: `A post is one thesis argued to the end, not an introduction: write ${Math.max(input.minWords, 800)}–1200 words with ## sections (you have ${headings}), the proof from the identity, wiki or KB, and a closing ask. Then call again with the full body.`,
      words, headings, min_words: input.minWords,
    };
  }
  const declared = (input.language || '').toLowerCase().trim();
  if (declared) {
    const verdict = detectLanguage(input.content);
    if (verdict && verdict.language !== declared) {
      return {
        status: 'refused', code: 'LANGUAGE_MISMATCH', retryable: false,
        reason: `The body reads as "${verdict.language}" but the post is declared "${declared}".`,
        hint: `Write the body in ${declared} (the site's language for this post), or pass language: "${verdict.language}" if that language is one the site has enabled. The declared language decides the address and the translations; a mismatch publishes under the wrong flag.`,
        detected: verdict.language, declared,
      };
    }
  }
  const threshold = input.duplicateThreshold ?? 0.67;
  const dups = (input.existing || [])
    .filter((p) => p?.title)
    .map((p) => ({ post: p, similarity: input.similarity(input.title, p.title) }))
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
  if (dups.length) {
    const top = dups[0];
    return {
      status: 'refused', code: 'DUPLICATE_CONTENT', retryable: false,
      reason: `"${input.title}" says what "${top.post.title}" already says (${Math.round(top.similarity * 100)} % overlap).`,
      hint: `Do not re-word an earlier post: either extend that one (manage_blog_posts update, slug "${top.post.slug ?? ''}") or take a different thesis — the identity's content angles list the ones not yet written. A new title with the same nouns is the same post.`,
      duplicates: dups.slice(0, 5).map((m) => ({ title: m.post.title, slug: m.post.slug ?? null, status: m.post.status ?? null, similarity: Number(m.similarity.toFixed(2)) })),
    };
  }
  const claims = findForbiddenClaims(`${input.title}\n${input.content}`, input.claimsToAvoid);
  if (claims.length) {
    return {
      status: 'refused', code: 'FORBIDDEN_CLAIM', retryable: false,
      reason: `The text carries a claim the company has ruled out: ${claims.map((c) => `"${c}"`).join(', ')}.`,
      hint: 'Rewrite those sentences to describe what the service does and what was measured (proof points), without the ruled-out phrasing. The list is the company\'s own (Business Identity → claims to avoid); it is not a style preference.',
      claims,
    };
  }
  return null;
}
