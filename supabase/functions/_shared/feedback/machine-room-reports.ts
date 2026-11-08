/**
 * The machine room reports upstream — the Daily Briefing does not.
 *
 * The briefing says how the business is doing, to the people who run it. A
 * failing pg_cron job is not theirs to fix: Synclair's admins were told every
 * morning "3 scheduled jobs unhealthy (per job_run_details)" (2026-11-08). The
 * finding stays on /admin/system → Observability, and what is the platform's
 * fault goes to the people who can fix it: the daily feedback_ping files it on
 * the endpoint's board through submit_feedback, so the cadence (one report per
 * defect per instance in 14 days, three a day) and feedback.share_usage hold.
 *
 * Titles name the defect and never the instance: the board clusters equal
 * titles across the fleet. Bodies carry no error text — a skill's message can
 * quote a customer's data, a job's target host names another instance.
 */
import { classifyAgentError } from '../agent-errors.ts';
import { enrichCronHealth, loadInstanceBornAt, type CronHealthReport } from '../cron/health.ts';

/** One failure is an agent's bad day; this many in 24 hours is a defect. */
export const SKILL_FAILURES_TO_REPORT = 3;

export interface MachineRoomInput {
  jobs: Array<{ jobname: string; reasons: string[]; last_status: string | null; last_run: string | null }>;
  pulse: { starving: boolean; starved_hours_24h?: number };
  failures: Array<{ skill_name: string | null; error_message: string | null }>;
}

export interface MachineRoomReport { title: string; body: string }

export function machineRoomReports(input: MachineRoomInput): MachineRoomReport[] {
  // A throttled database fails everything; the rest are symptoms of this one.
  if (input.pulse.starving) {
    return [{
      title: 'Database pulse starving on an instance',
      body: `The database was throttled for ${input.pulse.starved_hours_24h ?? 'some'} of the last 24 hours (cron.job_run_details).`,
    }];
  }

  const jobs = input.jobs.map((j) => ({
    title: `Scheduled job unhealthy: ${j.jobname}`,
    body: [
      j.reasons.join('; ').replace(/foreign host \([^)]*\)/g, 'foreign host'),
      `Last status: ${j.last_status ?? 'none'}. Last run: ${j.last_run ?? 'never'}. Source: cron.job_run_details.`,
    ].join('\n'),
  }));

  // Only what the classifier cannot lay on the caller: a bad argument, a
  // closed period or a refused permission is not the platform's defect.
  const counts = new Map<string, number>();
  for (const f of input.failures) {
    if (!f.skill_name || classifyAgentError(f.error_message).code !== 'HANDLER_ERROR') continue;
    counts.set(f.skill_name, (counts.get(f.skill_name) ?? 0) + 1);
  }
  const skills = [...counts]
    .filter(([, n]) => n >= SKILL_FAILURES_TO_REPORT)
    .sort((a, b) => b[1] - a[1])
    .map(([skill, n]) => ({
      title: `Skill failing: ${skill}`,
      body: `${n} failed executions in the last 24 hours (HANDLER_ERROR, agent_activity).`,
    }));

  return [...jobs, ...skills];
}

export async function fileMachineRoomReports(
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  submit: (args: { board: 'bug'; title: string; body: string }) => Promise<unknown>,
): Promise<{ filed: number; already_reported: number }> {
  const out = { filed: 0, already_reported: 0 };
  // The ping is the point of the call: nothing here may cost it.
  try {
    const { data: cron, error: cronErr } = await supabase.rpc('cron_health_report');
    const enriched = !cronErr && cron?.cron_available
      ? enrichCronHealth(cron as CronHealthReport, new Date(), { bornAt: await loadInstanceBornAt(supabase) })
      : null;
    const { data: failures, error: failuresErr } = await supabase.from('agent_activity')
      .select('skill_name, error_message')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .limit(500);
    if (failuresErr) throw new Error(`agent_activity read failed: ${failuresErr.message}`);

    const reports = machineRoomReports({
      jobs: (enriched?.jobs ?? []).filter((j) => j.red),
      pulse: enriched?.pulse ?? { starving: false },
      failures: failures ?? [],
    });
    // Not sliced to the cap: a report already on the board does not spend it,
    // so the fourth defect still gets its turn while the first three wait.
    for (const r of reports) {
      const answer = await submit({ board: 'bug', ...r }) as { code?: string };
      if (answer?.code === 'FEEDBACK_DAILY_CAP') break;
      if (answer?.code === 'ALREADY_REPORTED') out.already_reported++;
      else out.filed++;
    }
  } catch (e) {
    console.warn('[feedback_ping] machine-room reports skipped (non-fatal):', e instanceof Error ? e.message : String(e));
  }
  return out;
}
