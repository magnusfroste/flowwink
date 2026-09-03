import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * The Knowledge Index — a platform service, not a module.
 *
 * One index feeds every grounded surface: the public visitor chat (public
 * chunks only), FlowWork and FlowPilot (public + internal), and any external
 * agent on the MCP gateway. Sources are the content tables that carry a
 * reindex trigger; the sweeper drains a queue into embedded chunks every five
 * minutes.
 *
 * It has no on/off switch on purpose — like the Skill Relevance Engine, it is
 * infrastructure the surfaces depend on. What it DOES need is visibility: an
 * empty index is invisible from every surface except the answers, which simply
 * get vaguer (see the 2026-08-12 incident, where a chat with an empty index
 * invented pages). This hook is that window.
 */

/** Content tables the indexer reads, in the order the admin card shows them. */
export const KNOWLEDGE_SOURCES = [
  'pages',
  'kb_articles',
  'wiki_pages',
  'docs_pages',
  'handbook_chapters',
  'documents',
] as const;

export type KnowledgeSource = (typeof KNOWLEDGE_SOURCES)[number];

export interface KnowledgeIndexHealth {
  /** Indexed chunks per source table (only sources with chunks appear). */
  bySource: Record<string, number>;
  totalChunks: number;
  /** Chunks still missing an embedding — they cannot be retrieved yet. */
  missingEmbedding: number;
  /** Of those, chunks the embedder gave up on (5 failed attempts) — see lastEmbeddingError. */
  gaveUp: number;
  /** What the provider last said when an embedding failed, verbatim. */
  lastEmbeddingError: string | null;
  lastEmbeddingErrorAt: string | null;
  /** True when the numbers came from a bounded client read (older instance without the stats RPC). */
  bounded: boolean;
  /** Items waiting for the next sweep. A steady non-zero value means the sweeper is not running. */
  queueDepth: number;
  lastIndexedAt: string | null;
  /**
   * Uploaded files that are not text yet, by extraction state.
   *
   * A document waiting for extraction has zero chunks, so every chunk-based
   * number above reports it as simply absent — which is how a PDF sat pending
   * on optic for two days without a single surface saying so. The point of
   * doing things under the hood is not doing them in the dark.
   */
  documentsAwaitingText: { pending: number; processing: number; unsupported: number; failed: number };
}

export function useKnowledgeIndexHealth() {
  return useQuery({
    queryKey: ['knowledge-index-health'],
    queryFn: async (): Promise<KnowledgeIndexHealth> => {
      const docsRead = supabase.from('documents').select('extraction_status').not('file_url', 'is', null);
      // Counts belong in the database. The old client read of every chunk was
      // capped at 1000 rows by PostgREST without a word — "1000 chunk(s)" on
      // labs1100 was the cap, not the index — and it pulled every vector over
      // the wire to test it for null. The RPC counts everything, whole.
      const { data: stats, error: statsErr } = await supabase.rpc('knowledge_index_stats' as never);
      if (!statsErr && stats && typeof stats === 'object') {
        const s = stats as Record<string, unknown>;
        const docs = await docsRead;
        return {
          bySource: (s.by_source ?? {}) as Record<string, number>,
          totalChunks: Number(s.total ?? 0),
          missingEmbedding: Number(s.missing_embedding ?? 0),
          gaveUp: Number(s.gave_up ?? 0),
          lastEmbeddingError: typeof s.last_embedding_error === 'string' ? s.last_embedding_error : null,
          lastEmbeddingErrorAt: typeof s.last_embedding_error_at === 'string' ? s.last_embedding_error_at : null,
          bounded: false,
          queueDepth: Number(s.queue_depth ?? 0),
          lastIndexedAt: typeof s.last_indexed_at === 'string' ? s.last_indexed_at : null,
          documentsAwaitingText: awaitingText(docs.data ?? []),
        };
      }
      if (statsErr) logger.warn('knowledge_index_stats unavailable, falling back to a bounded client read:', statsErr.message);
      const [chunks, queue, docs] = await Promise.all([
        supabase.from('knowledge_chunks').select('source_table, embedding, updated_at').limit(1000),
        supabase.from('knowledge_index_queue').select('source_table'),
        docsRead,
      ]);
      if (chunks.error) throw chunks.error;

      const rows = chunks.data ?? [];
      const bySource: Record<string, number> = {};
      let missingEmbedding = 0;
      let lastIndexedAt: string | null = null;
      for (const row of rows as Array<{ source_table: string; embedding: unknown; updated_at: string | null }>) {
        bySource[row.source_table] = (bySource[row.source_table] ?? 0) + 1;
        if (!row.embedding) missingEmbedding++;
        if (row.updated_at && (!lastIndexedAt || row.updated_at > lastIndexedAt)) lastIndexedAt = row.updated_at;
      }

      return {
        bySource,
        totalChunks: rows.length,
        missingEmbedding,
        gaveUp: 0,
        lastEmbeddingError: null,
        lastEmbeddingErrorAt: null,
        bounded: true,
        // A missing queue table (un-migrated instance) reads as 0, not as an error:
        // the card must still render the chunk counts it CAN see.
        queueDepth: queue.error ? 0 : (queue.data?.length ?? 0),
        lastIndexedAt,
        documentsAwaitingText: awaitingText(docs.data ?? []),
      };
    },
    staleTime: 30_000,
  });
}

function awaitingText(rows: Array<{ extraction_status: string | null }>) {
  return rows.reduce(
    (acc, d) => {
      if (d.extraction_status && d.extraction_status in acc) {
        acc[d.extraction_status as keyof typeof acc] += 1;
      }
      return acc;
    },
    { pending: 0, processing: 0, unsupported: 0, failed: 0 },
  );
}

/**
 * Run a sweep now — drains the queue and (with `fullReindex`) re-queues a
 * source first. Also the manual escape hatch when an instance's sweeper cron
 * has not been registered yet: the function registers it on any run.
 */
export function useRunKnowledgeIndexer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { fullReindex?: boolean; source?: KnowledgeSource }) => {
      const { data, error } = await supabase.functions.invoke('knowledge-indexer', {
        body: {
          source: opts?.source ?? 'admin-ui',
          ...(opts?.fullReindex ? { full_reindex: true, ...(opts.source ? { source: opts.source } : {}) } : {}),
        },
      });
      if (error) throw error;
      return data as {
        status?: string;
        processed?: number;
        indexed_chunks?: number;
        deindexed?: number;
        failed?: number;
        queued?: number;
        embed?: { embedded?: number; failed?: number; pending?: number; provider?: string };
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-index-health'] });
    },
    onError: (e) => logger.error('knowledge indexer run failed:', e),
  });
}
