// score-visitor-intent
// Evaluates visitor-intelligence rules from site_settings against page_views,
// emits rows to visitor_signals for identified leads, and bumps lead.score.
// Idempotent per (lead_id, rule_id, day): a rule won't double-fire the same day.
//
// Trigger modes:
//   - POST {} — evaluate all identified visitors seen in the last 30 days.
//   - POST { lead_id } — evaluate one lead.
//   - Meant to run via cron every 15 min (see runbook in the module file).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface Rule {
  id: string;
  name: string;
  type: 'session_count' | 'url_visits' | 'page_view_count' | 'reawakening';
  window_days?: number;
  threshold?: number;
  url_pattern?: string;
  silence_days?: number;
  score: number;
}

interface RulesConfig {
  enabled: boolean;
  rules: Rule[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const targetLeadId: string | undefined = body?.lead_id;

    // 1. Load rules
    const { data: settings } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'visitor_intelligence_rules')
      .maybeSingle();

    const config = (settings?.value as unknown as RulesConfig) || { enabled: true, rules: [] };
    if (!config.enabled || !config.rules?.length) {
      return json({ success: true, message: 'Rules disabled or empty', signals_fired: 0 });
    }

    // 2. Pick leads to evaluate
    let leadIds: string[] = [];
    if (targetLeadId) {
      leadIds = [targetLeadId];
    } else {
      const { data } = await supabase
        .from('visitor_identities')
        .select('lead_id')
        .gte('identified_at', new Date(Date.now() - 30 * 24 * 3600e3).toISOString())
        .not('lead_id', 'is', null);
      leadIds = [...new Set((data || []).map((r: { lead_id: string }) => r.lead_id))];
    }

    let signalsFired = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const leadId of leadIds) {
      // Skip if any rule already fired for this lead today (cheap idempotency)
      const { data: firedToday } = await supabase
        .from('visitor_signals')
        .select('rule_id')
        .eq('lead_id', leadId)
        .gte('fired_at', `${today}T00:00:00Z`);
      const alreadyFired = new Set((firedToday || []).map((r: { rule_id: string }) => r.rule_id));

      // Load recent page_views for this lead
      const { data: views } = await supabase
        .from('page_views')
        .select('page_slug, session_id, created_at')
        .eq('lead_id', leadId)
        .gte('created_at', new Date(Date.now() - 60 * 24 * 3600e3).toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      const pageViews = views || [];
      if (!pageViews.length) continue;

      for (const rule of config.rules) {
        if (alreadyFired.has(rule.id)) continue;

        const windowStart = rule.window_days
          ? new Date(Date.now() - rule.window_days * 24 * 3600e3)
          : null;

        let matched = false;
        let evidence: Record<string, unknown> = {};

        if (rule.type === 'session_count') {
          const inWindow = windowStart
            ? pageViews.filter((v) => new Date(v.created_at) >= windowStart)
            : pageViews;
          const sessions = new Set(inWindow.map((v) => v.session_id).filter(Boolean));
          if (sessions.size >= (rule.threshold ?? 1)) {
            matched = true;
            evidence = { sessions: sessions.size, window_days: rule.window_days };
          }
        } else if (rule.type === 'url_visits' && rule.url_pattern) {
          const inWindow = windowStart
            ? pageViews.filter((v) => new Date(v.created_at) >= windowStart)
            : pageViews;
          const hits = inWindow.filter((v) => v.page_slug?.includes(rule.url_pattern!));
          if (hits.length >= (rule.threshold ?? 1)) {
            matched = true;
            evidence = { hits: hits.length, pattern: rule.url_pattern };
          }
        } else if (rule.type === 'page_view_count') {
          const inWindow = windowStart
            ? pageViews.filter((v) => new Date(v.created_at) >= windowStart)
            : pageViews;
          if (inWindow.length >= (rule.threshold ?? 1)) {
            matched = true;
            evidence = { count: inWindow.length, window_days: rule.window_days };
          }
        } else if (rule.type === 'reawakening') {
          const sorted = pageViews.map((v) => new Date(v.created_at).getTime()).sort();
          for (let i = 1; i < sorted.length; i++) {
            const gapDays = (sorted[i] - sorted[i - 1]) / (24 * 3600e3);
            if (gapDays >= (rule.silence_days ?? 14)) {
              matched = true;
              evidence = { silence_days: Math.round(gapDays) };
              break;
            }
          }
        }

        if (!matched) continue;

        // Fire signal
        const { error: sigErr } = await supabase.from('visitor_signals').insert({
          lead_id: leadId,
          signal_type: rule.type,
          signal_name: rule.name,
          score_delta: rule.score,
          reason: rule.name,
          evidence,
          rule_id: rule.id,
        });
        if (sigErr) continue;

        // Bump lead score
        const { data: leadRow } = await supabase
          .from('leads').select('score').eq('id', leadId).maybeSingle();
        const currentScore = (leadRow?.score as number) ?? 0;
        await supabase.from('leads').update({ score: currentScore + rule.score }).eq('id', leadId);
        signalsFired++;
      }
    }

    return json({ success: true, leads_evaluated: leadIds.length, signals_fired: signalsFired });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
