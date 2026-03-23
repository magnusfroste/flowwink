import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeSkillHash, runIntegrityChecks } from '../_shared/integrity.ts';
import type { HealthCheckResult } from '../_shared/integrity.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);

  try {
    let checksTotal = 0;
    let checksPassed = 0;

    // ── 1. Skills ──────────────────────────────────────────────────────
    const { data: skills } = await supabase
      .from('agent_skills')
      .select('name, instructions, enabled');
    
    const allSkills = skills || [];
    const enabledSkills = allSkills.filter((s: any) => s.enabled);
    const skillHash = await computeSkillHash(enabledSkills);

    // Load expected hash from agent_memory
    const { data: hashMem } = await supabase
      .from('agent_memory')
      .select('value')
      .eq('key', 'expected_skill_hash')
      .maybeSingle();
    
    const expectedHash = hashMem?.value?.hash ?? null;
    const hashMatch = expectedHash ? skillHash === expectedHash : null;

    checksTotal++;
    if (enabledSkills.length >= 10) checksPassed++;

    checksTotal++;
    if (hashMatch !== false) checksPassed++; // pass if match or no baseline

    // ── 2. Memory keys ────────────────────────────────────────────────
    const { data: memKeys } = await supabase
      .from('agent_memory')
      .select('key')
      .in('key', ['soul', 'identity', 'agents']);
    
    const foundKeys = new Set((memKeys || []).map((m: any) => m.key));
    const memoryStatus = {
      soul: foundKeys.has('soul'),
      identity: foundKeys.has('identity'),
      agents: foundKeys.has('agents'),
    };

    checksTotal++;
    if (memoryStatus.soul && memoryStatus.identity) checksPassed++;

    // ── 3. Heartbeat freshness ────────────────────────────────────────
    const { data: lastHb } = await supabase
      .from('agent_memory')
      .select('updated_at')
      .eq('key', 'heartbeat_state')
      .maybeSingle();

    let heartbeatAgeHours: number | null = null;
    let heartbeatStale = false;
    if (lastHb?.updated_at) {
      heartbeatAgeHours = (Date.now() - new Date(lastHb.updated_at).getTime()) / 3_600_000;
      heartbeatStale = heartbeatAgeHours > 48;
    } else {
      heartbeatStale = true;
    }

    checksTotal++;
    if (!heartbeatStale) checksPassed++;

    // ── 4. Integrity checks ──────────────────────────────────────────
    const integrity = await runIntegrityChecks(supabase);

    checksTotal++;
    if (integrity.score >= 80) checksPassed++;

    // ── Determine overall status ─────────────────────────────────────
    const ratio = checksPassed / checksTotal;
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (ratio >= 0.8) status = 'healthy';
    else if (ratio >= 0.5) status = 'degraded';
    else status = 'unhealthy';

    // Override to unhealthy if skill hash drifted
    if (hashMatch === false) {
      status = status === 'healthy' ? 'degraded' : status;
    }

    const result: HealthCheckResult = {
      status,
      checked_at: new Date().toISOString(),
      version: {
        skill_count: allSkills.length,
        enabled_count: enabledSkills.length,
        skill_hash: skillHash,
        expected_hash: expectedHash,
        hash_match: hashMatch,
      },
      memory: memoryStatus,
      heartbeat: {
        last_run: lastHb?.updated_at ?? null,
        age_hours: heartbeatAgeHours ? Math.round(heartbeatAgeHours * 10) / 10 : null,
        stale: heartbeatStale,
      },
      integrity: {
        score: integrity.score,
        issues: integrity.issues,
      },
      checks_passed: checksPassed,
      checks_total: checksTotal,
    };

    // Log result to agent_activity for historical tracking
    try {
      await supabase.from('agent_activity').insert({
        agent: 'flowpilot',
        skill_name: 'instance_health_check',
        input: { trigger: 'api' },
        output: { status: result.status, score: integrity.score, hash_match: hashMatch },
        status: result.status === 'unhealthy' ? 'failed' : 'success',
        duration_ms: 0,
      });
    } catch { /* non-fatal */ }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[instance-health] Error:', err);
    return new Response(
      JSON.stringify({ status: 'unhealthy', error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
