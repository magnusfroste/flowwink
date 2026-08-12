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
  /** Items waiting for the next sweep. A steady non-zero value means the sweeper is not running. */
  queueDepth: number;
  lastIndexedAt: string | null;
}

export function useKnowledgeIndexHealth() {
  return useQuery({
    queryKey: ['knowledge-index-health'],
    queryFn: async (): Promise<KnowledgeIndexHealth> => {
      const [chunks, queue] = await Promise.all([
        supabase.from('knowledge_chunks').select('source_table, embedding, updated_at'),
        supabase.from('knowledge_index_queue').select('source_table'),
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
        // A missing queue table (un-migrated instance) reads as 0, not as an error:
        // the card must still render the chunk counts it CAN see.
        queueDepth: queue.error ? 0 : (queue.data?.length ?? 0),
        lastIndexedAt,
      };
    },
    staleTime: 30_000,
  });
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
