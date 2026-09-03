// Retrieval Engine sweeper (docs/architecture/retrieval-engine.md §3).
// Cron-invoked every 5 min (job 'knowledge-indexer', self-registered on first
// run via register_knowledge_indexer_cron): drains knowledge_index_queue into
// knowledge_chunks. Also accepts {"full_reindex": true, "source"?: "<table>"}
// to re-queue everything (heal-drift surface).
//
// Runs with the service client — the indexer must see unpublished rows to
// REMOVE them from the index. The caller's-eyes rule applies to the query
// path (search_knowledge_chunks, SECURITY INVOKER), never to indexing.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-clients.ts';
import {
  processQueue,
  queueFullReindex,
  sweepPendingExtractions,
  CHUNK_SOURCES,
  type ChunkSource,
} from '../_shared/retrieval/indexer.ts';
import { embedPendingChunks } from '../_shared/retrieval/embedder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const service = getServiceClient();
    const body = await req.json().catch(() => ({}));

    // Idempotent cron self-registration (no-op after the first run).
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (supabaseUrl && anonKey) {
      const { error: cronError } = await service.rpc('register_knowledge_indexer_cron', {
        p_supabase_url: supabaseUrl,
        p_anon_key: anonKey,
      });
      if (cronError) console.error('cron registration failed (non-fatal):', cronError.message);
    }

    let queued: number | undefined;
    if (body.full_reindex) {
      const source = body.source as ChunkSource | undefined;
      if (source && !CHUNK_SOURCES.includes(source)) {
        return new Response(
          JSON.stringify({ error: `unknown source '${source}' — expected one of ${CHUNK_SOURCES.join(', ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      queued = await queueFullReindex(service, source);
      // Queue only. Re-chunking every source and embedding in the same request
      // is what blew the worker's CPU budget on a 1000-chunk instance and came
      // back to the button as "indexer run failed" while the work half-happened.
      // The cron sweep drains the queue in bounded slices; say so.
      return new Response(
        JSON.stringify({ status: 'queued', queued, note: 'Queued for the sweep. It runs every 5 minutes and drains in bounded slices; press Sweep now to start at once.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // A document has to be READ before it can be indexed. Uploads land as
    // extraction_status='pending' and nothing used to come for them, so the
    // chain stopped one step before the queue. Extraction is dispatched (the
    // extractor answers 202 and finishes in the background) rather than awaited
    // — a slow PDF must not hold up the queue drain behind it.
    let extraction: Awaited<ReturnType<typeof sweepPendingExtractions>> | undefined;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (supabaseUrl && serviceKey) {
      try {
        extraction = await sweepPendingExtractions(service, {
          supabaseUrl,
          serviceKey,
          limit: body.extract_limit ?? 5,
        });
      } catch (e) {
        // Extraction trouble must not stop indexing of everything else.
        console.error('extraction sweep failed (non-fatal):', String(e));
      }
    }

    const sweep = await processQueue(service, body.limit ?? 50);

    // M2: vectorize chunks lacking an embedding (or embedded with an old
    // model). No provider configured → {provider: null}, text-only lane.
    const embed = await embedPendingChunks(service, body.embed_limit ?? 80);

    return new Response(
      JSON.stringify({
        status: 'ok',
        ...(queued !== undefined ? { queued } : {}),
        ...sweep,
        embed,
        ...(extraction ? { extraction } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('knowledge-indexer error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
