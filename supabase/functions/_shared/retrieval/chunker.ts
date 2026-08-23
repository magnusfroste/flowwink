/**
 * Retrieval Engine — chunker (docs/architecture/retrieval-engine.md §3).
 *
 * Splits knowledge-shaped text into ~CHUNK_TOKEN_TARGET-token chunks for the
 * knowledge_chunks index. Markdown sources split on headings first so a chunk
 * never straddles two sections and the heading trail travels with the chunk
 * title ("Refund policy › Partial refunds") for citations. Plain text falls
 * back to paragraph packing with overlap.
 */

const CHUNK_TOKEN_TARGET = 600;
const CHUNK_TOKEN_OVERLAP = 80;
const CHARS_PER_TOKEN = 4; // same heuristic as chat-context.ts token budget

const TARGET_CHARS = CHUNK_TOKEN_TARGET * CHARS_PER_TOKEN;
const OVERLAP_CHARS = CHUNK_TOKEN_OVERLAP * CHARS_PER_TOKEN;

export interface Chunk {
  title: string; // entity title + heading trail
  content: string;
}

/** Pack paragraphs into chunks of ~TARGET_CHARS with trailing overlap. */
function packParagraphs(title: string, text: string): Chunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: Chunk[] = [];
  let current = '';

  for (const p of paragraphs) {
    // A single paragraph larger than the target gets hard-split.
    if (p.length > TARGET_CHARS) {
      if (current) {
        chunks.push({ title, content: current.trim() });
        current = '';
      }
      for (let i = 0; i < p.length; i += TARGET_CHARS - OVERLAP_CHARS) {
        chunks.push({ title, content: p.slice(i, i + TARGET_CHARS).trim() });
      }
      continue;
    }
    if (current.length + p.length + 2 > TARGET_CHARS) {
      chunks.push({ title, content: current.trim() });
      // carry overlap: keep the tail of the previous chunk as context
      current = current.slice(-OVERLAP_CHARS) + '\n\n' + p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current.trim()) chunks.push({ title, content: current.trim() });
  return chunks;
}

const HEADING_RE = /^(#{1,3})\s+(.*)/;

/**
 * Markdown-aware chunking: split on #/##/### headings, keep the heading trail
 * in the chunk title, then size-pack each section.
 *
 * The trail depth comes from the levels a document ACTUALLY uses, not from the
 * absolute `#` count. Body markdown very often opens at `##` — the H1 lives in
 * the entity title, not in the text — and reading the level as the depth
 * (`depth = level - 1`) gave every `##` depth 1, so `trail.slice(0, 1)` kept the
 * PREVIOUS sibling and filed each section under the one before it: three sibling
 * `##`s indexed as "Servicenivå", "Servicenivå › Vad tjänsten gör",
 * "Servicenivå › Pris". `knowledge_chunks.title` is the citation label an agent
 * reads back to a customer, so that asserted a hierarchy the document does not
 * have. H1-led documents were unaffected (H1 → depth 0 resets the trail), which
 * is why it went unseen.
 *
 * Depth is now the size of the open-heading stack: a heading closes every
 * heading at its own level or deeper, then sits on what remains. The shallowest
 * level present is therefore depth 0 whatever it is, siblings stay siblings, and
 * a well-formed H1-led document comes out exactly as before.
 */
export function chunkMarkdown(entityTitle: string, markdown: string): Chunk[] {
  const lines = markdown.split('\n');
  const sections: Array<{ trail: string[]; body: string[] }> = [];
  const openLevels: number[] = []; // heading levels currently on the trail
  let trail: string[] = [];
  let body: string[] = [];

  const flush = () => {
    if (body.join('\n').trim()) sections.push({ trail: [...trail], body });
    body = [];
  };

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      flush();
      const level = m[1].length;
      while (openLevels.length > 0 && openLevels[openLevels.length - 1] >= level) {
        openLevels.pop();
      }
      const depth = openLevels.length;
      openLevels.push(level);
      trail = [...trail.slice(0, depth), m[2].trim()];
    } else {
      body.push(line);
    }
  }
  flush();

  if (sections.length === 0) return packParagraphs(entityTitle, markdown);

  return sections.flatMap(({ trail: t, body: b }) => {
    const title = [entityTitle, ...t].filter(Boolean).join(' › ');
    return packParagraphs(title, b.join('\n'));
  });
}

/** Plain-text chunking (extracted page blocks, KB answers). */
export function chunkText(entityTitle: string, text: string): Chunk[] {
  return packParagraphs(entityTitle, text);
}

/** Stable content hash to skip unchanged chunks (and later, re-embeds). */
export async function contentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
