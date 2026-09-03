/**
 * Retrieval Engine — embedding leg (docs/architecture/retrieval-engine.md, M2).
 *
 * Reuses the consultant-match pattern verbatim: provider resolution via
 * resolveEmbeddingProvider (OpenAI → Gemini → Local) with **graceful
 * text-only fallback** — no provider configured means retrieval degrades to
 * tsvector ranking, never errors (Law 4).
 *
 * Reading provider config requires the service client (site_settings holds
 * API keys). That is fine for CONFIG; the caller's-eyes rule applies to the
 * chunk SEARCH, which still runs on the caller's client.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge module over dynamic Supabase rows */
import { resolveEmbeddingProvider, embedText, type EmbeddingProviderConfig } from '../ai-providers.ts';

/** Resolve the active embedding provider, or null when none is configured. */
export async function loadEmbeddingProvider(service: any): Promise<EmbeddingProviderConfig | null> {
  try {
    const [{ data: ai }, { data: integ }] = await Promise.all([
      service.from('site_settings').select('value').eq('key', 'system_ai').maybeSingle(),
      service.from('site_settings').select('value').eq('key', 'integrations').maybeSingle(),
    ]);
    return resolveEmbeddingProvider(ai?.value ?? undefined, integ?.value ?? {});
  } catch {
    return null; // no provider → text-only lane
  }
}

/** Embed a query string; null on any failure (fallback lane). */
export async function embedQuery(service: any, text: string): Promise<number[] | null> {
  try {
    const provider = await loadEmbeddingProvider(service);
    if (!provider || !text?.trim()) return null;
    const { embedding } = await embedText(text, provider);
    return embedding;
  } catch (e) {
    console.error('embedQuery fallback to text-only:', e);
    return null;
  }
}

export interface EmbedSweepResult {
  provider: string | null;
  embedded: number;
  failed: number;
  pending: number;
}

/**
 * Embed chunks that lack a vector OR were embedded with a different model
 * (model switch marks everything stale). Bounded per sweep — the 5-minute
 * cron catches up over successive runs.
 */
/** After this many failed attempts a chunk is parked; a reindex resets the count. */
export const MAX_EMBED_ATTEMPTS = 5;

export async function embedPendingChunks(service: any, limit = 80): Promise<EmbedSweepResult> {
  const provider = await loadEmbeddingProvider(service);
  if (!provider) return { provider: null, embedded: 0, failed: 0, pending: 0 };

  const modelTag = `${provider.provider}:${provider.model}`;

  // Fewest attempts first, oldest first: a chunk the provider rejects every
  // time drifts to the back after its failures instead of sitting at the
  // front and stopping the sweep at "3 consecutive failures" forever (the
  // labs1100 wedge, 2026-09-03). Five strikes and it is parked — visible in
  // the stats with its error — until a reindex resets the count.
  const { data: pending, error } = await service
    .from('knowledge_chunks')
    .select('id, content, embedding_attempts')
    .or(`embedding.is.null,embedding_model.neq.${modelTag}`)
    .lt('embedding_attempts', MAX_EMBED_ATTEMPTS)
    .order('embedding_attempts', { ascending: true })
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`embed sweep read failed: ${error.message}`);

  let embedded = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (const chunk of pending ?? []) {
    try {
      const { embedding } = await embedText(chunk.content, provider);
      const { error: upErr } = await service
        .from('knowledge_chunks')
        .update({ embedding, embedding_model: modelTag, embedding_attempts: 0, embedding_error: null, embedding_attempted_at: new Date().toISOString() })
        .eq('id', chunk.id);
      if (upErr) throw new Error(upErr.message);
      embedded += 1;
      consecutiveFailures = 0;
    } catch (e) {
      failed += 1;
      consecutiveFailures += 1;
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      console.error(`embed failed for chunk ${chunk.id}:`, message);
      // Write the failure on the chunk: the count, the time, the text. The
      // Observability card reads it back, so "check the AI provider key" is
      // replaced by what the provider actually said.
      const { error: markErr } = await service
        .from('knowledge_chunks')
        .update({ embedding_attempts: (chunk.embedding_attempts ?? 0) + 1, embedding_error: message, embedding_attempted_at: new Date().toISOString() })
        .eq('id', chunk.id);
      if (markErr) console.error(`could not record the embed failure on ${chunk.id}:`, markErr.message);
      // A dead/quota-exhausted provider fails every call — don't hammer it
      // with the whole batch; the next cron sweep retries.
      if (consecutiveFailures >= 3) {
        console.error('embed sweep aborted after 3 consecutive failures (provider down/quota)');
        break;
      }
    }
  }

  const { count } = await service
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .or(`embedding.is.null,embedding_model.neq.${modelTag}`);

  return { provider: modelTag, embedded, failed, pending: count ?? 0 };
}
