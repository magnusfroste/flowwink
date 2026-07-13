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

/**
 * Markdown-aware chunking: split on #/##/### headings, keep the heading trail
 * in the chunk title, then size-pack each section.
 */
export function chunkMarkdown(entityTitle: string, markdown: string): Chunk[] {
  const lines = markdown.split('\n');
  const sections: Array<{ trail: string[]; body: string[] }> = [];
  let trail: string[] = [];
  let body: string[] = [];

  const flush = () => {
    if (body.join('\n').trim()) sections.push({ trail: [...trail], body });
    body = [];
  };

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.*)/);
    if (m) {
      flush();
      const depth = m[1].length - 1;
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
