/**
 * Retrieval Engine — query path (docs/architecture/retrieval-engine.md §4).
 *
 * retrieve() ranks knowledge chunks for a query via the SECURITY INVOKER
 * RPC `search_knowledge_chunks`. THE CLIENT DECIDES WHAT EXISTS:
 *
 *   > Retrieval always runs with the caller's eyes.
 *
 * Pass the client built from the CALLER's credentials — the anon/publishable
 * key for visitor surfaces, the user's JWT for authenticated ones. NEVER a
 * service-role client: RLS on knowledge_chunks is the confidentiality
 * boundary, and service-role bypasses it.
 *
 * M1 is text-only ranking (query_embedding null). M2 adds the embedding leg
 * via resolveEmbeddingProvider/embedText without changing this interface.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge module; client type varies per caller */

export interface RetrievalQuery {
  query: string;
  k?: number; // max chunks (default 8)
  tokenBudget?: number; // cap on total context tokens (default 4000)
  sources?: string[]; // narrow to specific source tables (filtered in SQL, not post-hoc)
  /**
   * Optional query vector for the hybrid semantic leg — compute it with
   * embedQuery() (embedder.ts). Null/omitted → text-only ranking (Law 4).
   */
  queryEmbedding?: number[] | null;
}

export interface RetrievedChunk {
  citation: number; // 1-based [N] marker
  sourceTable: string;
  entityId: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

const CHARS_PER_TOKEN = 4;

export async function retrieve(
  callerClient: any,
  { query, k = 8, tokenBudget = 4000, sources, queryEmbedding }: RetrievalQuery,
): Promise<RetrievedChunk[]> {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const { data, error } = await callerClient.rpc('search_knowledge_chunks', {
    query_text: trimmed,
    match_count: k,
    ...(sources?.length ? { sources } : {}),
    ...(queryEmbedding?.length ? { query_embedding: queryEmbedding } : {}),
  });
  if (error) throw new Error(`search_knowledge_chunks failed: ${error.message}`);

  const budgetChars = tokenBudget * CHARS_PER_TOKEN;
  let used = 0;
  const out: RetrievedChunk[] = [];
  for (const row of data ?? []) {
    if (used + row.content.length > budgetChars && out.length > 0) break;
    used += row.content.length;
    out.push({
      citation: out.length + 1,
      sourceTable: row.source_table,
      entityId: row.entity_id,
      title: row.title,
      content: row.content,
      metadata: row.metadata ?? {},
      score: row.hybrid_score,
    });
  }
  return out;
}

/** Render chunks as a numbered context block whose [N] markers match `citation`. */
export function renderContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c) => `[${c.citation}] ${c.title}${c.metadata.url ? ` (${c.metadata.url})` : ''}\n${c.content}`)
    .join('\n\n---\n\n');
}
