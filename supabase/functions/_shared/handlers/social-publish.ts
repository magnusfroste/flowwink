// process_due_social_posts — the last weld in the social rail.
//
// Until now this was an RPC that marked due posts failed ("No channel
// publisher configured") — honest, but the queue never actually published.
// This handler keeps the same contract (returns an array of
// {post_id, channel, status, ...}; the Social Post Scheduler automation calls
// it every 15 minutes) and adds the publish step:
//
//   linkedin → composio-proxy execute LINKEDIN_CREATE_LINKED_IN_POST with the
//   connected account's author URN (LINKEDIN_GET_MY_INFO, fetched once per
//   sweep). Success → status 'posted' + external_ref/external_url.
//   Failure, or a channel with no publisher → status 'failed' with the reason,
//   exactly as before. The queue stays honest either way.
//
// Scheduling IS the approval: a post reaches this code only after someone (or
// a trusted agent) explicitly set status 'scheduled' with a time.
//
// RETURN SHAPE. An array cannot carry the work-done contract
// (_shared/activity/work-done.ts) — a JSON array has no place to put a
// `work_done` key — and an empty array is exactly the "declares nothing,
// so keep the row" case that used to write a row every 15 minutes on a site
// with no scheduled posts. So the sweep returns an OBJECT: the same list under
// `processed`, plus the count it changed. Callers that read the list read
// result.processed.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { HandlerCtx } from './qualify-lead.ts';

interface SweepResult {
  post_id: string;
  channel: string;
  status: 'posted' | 'failed';
  external_url?: string;
  error?: string;
}

async function composioExecute(
  ctx: HandlerCtx,
  actionName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; data: any; error?: string }> {
  try {
    const res = await fetch(`${ctx.supabaseUrl}/functions/v1/composio-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ctx.serviceKey}` },
      // The proxy reads tool args from params.arguments — top-level spread
      // reached Composio as {} ("author, commentary missing" on the premiere
      // post; GET_MY_INFO had masked it by taking no arguments).
      body: JSON.stringify({ action: 'execute', params: { action_name: actionName, toolkit: 'linkedin', arguments: args } }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, data, error: data?.error ?? `composio-proxy ${res.status}` };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Dig the post URN out of Composio's response envelope (shapes vary). */
function extractPostUrn(data: any): string | null {
  const r = data?.result ?? data;
  const cands = [
    r?.data?.response_dict?.id,
    r?.data?.id,
    r?.response_data?.id,
    r?.data?.response_dict?.['x-restli-id'],
    r?.data?.['x-restli-id'],
  ];
  for (const c of cands) {
    if (typeof c === 'string' && c.startsWith('urn:li:')) return c;
  }
  return null;
}

export interface SocialSweepReport {
  /** The work-done contract: posts this sweep actually touched. */
  work_done: number;
  processed: SweepResult[];
}

export async function executeProcessDueSocialPosts(
  supabase: SupabaseClient,
  _args: Record<string, unknown>,
  ctx: HandlerCtx,
): Promise<SocialSweepReport> {
  const { data: due, error } = await supabase
    .from('social_posts')
    .select('id, channel, content, link_url')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(10);
  if (error) throw new Error(`social_posts select failed: ${error.message}`);
  if (!due || due.length === 0) return { work_done: 0, processed: [] };

  const results: SweepResult[] = [];

  // Author URN once per sweep — every LinkedIn post this round signs the same.
  let authorUrn: string | null = null;
  let authorError: string | null = null;
  if (due.some((p) => p.channel === 'linkedin')) {
    const me = await composioExecute(ctx, 'LINKEDIN_GET_MY_INFO', {});
    const r = me.data?.result ?? me.data;
    authorUrn = r?.data?.response_dict?.author_id ?? r?.data?.author_id ?? null;
    if (!me.ok || !authorUrn) {
      authorError = me.error ?? 'No LinkedIn account connected (LINKEDIN_GET_MY_INFO gave no author URN)';
    }
  }

  for (const post of due) {
    if (post.channel === 'linkedin' && authorUrn) {
      const commentary = post.link_url ? `${post.content}\n\n${post.link_url}` : post.content;
      const pub = await composioExecute(ctx, 'LINKEDIN_CREATE_LINKED_IN_POST', {
        author: authorUrn,
        commentary,
        visibility: 'PUBLIC',
        lifecycleState: 'PUBLISHED',
      });
      const urn = extractPostUrn(pub.data);
      const succeeded = pub.ok && !(pub.data?.result?.error || pub.data?.error);
      if (succeeded) {
        const externalUrl = urn ? `https://www.linkedin.com/feed/update/${urn}` : null;
        await supabase.from('social_posts').update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          external_ref: urn,
          external_url: externalUrl,
          error: null,
        }).eq('id', post.id);
        results.push({ post_id: post.id, channel: post.channel, status: 'posted', external_url: externalUrl ?? undefined });
        continue;
      }
      const reason = pub.error ?? JSON.stringify(pub.data?.result?.error ?? pub.data?.error ?? 'unknown publish error').slice(0, 300);
      await supabase.from('social_posts').update({ status: 'failed', error: `LinkedIn publish failed: ${reason}` }).eq('id', post.id);
      results.push({ post_id: post.id, channel: post.channel, status: 'failed', error: reason });
      continue;
    }

    // No publisher for this channel (or LinkedIn without a connected account):
    // the pre-weld behavior, verbatim — fail honestly, never linger.
    const note = post.channel === 'linkedin' && authorError
      ? `LinkedIn publisher unavailable: ${authorError}`
      : 'No channel publisher configured — mark manually or connect the integration.';
    await supabase.from('social_posts').update({ status: 'failed', error: note }).eq('id', post.id);
    results.push({ post_id: post.id, channel: post.channel, status: 'failed', error: note });
  }

  // Every entry is a post whose row changed — posted or marked failed. A failed
  // publish IS work: it is a state change someone has to see.
  return { work_done: results.length, processed: results };
}
