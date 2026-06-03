import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { resolveEmbeddingProvider, embedText } from '../_shared/ai-providers.ts';

/**
 * Resume Match — Hybrid semantic (pgvector) + BM25 (tsvector) matching.
 *
 * Actions (POST body or ?action=...):
 *   - (default) search consultants for a job description
 *   - reindex_stale   → embed all consultant_profiles with embedding_status='stale'
 *   - reindex_one     → embed a single profile (body.id)
 *
 * Embeddings flow through the same site-settings provider chain as chat,
 * but hit `/embeddings` (OpenAI / Gemini / Local). NO Lovable AI Gateway.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function loadProviderSettings(supabase: any) {
  const [{ data: sys }, { data: integ }] = await Promise.all([
    supabase.from('site_settings').select('value').eq('key', 'system_ai').maybeSingle(),
    supabase.from('site_settings').select('value').eq('key', 'integrations').maybeSingle(),
  ]);
  const cfg = (sys?.value || {}) as Record<string, any>;
  return {
    settings: {
      openaiApiKey: cfg.openaiApiKey,
      openaiBaseUrl: cfg.openaiBaseUrl,
      geminiApiKey: cfg.geminiApiKey,
      localEndpoint: cfg.localEndpoint,
      localApiKey: cfg.localApiKey,
    },
    integrations: integ?.value || {},
    preferred: cfg.provider as 'openai' | 'gemini' | 'local' | undefined,
  };
}

function buildProfileText(p: any): string {
  const parts = [
    p.name,
    p.title,
    p.summary,
    p.bio,
    p.skills?.length ? `Skills: ${p.skills.join(', ')}` : '',
    p.certifications?.length ? `Certifications: ${p.certifications.join(', ')}` : '',
    p.languages?.length ? `Languages: ${p.languages.join(', ')}` : '',
    p.experience_years ? `${p.experience_years} years experience` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getServiceClient();
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = url.searchParams.get('action') || body.action || 'search';

    // -------------------------------------------------------------------
    // Reindex: stale batch
    // -------------------------------------------------------------------
    if (action === 'reindex_stale') {
      const limit = Math.min(Number(body.limit) || 25, 100);
      const { data: stale, error } = await supabase
        .from('consultant_profiles')
        .select('id, name, title, summary, bio, skills, certifications, languages, experience_years')
        .eq('embedding_status', 'stale')
        .limit(limit);
      if (error) throw error;
      if (!stale?.length) return json({ success: true, processed: 0, message: 'No stale profiles' });

      const { settings, integrations, preferred } = await loadProviderSettings(supabase);
      const provider = resolveEmbeddingProvider(settings, integrations, preferred);

      let processed = 0;
      const errors: Array<{ id: string; error: string }> = [];
      for (const p of stale) {
        try {
          const text = buildProfileText(p);
          if (!text.trim()) {
            await supabase
              .from('consultant_profiles')
              .update({ embedding_status: 'empty', embedded_at: new Date().toISOString() })
              .eq('id', p.id);
            continue;
          }
          const { embedding, model } = await embedText(text, provider);
          // Use RPC-free direct update — bypass the stale trigger by NOT touching text columns
          const { error: upErr } = await supabase
            .from('consultant_profiles')
            .update({
              embedding: embedding as any,
              embedding_model: `${provider.provider}:${model}`,
              embedding_status: 'fresh',
              embedded_at: new Date().toISOString(),
            })
            .eq('id', p.id);
          if (upErr) throw upErr;
          processed++;
        } catch (e: any) {
          errors.push({ id: p.id, error: e?.message || String(e) });
        }
      }

      return json({ success: true, processed, errors, provider: provider.provider, model: provider.model });
    }

    // -------------------------------------------------------------------
    // Reindex: single
    // -------------------------------------------------------------------
    if (action === 'reindex_one') {
      const id = body.id || url.searchParams.get('id');
      if (!id) return json({ success: false, error: 'id is required' }, 400);
      const { data: p, error } = await supabase
        .from('consultant_profiles')
        .select('id, name, title, summary, bio, skills, certifications, languages, experience_years')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!p) return json({ success: false, error: 'Profile not found' }, 404);

      const { settings, integrations, preferred } = await loadProviderSettings(supabase);
      const provider = resolveEmbeddingProvider(settings, integrations, preferred);
      const text = buildProfileText(p);
      const { embedding, model } = await embedText(text, provider);
      const { error: upErr } = await supabase
        .from('consultant_profiles')
        .update({
          embedding: embedding as any,
          embedding_model: `${provider.provider}:${model}`,
          embedding_status: 'fresh',
          embedded_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (upErr) throw upErr;
      return json({ success: true, id, provider: provider.provider, model });
    }

    // -------------------------------------------------------------------
    // Search: hybrid semantic + BM25
    // -------------------------------------------------------------------
    const jobDescription: string = body.job_description || body.query || '';
    const maxResults: number = Math.min(Number(body.max_results) || 5, 25);
    const semanticWeight: number =
      typeof body.semantic_weight === 'number' ? body.semantic_weight : 0.6;

    if (!jobDescription || jobDescription.length < 10) {
      return json({ success: false, error: 'Job description is required (min 10 chars)' }, 400);
    }

    // Try to get a query embedding. If no provider, gracefully fall back to text-only search.
    let queryEmbedding: number[] | null = null;
    let usedProvider: string | null = null;
    try {
      const { settings, integrations, preferred } = await loadProviderSettings(supabase);
      const provider = resolveEmbeddingProvider(settings, integrations, preferred);
      const r = await embedText(jobDescription, provider);
      queryEmbedding = r.embedding;
      usedProvider = `${provider.provider}:${provider.model}`;
    } catch (e) {
      console.warn('[resume-match] embedding unavailable, falling back to text-only:', e);
    }

    const { data: matches, error: rpcErr } = await supabase.rpc('match_consultants', {
      query_embedding: queryEmbedding as any,
      query_text: jobDescription,
      match_count: maxResults,
      semantic_weight: queryEmbedding ? semanticWeight : 0,
      only_active: true,
    });
    if (rpcErr) throw rpcErr;

    return json({
      success: true,
      matches: matches || [],
      mode: queryEmbedding ? 'hybrid' : 'text_only',
      provider: usedProvider,
    });
  } catch (error) {
    console.error('Resume match error:', error);
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});
