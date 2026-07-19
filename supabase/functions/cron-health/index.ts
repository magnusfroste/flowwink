// cron-health — HTTP surface for the scheduled-job health report (hardening #1,
// layer 2). Calls the cron_health_report() RPC (parser-free flags + recent HTTP
// errors) and enriches it with staleness via the SHARED calculateNextRun, so
// the admin card and the heartbeat gate read the exact same brain. Admin-JWT or
// service-role only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceOrRole, unauthorized } from '../_shared/edge-auth.ts';
import { enrichCronHealth, type CronHealthReport } from '../_shared/cron/health.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const auth = await requireServiceOrRole(req, supabase, 'admin');
    if (!auth.authorized) return unauthorized(corsHeaders);

    const { data, error } = await supabase.rpc('cron_health_report');
    if (error) {
      return new Response(JSON.stringify({ error: `cron_health_report failed: ${error.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const enriched = enrichCronHealth((data ?? {}) as CronHealthReport);
    return new Response(JSON.stringify(enriched), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
