/**
 * Retrieval Engine — indexer (docs/architecture/retrieval-engine.md §3).
 *
 * Drains knowledge_index_queue: loads each queued source row, derives its
 * visibility class from the row's own publication state, chunks it, and
 * diffs against the stored chunks by content hash. Runs with the SERVICE
 * client (it must read unpublished rows to know they should be REMOVED from
 * the index) — the caller's-eyes rule applies to the QUERY path, never here.
 *
 * Structured/transactional tables (Flowtable, orders, …) are deliberately
 * absent: they are live-query sources behind skills, not chunk sources.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge module over dynamic Supabase rows */
import { chunkMarkdown, chunkText, contentHash, type Chunk } from './chunker.ts';
import { extractTextFromBlock } from '../chat-context.ts';

export const CHUNK_SOURCES = ['pages', 'kb_articles', 'wiki_pages', 'docs_pages', 'documents'] as const;
export type ChunkSource = (typeof CHUNK_SOURCES)[number];

interface ExtractedEntity {
  /** null → entity should not be indexed (unpublished/deleted) */
  title: string;
  visibility: 'public' | 'internal';
  chunks: Chunk[];
  metadata: Record<string, unknown>;
}

/** Load one source row and produce its chunks, or null to de-index it. */
async function extractEntity(
  service: any,
  sourceTable: ChunkSource,
  entityId: string,
): Promise<ExtractedEntity | null> {
  switch (sourceTable) {
    case 'pages': {
      const { data } = await service
        .from('pages')
        .select('title, slug, status, deleted_at, content_json')
        .eq('id', entityId)
        .maybeSingle();
      if (!data || data.status !== 'published' || data.deleted_at) return null;
      const text = (Array.isArray(data.content_json) ? data.content_json : [])
        .map((b: any) => extractTextFromBlock(b))
        .filter(Boolean)
        .join('\n\n');
      if (!text.trim()) return null;
      return {
        title: data.title,
        visibility: 'public',
        chunks: chunkText(data.title, text),
        metadata: { slug: data.slug, url: `/${data.slug}` },
      };
    }
    case 'kb_articles': {
      const { data } = await service
        .from('kb_articles')
        .select('title, slug, question, answer_text, is_published')
        .eq('id', entityId)
        .maybeSingle();
      if (!data || !data.is_published) return null;
      const text = [data.question, data.answer_text].filter(Boolean).join('\n\n');
      if (!text.trim()) return null;
      return {
        title: data.title,
        visibility: 'public',
        chunks: chunkText(data.title, text),
        metadata: { slug: data.slug, url: `/kb/${data.slug}` },
      };
    }
    case 'wiki_pages': {
      const { data } = await service
        .from('wiki_pages')
        .select('slug, title, content_md')
        .eq('slug', entityId)
        .maybeSingle();
      if (!data || !data.content_md?.trim()) return null;
      return {
        title: data.title,
        visibility: 'internal',
        chunks: chunkMarkdown(data.title, data.content_md),
        metadata: { slug: data.slug, url: `/admin/wiki/${data.slug}` },
      };
    }
    case 'docs_pages': {
      const { data } = await service
        .from('docs_pages')
        .select('title, slug, category, content')
        .eq('id', entityId)
        .maybeSingle();
      if (!data || !data.content?.trim()) return null;
      return {
        title: data.title,
        visibility: 'public',
        chunks: chunkMarkdown(data.title, data.content),
        metadata: { slug: data.slug, category: data.category, url: `/docs/${data.category}/${data.slug}` },
      };
    }
    case 'documents': {
      const { data } = await service
        .from('documents')
        .select('title, content_md, extraction_status, category')
        .eq('id', entityId)
        .maybeSingle();
      if (!data || data.extraction_status !== 'completed' || !data.content_md?.trim()) return null;
      return {
        title: data.title,
        visibility: 'internal',
        chunks: chunkMarkdown(data.title, data.content_md),
        metadata: { category: data.category },
      };
    }
  }
}

async function reindexEntity(
  service: any,
  sourceTable: ChunkSource,
  entityId: string,
): Promise<{ chunks: number; removed: boolean }> {
  const extracted = await extractEntity(service, sourceTable, entityId);

  if (!extracted) {
    await service
      .from('knowledge_chunks')
      .delete()
      .eq('source_table', sourceTable)
      .eq('entity_id', entityId);
    return { chunks: 0, removed: true };
  }

  // Hash-diff against stored chunks: unchanged chunks are skipped entirely
  // (preserves their embeddings); changed/new chunks get embedding wiped so
  // the embed sweep (embedder.ts) re-vectorizes them.
  const { data: existing } = await service
    .from('knowledge_chunks')
    .select('chunk_index, content_hash')
    .eq('source_table', sourceTable)
    .eq('entity_id', entityId);
  const existingHashes = new Map<number, string>(
    (existing ?? []).map((r: any) => [r.chunk_index, r.content_hash]),
  );

  const allRows = await Promise.all(
    extracted.chunks.map(async (c, i) => ({
      source_table: sourceTable,
      entity_id: entityId,
      chunk_index: i,
      title: c.title,
      content: c.content,
      visibility: extracted.visibility,
      metadata: extracted.metadata,
      content_hash: await contentHash(c.content),
      embedding: null,
      embedding_model: null,
      updated_at: new Date().toISOString(),
    })),
  );
  const rows = allRows.filter((r) => existingHashes.get(r.chunk_index) !== r.content_hash);

  if (rows.length > 0) {
    const { error } = await service
      .from('knowledge_chunks')
      .upsert(rows, { onConflict: 'source_table,entity_id,chunk_index' });
    if (error) throw new Error(`chunk upsert failed: ${error.message}`);
  }
  // Trim the stale tail beyond the CURRENT total chunk count (not just the
  // changed subset).
  await service
    .from('knowledge_chunks')
    .delete()
    .eq('source_table', sourceTable)
    .eq('entity_id', entityId)
    .gte('chunk_index', allRows.length);

  return { chunks: allRows.length, removed: false };
}

export interface SweepResult {
  processed: number;
  indexed_chunks: number;
  deindexed: number;
  failed: number;
}

/** Drain up to `limit` queue entries. Failures stay queued with the error. */
export async function processQueue(service: any, limit = 50): Promise<SweepResult> {
  const { data: queue, error } = await service
    .from('knowledge_index_queue')
    .select('source_table, entity_id, op, attempts')
    .lt('attempts', 5)
    .order('queued_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`queue read failed: ${error.message}`);

  const result: SweepResult = { processed: 0, indexed_chunks: 0, deindexed: 0, failed: 0 };

  for (const item of queue ?? []) {
    if (!CHUNK_SOURCES.includes(item.source_table)) {
      // Unknown source (schema drift) — drop rather than poison the queue.
      await service
        .from('knowledge_index_queue')
        .delete()
        .eq('source_table', item.source_table)
        .eq('entity_id', item.entity_id);
      continue;
    }
    try {
      const r =
        item.op === 'delete'
          ? await reindexEntity(service, item.source_table, item.entity_id) // extract returns null → delete
          : await reindexEntity(service, item.source_table, item.entity_id);
      result.processed += 1;
      result.indexed_chunks += r.chunks;
      if (r.removed) result.deindexed += 1;
      await service
        .from('knowledge_index_queue')
        .delete()
        .eq('source_table', item.source_table)
        .eq('entity_id', item.entity_id);
    } catch (e) {
      result.failed += 1;
      await service
        .from('knowledge_index_queue')
        .update({ attempts: (item.attempts ?? 0) + 1, last_error: String(e).slice(0, 500) })
        .eq('source_table', item.source_table)
        .eq('entity_id', item.entity_id);
    }
  }
  return result;
}

/** Re-queue every indexable entity (heal-drift skill surface). */
export async function queueFullReindex(service: any, source?: ChunkSource): Promise<number> {
  const sources = source ? [source] : [...CHUNK_SOURCES];
  let queued = 0;
  for (const s of sources) {
    const idCol = s === 'wiki_pages' ? 'slug' : 'id';
    let query = service.from(s).select(idCol);
    if (s === 'documents') query = query.not('content_md', 'is', null);
    const { data, error } = await query;
    if (error) throw new Error(`full reindex scan of ${s} failed: ${error.message}`);
    const rows = (data ?? []).map((r: any) => ({
      source_table: s,
      entity_id: String(r[idCol]),
      op: 'upsert',
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await service
        .from('knowledge_index_queue')
        .upsert(rows.slice(i, i + 500), { onConflict: 'source_table,entity_id' });
    }
    queued += rows.length;
  }
  return queued;
}
