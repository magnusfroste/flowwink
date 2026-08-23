/**
 * Retrieval Engine — indexer (docs/architecture/retrieval-engine.md §3).
 *
 * Drains knowledge_index_queue: loads each queued source row, derives its
 * visibility class from the row's own publication state, chunks it, and
 * diffs against the stored chunks by row hash (chunkRowHash — the ONE
 * definition of "unchanged", covering every descriptive field the row stores).
 * Runs with the SERVICE client (it must read unpublished rows to know they
 * should be REMOVED from the index) — the caller's-eyes rule applies to the
 * QUERY path, never here.
 *
 * Structured/transactional tables (Flowtable, orders, …) are deliberately
 * absent: they are live-query sources behind skills, not chunk sources.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge module over dynamic Supabase rows */
import { chunkMarkdown, chunkText, chunkRowHash, type Chunk } from './chunker.ts';
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

/**
 * How far an uploaded file's text may travel in the index.
 *
 * Every other source declares its purpose by existing: a KB article is written
 * to be read, a published page is published. `documents` is the one table where
 * that is not true — the same table holds a product sheet, an employment
 * contract, a receipt and a CV. An upload carries no purpose of its own, so the
 * index must not invent one for it.
 *
 * We do NOT solve that with a second question ("should this file be searchable?"
 * — the AnythingLLM model). The upload dialog already asks the one question the
 * uploader can actually answer: *who can see this* (shared / role / private).
 * Reach in the index is a CONSEQUENCE of that answer, never a separate switch.
 *
 *   shared  → 'internal'  staff-wide, the same tier the handbook sits on
 *   role    → not indexed  the index has two tiers (public/internal); a
 *                          role-restricted file has no honest home here, and
 *                          'internal' would show HR files to every employee
 *   private → not indexed  the whole point of the answer
 *
 * Note what is missing: nothing here returns 'public'. `knowledge_chunks` has an
 * RLS policy granting anon read of public chunks, so 'public' would put an
 * uploaded file in front of the visitor chat. A file is uploaded because it
 * belongs to the business, not because it was published — the customer-facing
 * tier stays reserved for content someone deliberately wrote for it.
 */
export function documentIndexTier(visibility: string | null | undefined): 'internal' | null {
  // Default (a NULL from a row predating the column) follows the column default.
  return (visibility ?? 'shared') === 'shared' ? 'internal' : null;
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
        .select('title, slug, category, content, is_published')
        .eq('id', entityId)
        .maybeSingle();
      // `=== false` not `!`: on a schema-drifted instance without the column,
      // undefined must mean "published" (the column default), not de-index.
      if (!data || data.is_published === false || !data.content?.trim()) return null;
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
        // it via the internal tier; the /docs page's own chat serves anonymous
        // readers through the ONE named exception (retrieval/vendor-docs.ts —
        // service eyes, source pinned to docs_pages). Because that exception
        // bypasses RLS, the is_published gate above is load-bearing: an
        // unpublished docs page must leave the index, not rely on a tier.
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
      const { data, error } = await service
        .from('documents')
        .select('title, content_md, extraction_status, category, visibility')
        .eq('id', entityId)
        .maybeSingle();
      // A read that FAILED is not a row that says "de-index me". Returning null
      // here deletes the entity's chunks, so a transient outage — or an
      // instance whose schema lacks a column this select names — would quietly
      // empty the index instead of leaving it as it was. Throwing puts the item
      // back on the queue with the reason attached.
      // (autoversio, 2026-08-12: schema head three weeks behind, no
      // documents.visibility. Zero documents there today, which is the only
      // reason this was a near miss rather than an incident.)
      if (error) throw new Error(`documents read failed: ${error.message}`);
      // The platform writes extraction_status='success' (upload_document,
      // extract-pdf-text). This check said 'completed' — a literal that never
      // matched, so NO document was ever indexed, even fully extracted ones.
      // Same near-miss class as the vat-coverage `<> 'void'` filter. Stated
      // positively, accepting both spellings ever written.
      if (!data || !['success', 'completed'].includes(data.extraction_status) || !data.content_md?.trim()) return null;
      const tier = documentIndexTier(data.visibility);
      if (!tier) return null; // private / role-restricted — never enters the shared index
      return {
        title: data.title,
        visibility: tier,
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
  // (preserves their embeddings); changed/new chunks are rewritten.
  //
  // `content` is selected too, because the row hash and the EMBEDDING answer
  // two different questions. The hash asks "does this row still say what it
  // should" across every descriptive field (chunkRowHash — title, content,
  // visibility, metadata). The vector is derived from `content` alone
  // (embedder.ts embeds chunk.content), so it goes stale only when the text
  // does. Nulling the embedding on every hash mismatch would make a pure
  // rename — the very case this hash was widened to catch — re-vectorize the
  // whole index at provider prices for a label no vector can see.
  const { data: existing } = await service
    .from('knowledge_chunks')
    .select('chunk_index, content_hash, content')
    .eq('source_table', sourceTable)
    .eq('entity_id', entityId);
  const existingRows = new Map<number, { content_hash: string; content: string }>(
    (existing ?? []).map((r: any) => [
      r.chunk_index,
      { content_hash: r.content_hash, content: r.content },
    ]),
  );

  const stamp = new Date().toISOString();
  const allRows = await Promise.all(
    extracted.chunks.map(async (c, i) => ({
      source_table: sourceTable,
      entity_id: entityId,
      chunk_index: i,
      title: c.title,
      content: c.content,
      visibility: extracted.visibility,
      metadata: extracted.metadata,
      // ONE hash, over the whole row (chunker.ts). Never recompute it here.
      content_hash: await chunkRowHash({
        title: c.title,
        content: c.content,
        visibility: extracted.visibility,
        metadata: extracted.metadata,
      }),
      updated_at: stamp,
    })),
  );
  const changed = allRows.filter(
    (r) => existingRows.get(r.chunk_index)?.content_hash !== r.content_hash,
  );

  // Two upserts rather than one: PostgREST requires every object in a batch to
  // carry the same keys, and the whole point of the second batch is that it
  // does NOT carry `embedding` — a column absent from the payload is left
  // untouched by ON CONFLICT DO UPDATE, so the existing vector survives a
  // rename intact.
  const textChanged = changed.filter((r) => existingRows.get(r.chunk_index)?.content !== r.content);
  const labelOnly = changed.filter((r) => existingRows.get(r.chunk_index)?.content === r.content);

  if (textChanged.length > 0) {
    const { error } = await service.from('knowledge_chunks').upsert(
      // New or rewritten text: drop the vector so the embed sweep redoes it.
      textChanged.map((r) => ({ ...r, embedding: null, embedding_model: null })),
      { onConflict: 'source_table,entity_id,chunk_index' },
    );
    if (error) throw new Error(`chunk upsert failed: ${error.message}`);
  }
  if (labelOnly.length > 0) {
    const { error } = await service
      .from('knowledge_chunks')
      .upsert(labelOnly, { onConflict: 'source_table,entity_id,chunk_index' });
    if (error) throw new Error(`chunk relabel failed: ${error.message}`);
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

export interface ExtractionSweepResult {
  /** Documents handed to the extractor this run. */
  started: number;
  /** Stale `processing` rows reclaimed (an extractor died mid-flight). */
  reclaimed: number;
  /** Extractor call could not even be dispatched. */
  failed: number;
  /** File types this platform cannot read (marked, not left waiting). */
  unsupported: number;
  /** Why, for the failures — the sweep result is the only place they surface. */
  errors?: string[];
}

/** A `processing` row older than this lost its extractor; take it back. */
const EXTRACTION_STALE_MS = 15 * 60 * 1000;

/** Buckets a document row may point into, longest-prefix first. */
const DOCUMENT_BUCKETS = ['cowork-uploads', 'form-uploads', 'documents'];

/**
 * `documents.file_url` holds two different things depending on who wrote it.
 *
 * The cowork upload path stores a bucket-qualified path (`cowork-uploads/x/y.pdf`);
 * the admin documents page stores one relative to the `documents` bucket
 * (`<uuid>/y.pdf`) and re-attaches the bucket at read time
 * (`storage.from("documents").createSignedUrl(file_url)`). Both are internally
 * consistent, which is why neither side noticed. The extractor takes a
 * bucket-qualified path and splits on the first `/`, so an admin upload would
 * have it look for a bucket named after a UUID.
 *
 * Normalising on read is the honest fix while both formats exist in the wild.
 */
export function toStoragePath(fileUrl: string): string {
  const first = fileUrl.split('/')[0];
  return DOCUMENT_BUCKETS.includes(first) ? fileUrl : `documents/${fileUrl}`;
}

/**
 * Hand `pending` PDFs to the extractor.
 *
 * Uploading a document used to be where the knowledge chain quietly stopped.
 * `extract-pdf-text` was only ever called by the three surfaces that upload on
 * a user's behalf (cowork attachments, job applications, the skill handler) —
 * an admin uploading through the documents page wrote a row with the column
 * default `extraction_status='pending'` and nothing ever came for it. No cron,
 * no trigger, no queue: the platform's own answer to "is this indexed yet" was
 * *pending*, forever. Found on optic 2026-08-12, on the only uploaded file in
 * the fleet, two days after upload.
 *
 * So: the sweeper, rather than a fourth caller. Any row that reaches `pending`
 * gets picked up regardless of how it got there, which is the property a new
 * upload path can't accidentally break.
 *
 * Extraction is claimed by flipping to `processing` before dispatch, so the
 * next 5-minute tick does not pay for the same PDF twice. `failed` rows are
 * left alone — a retry loop on a corrupt file is an unbounded AI bill; retrying
 * is a deliberate act (re-upload, or the extract skill).
 *
 * Every pending document is extracted, including private ones: the text belongs
 * to the document (it is what the document viewer shows), and how far that text
 * travels is decided later and separately by `documentIndexTier`.
 */
export async function sweepPendingExtractions(
  service: any,
  opts: { supabaseUrl: string; serviceKey: string; limit?: number },
): Promise<ExtractionSweepResult> {
  const result: ExtractionSweepResult = { started: 0, reclaimed: 0, failed: 0, unsupported: 0 };

  // Nobody pays to read files for a module they switched off.
  const enabled = await loadEnabledSources(service);
  if (!enabled.has('documents')) return result;

  const staleBefore = new Date(Date.now() - EXTRACTION_STALE_MS).toISOString();
  const { data: stale } = await service
    .from('documents')
    .update({ extraction_status: 'pending' })
    .eq('extraction_status', 'processing')
    .lt('updated_at', staleBefore)
    .select('id');
  result.reclaimed = (stale ?? []).length;

  const { data: pending, error } = await service
    .from('documents')
    .select('id, file_url, file_name, file_type')
    .eq('extraction_status', 'pending')
    .not('file_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(opts.limit ?? 5);
  if (error) throw new Error(`pending scan failed: ${error.message}`);

  for (const doc of pending ?? []) {
    // The extractor is PDF-only. Anything else is marked 'unsupported' rather
    // than left pending: 'pending' promises someone is coming, and for a .docx
    // nobody is. 'failed' would be the other lie — we never tried to parse it.
    const isPdf =
      /pdf/i.test(doc.file_type ?? '') || /\.pdf$/i.test(doc.file_name ?? doc.file_url ?? '');
    if (!isPdf) {
      await service
        .from('documents')
        .update({ extraction_status: 'unsupported' })
        .eq('id', doc.id)
        .eq('extraction_status', 'pending');
      result.unsupported += 1;
      continue;
    }

    const { error: claimError } = await service
      .from('documents')
      .update({ extraction_status: 'processing', extraction_error: null })
      .eq('id', doc.id)
      .eq('extraction_status', 'pending'); // lost race → another sweeper has it
    if (claimError) {
      // Say why. A swallowed claim error is a document that stays pending with
      // an empty extraction_error — indistinguishable from never having been
      // looked at, which is the failure this whole sweeper exists to end.
      console.error(`claim failed for document ${doc.id}:`, claimError.message ?? claimError);
      result.failed += 1;
      result.errors = [...(result.errors ?? []), `${doc.id}: ${claimError.message ?? claimError}`];
      continue;
    }

    try {
      const response = await fetch(`${opts.supabaseUrl}/functions/v1/extract-pdf-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.serviceKey}`,
        },
        body: JSON.stringify({ document_id: doc.id, storage_path: toStoragePath(doc.file_url) }),
      });
      if (!response.ok) throw new Error(`extractor returned ${response.status}`);
      result.started += 1;
    } catch (e) {
      // Could not even dispatch — hand it back so the next tick retries.
      await service
        .from('documents')
        .update({ extraction_status: 'pending', extraction_error: String(e).slice(0, 500) })
        .eq('id', doc.id);
      result.failed += 1;
      result.errors = [...(result.errors ?? []), `${doc.id}: ${String(e).slice(0, 200)}`];
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
