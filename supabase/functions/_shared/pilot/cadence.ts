/**
 * The objective cadence quota — measured and enforced.
 *
 * Its own module (not reason.ts) because every route by which the operator's
 * loop starts a skill has to ask it: the loop's direct call, an auto-chained
 * next action, and the built-ins that run skills on its behalf (advance_plan,
 * execute_automation, workflow_execute, chain_skills — handlers.ts, which
 * reason.ts imports). A route that skips it is a way around the quota.
 */
import { startOfBusinessDay } from '../locale/home.ts';
import { loadHomeCached } from '../locale/load-home.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** `constraints.cadence` as stored — unvalidated, so every field is read defensively. */
type Cadence = { max?: unknown; per?: unknown; every?: unknown; counts?: unknown };
/** The fields of an objective the quota reads — both untyped jsonb/text off the row. */
type CadenceSubject = { goal?: unknown; constraints?: unknown };
const cadenceOf = (o: CadenceSubject): Cadence | undefined =>
  ((o.constraints ?? undefined) as { cadence?: Cadence | null } | undefined)?.cadence ?? undefined;
type ActivityRow = { skill_name: string; created_at: string };

/**
 * Structural cadence limit for objectives that deliver on a rhythm.
 *
 * "Publish at most one post per day" written in the goal text is not binding —
 * autoversio published twice in a day under exactly that wording (2026-07-19).
 * Prose describes; only structure constrains.
 *
 * Declare it instead as `constraints.cadence`:
 *   { max: 1, per: 'day' | 'week', every?: n, counts: '<skill_name>' }
 * where `counts` is the skill whose SUCCESSFUL run is one delivery — measured
 * from agent_activity, so the quota rests on what ran, not on what was claimed.
 * Only FlowPilot's OWN runs (agent = 'flowpilot') count: the quota exists to
 * stop the operator's loop re-delivering, and a run by someone else is not that
 * loop. On liteit (2026-10-12) two write_blog_post probes over MCP — drafts,
 * deleted a minute later — filled the weekly quota and the blog stood still for
 * a week. A post a human or an external agent publishes still reaches FlowPilot
 * the honest way: it reads the blog (browse_blog, content_calendar_view) before
 * it writes.
 * `every` stretches the period: { max: 1, per: 'day', every: 3 } is one post
 * per rolling three days, { max: 1, per: 'week', every: 2 } one per fortnight.
 * Without `every`, 'day' means the current UTC day and 'week' the rolling
 * seven days — unchanged. "Var tredje dag" in prose was how autoversio came
 * to publish daily (2026-09-04): the rhythm has to live in structure.
 *
 * A satisfied objective is DROPPED FROM THE WORKING SET for this turn, not
 * failed and not completed: the loop then spends the turn on other work rather
 * than idling or re-delivering. Malformed config fails OPEN (objective stays
 * actionable) — a config typo must never silence the operator.
 */
export async function partitionByCadence<T extends CadenceSubject>(
  // unknown, not SupabaseClient: callers hand in the service client or a test
  // stub; only .from(...).select().in().eq().eq().gte() is used.
  supabase: unknown,
  objectives: T[],
): Promise<{ actionable: Array<T & { _cadence_left?: number }>; satisfied: Array<{ goal: string; note: string }> }> {
  const withCadence = objectives.filter((o) => {
    const c = cadenceOf(o);
    return c && typeof c.counts === 'string' && Number(c.max) > 0;
  });
  if (!withCadence.length) return { actionable: objectives, satisfied: [] };

  const skills = [...new Set(withCadence.map((o) => String(cadenceOf(o)?.counts)))];
  // "One post a day" is the business's day — on the UTC day, a post at 00:30
  // in Stockholm counted toward yesterday's quota.
  const dayStart = startOfBusinessDay((await loadHomeCached(supabase)).timeZone);
  const weekStart = new Date(Date.now() - 7 * 86_400_000);
  const windowStartOf = (c: Cadence): Date => {
    const every = Number(c.every) > 1 ? Math.floor(Number(c.every)) : 1;
    if (every === 1) return c.per === 'week' ? weekStart : dayStart;
    const days = (c.per === 'week' ? 7 : 1) * every;
    return new Date(Date.now() - days * 86_400_000);
  };
  const earliest = Math.min(...withCadence.map((o) => windowStartOf(cadenceOf(o) ?? {}).getTime()));
  const since = new Date(earliest).toISOString();

  const { data: acts, error: actsError } = await (supabase as SupabaseClient)
    .from('agent_activity')
    .select('skill_name, status, created_at')
    .in('skill_name', skills)
    .eq('agent', 'flowpilot')
    .eq('status', 'success')
    .gte('created_at', since);
  // An unreadable journal fails OPEN, like malformed config: no count, no limit.
  if (actsError) {
    console.warn(`[cadence] agent_activity read failed — quota not applied: ${actsError.message ?? actsError}`);
    return { actionable: objectives, satisfied: [] };
  }

  const actionable: Array<T & { _cadence_left?: number }> = [];
  const satisfied: Array<{ goal: string; note: string }> = [];

  for (const o of objectives) {
    const c = cadenceOf(o);
    if (!c || typeof c.counts !== 'string' || !(Number(c.max) > 0)) {
      actionable.push(o);
      continue;
    }
    const windowStart = windowStartOf(c);
    const done = ((acts ?? []) as unknown as ActivityRow[]).filter(
      (a) => a.skill_name === c.counts && new Date(a.created_at) >= windowStart,
    ).length;

    if (done >= Number(c.max)) {
      const every = Number(c.every) > 1 ? Math.floor(Number(c.every)) : 1;
      const unit = c.per === 'week' ? 'week' : 'day';
      const period = every === 1 ? unit : `${every} ${unit}s`;
      satisfied.push({
        goal: String(o.goal ?? '').split('\n')[0].slice(0, 60),
        note: `${done}/${c.max} per ${period} via ${c.counts} — done for this period`,
      });
    } else {
      actionable.push({ ...o, _cadence_left: Number(c.max) - done });
    }
  }
  return { actionable, satisfied };
}

/**
 * The cadence quota enforced where the skill runs, not only where the prompt is
 * written.
 *
 * partitionByCadence drops a satisfied objective from the PROMPT — but the
 * model can read it straight back: liteit's heartbeat called list_objectives,
 * saw "publish one post per week" active, and published on 10-18, 19, 22, 23,
 * 24 and 28 (2026-10-28) with every one of those runs stamped agent=flowpilot.
 * A prompt describes; only the call site constrains.
 *
 * Refuses `skillName` when at least one active objective counts it in
 * `constraints.cadence` and EVERY such objective has met its quota for the
 * period. One objective with room left is enough to let the call through.
 * Any read failure fails OPEN, like partitionByCadence.
 */
type CadenceObjective = { id: string; goal: string; constraints?: { cadence?: { counts?: unknown; max?: unknown } } | null };

export async function cadenceRefusal(
  supabase: Parameters<typeof partitionByCadence>[0],
  skillName: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await (supabase as SupabaseClient)
      .from('agent_objectives')
      .select('id, goal, constraints')
      .eq('status', 'active');
    if (error || !data?.length) return null;
    const counting = (data as CadenceObjective[]).filter((o) => {
      const c = cadenceOf(o);
      return c && c.counts === skillName && Number(c.max) > 0;
    });
    if (!counting.length) return null;
    const { actionable, satisfied } = await partitionByCadence(supabase, counting);
    if (actionable.length) return null;
    return {
      error: `${skillName} is not run again this period: every objective that delivers through it has met its cadence (${satisfied.map((s) => `"${s.goal}" ${s.note}`).join('; ')}).`,
      code: 'CADENCE_SATISFIED',
      retryable: false,
      hint: 'The delivery for this period already exists. Do not retry or route around it through another skill; spend the turn on other work, or reply NO_REPLY.',
      status: 'cadence_satisfied',
    };
  } catch {
    return null;
  }
}
