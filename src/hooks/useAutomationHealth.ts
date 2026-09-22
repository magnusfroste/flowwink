/**
 * useAutomationHealth
 * 
 * Aggregates automation + activity data into health metrics
 * with 7-day historical sparkline data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, startOfDay, format } from 'date-fns';

export interface AutomationHealthItem {
  id: string;
  name: string;
  skillName: string | null;
  triggerType: string;
  enabled: boolean;
  runCount: number;
  lastTriggeredAt: string | null;
  lastError: string | null;
  /**
   * Per-day counts of LOGGED runs for the past 7 days.
   *
   * A scheduled tick that declared it did nothing (work_done: 0) writes no
   * agent_activity row any more, so this counts runs that did work or failed —
   * not every tick. "It ran at all" lives on the automation row
   * (lastTriggeredAt / runCount) and health below is derived from there, so an
   * idle-but-healthy automation still reads healthy with a flat sparkline.
   */
  dailyRuns: number[];
  /** Per-day error counts for the past 7 days */
  dailyErrors: number[];
  /** Overall error rate 0-1 */
  errorRate: number;
  /** Status derived from health signals */
  health: 'healthy' | 'warning' | 'error' | 'stale' | 'disabled';
}

export interface AutomationHealthSummary {
  total: number;
  enabled: number;
  healthy: number;
  warning: number;
  erroring: number;
  stale: number;
  totalRuns7d: number;
  totalErrors7d: number;
  overallErrorRate: number;
  items: AutomationHealthItem[];
}

async function fetchAutomationHealth(): Promise<AutomationHealthSummary> {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  // Fetch automations and recent activity in parallel
  const [automationsRes, activityRes] = await Promise.all([
    supabase
      .from('agent_automations')
      .select('id, name, skill_name, trigger_type, enabled, run_count, last_triggered_at, last_error')
      .order('created_at', { ascending: false }),
    supabase
      .from('agent_activity')
      .select('skill_name, status, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true }),
  ]);

  const automations = automationsRes.data || [];
  const activities = activityRes.data || [];

  // Build day labels for sparkline
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    dayKeys.push(format(subDays(now, i), 'yyyy-MM-dd'));
  }

  // Group activity by skill_name + day
  const activityMap = new Map<string, { runs: Map<string, number>; errors: Map<string, number> }>();
  for (const a of activities) {
    const skill = a.skill_name || '';
    if (!activityMap.has(skill)) {
      activityMap.set(skill, { runs: new Map(), errors: new Map() });
    }
    const entry = activityMap.get(skill)!;
    const day = format(new Date(a.created_at), 'yyyy-MM-dd');
    entry.runs.set(day, (entry.runs.get(day) || 0) + 1);
    if (a.status === 'failed') {
      entry.errors.set(day, (entry.errors.get(day) || 0) + 1);
    }
  }

  let totalRuns7d = 0;
  let totalErrors7d = 0;

  const items: AutomationHealthItem[] = automations.map((auto: any) => {
    const skillData = activityMap.get(auto.skill_name || '') || { runs: new Map(), errors: new Map() };
    
    const dailyRuns = dayKeys.map(d => skillData.runs.get(d) || 0);
    const dailyErrors = dayKeys.map(d => skillData.errors.get(d) || 0);
    
    const runs7d = dailyRuns.reduce((s, v) => s + v, 0);
    const errors7d = dailyErrors.reduce((s, v) => s + v, 0);
    totalRuns7d += runs7d;
    totalErrors7d += errors7d;

    const errorRate = runs7d > 0 ? errors7d / runs7d : 0;

    // Determine health
    let health: AutomationHealthItem['health'] = 'healthy';
    if (!auto.enabled) {
      health = 'disabled';
    } else if (errorRate > 0.5) {
      health = 'error';
    } else if (errorRate > 0.1 || auto.last_error) {
      health = 'warning';
    } else if (auto.trigger_type === 'cron' && auto.last_triggered_at) {
      const lastRun = new Date(auto.last_triggered_at);
      const hoursSince = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 48) health = 'stale';
    } else if (auto.trigger_type === 'cron' && !auto.last_triggered_at && auto.run_count === 0) {
      health = 'stale';
    }

    return {
      id: auto.id,
      name: auto.name,
      skillName: auto.skill_name,
      triggerType: auto.trigger_type,
      enabled: auto.enabled,
      runCount: auto.run_count,
      lastTriggeredAt: auto.last_triggered_at,
      lastError: auto.last_error,
      dailyRuns,
      dailyErrors,
      errorRate,
      health,
    };
  });

  const enabled = items.filter(i => i.enabled).length;
  const healthy = items.filter(i => i.health === 'healthy').length;
  const warning = items.filter(i => i.health === 'warning').length;
  const erroring = items.filter(i => i.health === 'error').length;
  const stale = items.filter(i => i.health === 'stale').length;

  return {
    total: items.length,
    enabled,
    healthy,
    warning,
    erroring,
    stale,
    totalRuns7d,
    totalErrors7d,
    overallErrorRate: totalRuns7d > 0 ? totalErrors7d / totalRuns7d : 0,
    items,
  };
}

export function useAutomationHealth() {
  return useQuery({
    queryKey: ['automation-health'],
    queryFn: fetchAutomationHealth,
    refetchInterval: 30_000,
  });
}
