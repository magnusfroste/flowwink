import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { requireServiceOrRole } from '../_shared/edge-auth.ts';

/**
 * flowpilot-lifecycle — the autonomous operator's lifecycle cluster
 * (edge-surface refactor B5, replacing five standalone functions:
 * flowpilot-briefing, flowpilot-distill, flowpilot-learn,
 * flowpilot-followthrough and skill-curator).
 *
 * Each former function's serve() body lives VERBATIM as ./[task].ts — this
 * file only picks the handler and preserves each function's auth profile:
 *
 *   - briefing, learn, followthrough, curator were deployed --no-verify-jwt
 *     (pg_cron POSTs, heartbeat's internal hop). flowpilot-lifecycle is
 *     therefore deployed --no-verify-jwt too.
 *   - distill was JWT-gated (verify_jwt=true, called from the admin UI). It
 *     gets an equivalent in-body gate here (service key or admin JWT) so the
 *     consolidation never widens access.
 *
 * task is read from ?task=, from body.task, or derived from the _skill field
 * agent-execute's edge: dispatch injects (run_daily_briefing, curate_skills,
 * flip to edge:flowpilot-lifecycle with zero agent-facing change).
 *
 * Wire-name note (naming policy): the pg_cron JOBNAMES stay 'flowpilot-learn'
 * etc. — only the URL in the job command changes, via the forward-dated
 * self-heal migration 20260719233000. Renaming jobnames would be a
 * multi-instance lockstep with zero user value.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { handler as briefing } from './briefing.ts';
import { handler as distill } from './distill.ts';
import { handler as learn } from './learn.ts';
import { handler as followthrough } from './followthrough.ts';
import { handler as resume } from './resume.ts';
import { handler as curator } from './curator.ts';

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  briefing, distill, learn, followthrough, resume, curator,
};

// Tasks whose standalone function was JWT-gated (verify_jwt=true).
const GATED = new Set(['distill']);

// Skill-name → task, for calls arriving through agent-execute's edge: dispatch.
const SKILL_TO_TASK: Record<string, string> = {
  run_daily_briefing: 'briefing',
  learn_from_data: 'learn',
  run_skill_curator: 'curator',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let task = new URL(req.url).searchParams.get('task') ?? '';
  let bodyText: string | null = null;

  if (!task && req.method === 'POST') {
    bodyText = await req.text();
    try {
      const parsed = JSON.parse(bodyText || '{}');
      task = parsed?.task ?? SKILL_TO_TASK[parsed?._skill] ?? '';
    } catch { /* not JSON */ }
  }

  const handler = HANDLERS[task];
  if (!handler) {
    return new Response(
      JSON.stringify({ error: `Unknown lifecycle task '${task || '(none)'}'. Use one of: ${Object.keys(HANDLERS).join(', ')}.` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (GATED.has(task)) {
    const auth = await requireServiceOrRole(req, getServiceClient());
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const delegated = bodyText === null
    ? req
    : new Request(req.url, { method: req.method, headers: req.headers, body: bodyText });

  return handler(delegated);
});
