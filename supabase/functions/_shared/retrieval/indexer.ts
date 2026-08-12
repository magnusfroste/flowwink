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

export const CHUNK_SOURCES = ['pages', 'kb_articles', 'wiki_pages', 'docs_pages', 'documents', 'handbook_chapters'] as const;
export type ChunkSource = (typeof CHUNK_SOURCES)[number];

/**
 * Which module owns each chunk source.
 *
 * Embedding costs money per call, so an instance must not pay to index content
 * behind a module its operator switched off — nobody asked for that content to
 * be searchable, and nobody wants the invoice. A disabled module's queue items
 * are dropped (not left to grow) and its existing chunks are removed, so
 * "module off" means the same thing in the index as it does in the nav.
 *
 * Re-enabling a module therefore needs a full reindex of its source; the admin
 * Knowledge Index card's sweep does that.
 */
export const SOURCE_MODULE: Record<ChunkSource, string> = {
  pages: 'pages',
  kb_articles: 'knowledgeBase',
  wiki_pages: 'wiki',
  docs_pages: 'docs',
  documents: 'documents',
  handbook_chapters: 'handbook',
};

/**
 * Read the module map ONCE per sweep — `site_settings` key='modules', the row
 * shape (never a `modules` column; that trap is documented in _shared/modules.ts).
 * A missing/unreadable row means "no opinion": index everything, because
 * failing closed here would silently empty a working instance's index.
 */
export async function loadEnabledSources(service: any): Promise<Set<ChunkSource>> {
  const { data } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'modules')
    .maybeSingle();
  const modules = (data?.value ?? null) as Record<string, { enabled?: boolean }> | null;
  if (!modules) return new Set(CHUNK_SOURCES);
  return new Set(
    CHUNK_SOURCES.filter((src) => {
      const entry = modules[SOURCE_MODULE[src]];
      // A module absent from the map has never been toggled — treat as on.
      return entry === undefined || entry?.enabled === true;
    }),
  );
}

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
        .select('title, slug, question, answer_text, is_published, include_in_chat, visibility')
        .eq('id', entityId)
        .maybeSingle();
      if (!data || !data.is_published) return null;
      const text = [data.question, data.answer_text].filter(Boolean).join('\n\n');
      if (!text.trim()) return null;
      return {
        title: data.title,
        // Audience is a property of the article, not of the table it lives in.
        // Anything but an explicit 'internal' stays public, so a row written
        // before the column existed keeps the audience it always had.
        visibility: data.visibility === 'internal' ? 'internal' : 'public',
        chunks: chunkText(data.title, text),
        // include_in_chat: still indexed (public content, searchable in
        // Flowwork) but the visitor-chat consumer filters it out.
        metadata: { slug: data.slug, url: `/kb/${data.slug}`, include_in_chat: data.include_in_chat !== false },
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
        // INTERNAL, never public. docs_pages is FlowWink's OWN repo
        // documentation synced onto a customer's instance — not the customer's
        // content. Classed 'public' it was readable by the `anon` role, and
        // `search_knowledge_chunks` is EXECUTE-granted to anon, so anyone
        // holding the instance's publishable key (it ships in the JS bundle by
        // design) could read our entire architecture documentation out of a
        // customer's database with one RPC call. Found 2026-08-12 on four
        // fleet instances at once — 7,959 chunks in total. Staff surfaces keep
        // it via the internal tier; the public path is closed by class.
        visibility: 'internal',
        chunks: chunkMarkdown(data.title, data.content),
        metadata: { slug: data.slug, category: data.category, url: `/docs/${data.category}/${data.slug}` },
      };
    }
    case 'handbook_chapters': {
      // The customer's OWN handbook (the Handbook module in the admin nav).
      // NOT docs_pages — that is FlowWink's repo documentation. This table was
      // never indexed at all, so a handbook written by the team was invisible
      // to every retrieval surface until 2026-08-11.
      const { data } = await service
        .from('handbook_chapters')
        .select('title, slug, content')
        .eq('id', entityId)
        .maybeSingle();
      if (!data || !data.content?.trim()) return null;
      return {
        title: data.title,
        visibility: 'internal',
        chunks: chunkMarkdown(data.title, data.content),
        metadata: { slug: data.slug, url: `/admin/handbook` },
      };
    }
    case 'documents': {
      const { data } = await service
        .from('documents')
        .select('title, content_md, extraction_status, category')
        .eq('id', entityId)
        .maybeSingle();
      // The platform writes extraction_status='success' (upload_document,
      // extract-pdf-text). This check said 'completed' — a literal that never
      // matched, so NO document was ever indexed, even fully extracted ones.
      // Same near-miss class as the vat-coverage `<> 'void'` filter. Stated
      // positively, accepting both spellings ever written.
      if (!data || !['success', 'completed'].includes(data.extraction_status) || !data.content_md?.trim()) return null;
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

  // Hash covers content + metadata: a metadata-only change (e.g. flipping
  // include_in_chat) must also propagate through the hash-skip.
  const metaJson = JSON.stringify(extracted.metadata);
  const allRows = await Promise.all(
    extracted.chunks.map(async (c, i) => ({
      source_table: sourceTable,
      entity_id: entityId,
      chunk_index: i,
      title: c.title,
      content: c.content,
      visibility: extracted.visibility,
      metadata: extracted.metadata,
      content_hash: await contentHash(c.content + ' ' + metaJson),
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
  /** Queue items dropped because their module is switched off (no embedding spend). */
  skipped_disabled?: number;
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

  const result: SweepResult = { processed: 0, indexed_chunks: 0, deindexed: 0, failed: 0, skipped_disabled: 0 };
  const enabled = await loadEnabledSources(service);

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
    if (!enabled.has(item.source_table)) {
      // Module off: drop the queue item (a kept item would make the queue grow
      // forever) and remove any chunks already indexed for this entity, so the
      // index says the same thing the nav does. No embedding call is made —
      // that is the whole point: nobody should be billed for content they
      // switched off.
      await service
        .from('knowledge_chunks')
        .delete()
        .eq('source_table', item.source_table)
        .eq('entity_id', item.entity_id);
      await service
        .from('knowledge_index_queue')
        .delete()
        .eq('source_table', item.source_table)
        .eq('entity_id', item.entity_id);
      result.skipped_disabled = (result.skipped_disabled ?? 0) + 1;
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
