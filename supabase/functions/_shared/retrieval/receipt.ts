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
  /**
   * How the knowledge got into the prompt.
   *
   * `skill` is a LIVE QUERY: the answer came from a skill that read the
   * database in the moment (a project brief, an order lookup), not from the
   * index. Structured tables are deliberately not indexed — they change hourly,
   * their value is relational, and their visibility is per user, not per
   * publication state. Without this mode such an answer reported `none`, and
   * the knowledge-gap report counted a correct, fresh answer as a gap.
   */
  mode: 'retrieval' | 'fulltext' | 'none' | 'skill';
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
  const groundedWithoutChunks = mode === 'fulltext' || mode === 'skill';
  return { grounded: groundedWithoutChunks ? true : (chunks.length > 0 && mode !== 'none'), mode, chunk_count: chunks.length, sources };
}

/**
 * The answer rests on skills that queried the database in the moment.
 *
 * Called when the model has run tools: the names ARE the provenance, the same
 * way a chunk's title is. Nothing is guessed from the answer's prose — the
 * pipeline declares what it did, which is the same contract the mail rail uses
 * when it says an answer needs a person.
 */
export function withSkills(receipt: GroundingReceipt, skillNames: string[]): GroundingReceipt {
  const names = [...new Set(skillNames.filter((n) => typeof n === 'string' && n.trim()))];
  if (names.length === 0) return receipt;
  const skillSources: GroundingSource[] = names.slice(0, 8).map((name) => ({
    table: 'agent_skills', id: name, title: name,
  }));
  // Retrieval that already grounded the answer keeps its mode — the chunks are
  // still what it was built on; the skills are added provenance. Only an answer
  // with nothing else behind it becomes a skill answer.
  if (receipt.mode === 'none') {
    return { grounded: true, mode: 'skill', chunk_count: 0, sources: skillSources };
  }
  return { ...receipt, sources: [...receipt.sources, ...skillSources].slice(0, 8) };
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
