/**
 * The grounding receipt — what an answer was built on, kept with the answer.
 *
 * Chat and the email responder retrieve chunks (KB, pages, wiki, documents),
 * render them into the prompt, and answer. Until 2026-09-10 the chunks were
 * then forgotten: nobody could tell afterwards whether "Kan man bo på
 * gården?" was answered from the hotel article or from the model's own head.
 * The receipt is that memory. It is built once per answer from the chunks
 * that were actually retrieved, travels as the FIRST frame of the SSE stream
 * (`data: {"flowwink_grounding": …}`) so every consumer — the widget, the
 * email responder client, an external agent reading the stream — can keep it
 * with the message, and lands in chat_messages.metadata.grounding and
 * outbound_communications.metadata.grounding.
 *
 * A receipt is metadata only: table, entity id, title, slug — never the
 * chunk text. Pure function, no I/O, so it can be unit-tested from vitest.
 */

export interface ReceiptChunk {
  sourceTable: string;
  entityId: string;
  title: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface GroundingSource {
  table: string;
  id: string;
  title: string;
  slug?: string;
  url?: string;
}

export interface GroundingReceipt {
  /** True when at least one retrieved chunk was in the prompt. */
  grounded: boolean;
  /** How the knowledge got into the prompt. */
  mode: 'retrieval' | 'fulltext' | 'none';
  chunk_count: number;
  /** One entry per distinct entity, best score first, at most 8. */
  sources: GroundingSource[];
}

const URL_BY_TABLE: Record<string, (slug: string) => string> = {
  kb_articles: (s) => `/kb/${s}`,
  pages: (s) => `/${s}`,
  blog_posts: (s) => `/blog/${s}`,
  wiki_pages: (s) => `/admin/wiki/${s}`,
  documents: (s) => `/admin/documents/${s}`,
};

export function groundingUrl(table: string, slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  const f = URL_BY_TABLE[table];
  return f ? f(slug) : undefined;
}

export function groundingReceipt(
  chunks: ReceiptChunk[],
  mode: GroundingReceipt['mode'],
): GroundingReceipt {
  const byEntity = new Map<string, { source: GroundingSource; score: number }>();
  for (const c of chunks) {
    const key = `${c.sourceTable}:${c.entityId}`;
    const score = typeof c.score === 'number' ? c.score : 0;
    const existing = byEntity.get(key);
    if (existing) { existing.score = Math.max(existing.score, score); continue; }
    const slug = typeof c.metadata?.slug === 'string' ? (c.metadata.slug as string) : undefined;
    byEntity.set(key, {
      score,
      source: { table: c.sourceTable, id: c.entityId, title: c.title, ...(slug ? { slug } : {}), ...(groundingUrl(c.sourceTable, slug) ? { url: groundingUrl(c.sourceTable, slug) } : {}) },
    });
  }
  const sources = [...byEntity.values()].sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.source);
  return { grounded: mode === 'fulltext' ? true : (chunks.length > 0 && mode !== 'none'), mode, chunk_count: chunks.length, sources };
}

/** The SSE frame the stream begins with. Existing clients ignore it (no delta). */
export function groundingFrame(receipt: GroundingReceipt): string {
  return `data: ${JSON.stringify({ flowwink_grounding: receipt })}\n\n`;
}

/** Read a receipt back out of a parsed SSE frame, if the frame is one. */
export function readGroundingFrame(obj: unknown): GroundingReceipt | null {
  if (!obj || typeof obj !== 'object') return null;
  const g = (obj as { flowwink_grounding?: unknown }).flowwink_grounding;
  if (!g || typeof g !== 'object') return null;
  const r = g as Partial<GroundingReceipt>;
  if (typeof r.grounded !== 'boolean' || !Array.isArray(r.sources)) return null;
  return { grounded: r.grounded, mode: (r.mode as GroundingReceipt['mode']) ?? 'none', chunk_count: Number(r.chunk_count ?? 0), sources: r.sources as GroundingSource[] };
}

/** Prepend one SSE frame to a byte stream — the receipt goes out before the first token. */
export function withLeadingFrame(frame: string, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(frame));
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
      }
    },
  });
}
