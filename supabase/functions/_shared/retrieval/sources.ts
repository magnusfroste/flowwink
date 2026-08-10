/**
 * Retrieval Engine — the RetrievalSource contract
 * (docs/architecture/retrieval-engine.md §1).
 *
 * Conversations draw on two lanes through ONE contract:
 *   - 'chunks': knowledge-shaped prose from the knowledge_chunks index,
 *     retrieved hybrid-ranked WITH THE CALLER'S CLIENT (RLS decides what
 *     exists — anon sees public, staff also sees internal).
 *   - 'live':   structured data queried fresh at answer time (Flowtable
 *     today; orders/invoices later). Never chunk-indexed.
 *
 * A consumer (Flowwork/workspace-chat, chat-completion, …) runs the sources
 * it wants and adapts SourceItems into its own citation scheme.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge module over dynamic Supabase rows */
import { retrieve } from './index.ts';

export interface SourceItem {
  type: string; // citation type ('kb_article' | 'page' | 'wiki' | 'document' | 'flowtable' | …)
  id: string;
  title: string;
  url?: string;
  text: string; // the content the model grounds on (WITHOUT citation marker — the consumer numbers it)
}

export interface SourceBlock {
  source: string; // consumer-facing source key
  header: string; // '### …' heading for the context block
  items: SourceItem[];
}

export interface SourceCtx {
  query: string;
  /** The CALLER's client — chunk retrieval must run with these eyes. */
  userClient: any;
  /** Service client — allowed for provider config and live-lane queries only. */
  service: any;
  queryEmbedding?: number[] | null;
}

export interface RetrievalSource {
  key: string;
  kind: 'chunks' | 'live';
  run(ctx: SourceCtx): Promise<SourceBlock | null>;
}

const CHUNK_CITATION_TYPE: Record<string, string> = {
  kb_articles: 'kb_article',
  pages: 'page',
  wiki_pages: 'wiki',
  docs_pages: 'doc',
  documents: 'document',
  handbook_chapters: 'handbook',
};

/**
 * The chunk lane as one source: query-relevant knowledge across the given
 * source tables, ranked by the shared hybrid RPC, seen through the caller's
 * RLS. Replaces the old "25 most-recent rows" per knowledge source.
 */
export function knowledgeChunksSource(
  sourceTables: string[],
  { k = 10, tokenBudget = 5000 }: { k?: number; tokenBudget?: number } = {},
): RetrievalSource {
  return {
    key: 'knowledge',
    kind: 'chunks',
    async run({ query, userClient, queryEmbedding }: SourceCtx): Promise<SourceBlock | null> {
      if (!sourceTables.length) return null;
      const chunks = await retrieve(userClient, {
        query,
        k,
        tokenBudget,
        sources: sourceTables,
        queryEmbedding,
      });
      if (!chunks.length) return null;
      return {
        source: 'knowledge',
        header: '### Knowledge (retrieved by relevance)',
        items: chunks.map((c) => ({
          type: CHUNK_CITATION_TYPE[c.sourceTable] ?? c.sourceTable,
          id: c.entityId,
          title: c.title,
          url: typeof c.metadata.url === 'string' ? c.metadata.url : undefined,
          text: c.content,
        })),
      };
    },
  };
}

/**
 * Flowtable as a LIVE source (moved verbatim from workspace-chat, PR #117).
 * The company's long-tail structured knowledge (imported sheets: error codes,
 * price lists, supplier registers). Tables can be huge (6k+ rows), so
 * retrieval is QUESTION-DRIVEN: keywords from the user's latest message are
 * searched server-side. Only workspace-shared bases are exposed — owner-
 * private bases stay out of the team chat. Deliberately NOT chunk-indexed
 * (the two-lane rule): structured rows are queried fresh, never copied.
 */
export const flowtableSource: RetrievalSource = {
  key: 'flowtable',
  kind: 'live',
  async run({ query, service }: SourceCtx): Promise<SourceBlock | null> {
    try {
      const terms = [...new Set(
        String(query).toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 3),
      )].slice(0, 6);
      if (!terms.length) return null;

      const { data: bases } = await service
        .from('flowtable_bases')
        .select('id, name, slug')
        .eq('workspace_shared', true)
        .limit(10);
      if (!bases?.length) return null;

      const baseIds = bases.map((b: any) => b.id);
      const baseById: Record<string, any> = {};
      for (const b of bases) baseById[b.id] = b;

      const { data: tables } = await service
        .from('flowtable_tables')
        .select('id, base_id, name, slug')
        .in('base_id', baseIds)
        .limit(30);

      const safeKey = (k: string) => /^[a-zA-Z0-9_]+$/.test(k);
      const esc = (t: string) => t.replace(/[,()\\%]/g, '');
      const ROWS_PER_TABLE = 6;
      const items: SourceItem[] = [];

      for (const t of (tables || [])) {
        const { data: fields } = await service
          .from('flowtable_fields')
          .select('key, name')
          .eq('table_id', t.id)
          .order('position')
          .limit(20);
        const keys = (fields || []).map((f: any) => f.key).filter(safeKey);
        if (!keys.length) continue;

        const orExpr = keys
          .flatMap((k: string) => terms.map((term) => `values->>${k}.ilike.%${esc(term)}%`))
          .join(',');
        const { data: rows } = await service
          .from('flowtable_records')
          .select('id, values')
          .eq('table_id', t.id)
          .or(orExpr)
          .limit(ROWS_PER_TABLE);
        if (!rows?.length) continue;

        const base = baseById[t.base_id];
        for (const rec of rows) {
          const v = rec.values || {};
          const firstVal = String(Object.values(v)[0] ?? rec.id).slice(0, 60);
          const kv = keys
            .map((k: string) => (v[k] != null && v[k] !== '' ? `${k}: ${String(v[k]).slice(0, 200)}` : null))
            .filter(Boolean)
            .join('; ');
          items.push({
            type: 'flowtable',
            id: rec.id,
            title: `${t.name}: ${firstVal}`,
            url: `/admin/flowtable/${base?.slug}/${t.slug}`,
            text: `(${base?.name}/${t.name}) ${kv}`,
          });
        }
      }

      if (!items.length) return null;
      return { source: 'flowtable', header: '### Flowtable (matched rows)', items };
    } catch (e) {
      console.error('flowtable source failed', e);
      return null;
    }
  },
};
