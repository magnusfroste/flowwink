import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  declaredWorkDone,
  isIdleScheduledRun,
  WORK_DONE_KEY,
} from '../../../supabase/functions/_shared/activity/work-done.ts';

/**
 * ONE ROW PER EMPTY MINUTE.
 *
 * Old liteit (cdwpqcevbcbqxhycsqhm) carried 18 138 agent_activity rows. ~14 800
 * of them were four scheduled skills reporting nothing on an instance with zero
 * consultants, zero leads and zero social posts: {"processed":0}, [],
 * {"swept":0,"message":"No unqualified leads."},
 * {"signals_fired":0,"leads_evaluated":0}. New liteit, on performance mode
 * "low", still wrote ~72 rows a day EACH for five of them. The journal had
 * stopped recording what the operator did and started recording the clock.
 *
 * THE FIX IS A CONTRACT, NOT A SNIFFER. A run is idle when it SAYS so — a
 * top-level `work_done` integer equal to 0. Nothing parses messages, counts
 * array lengths, or knows any skill's name; a handler that hasn't adopted the
 * contract reports UNKNOWN and keeps its row. That is the same discipline as
 * Law 1 (no hardcoded routing) and "discover, don't enumerate": the day someone
 * adds a sweep, it quiets down by declaring a number, not by being added to a
 * list in the executor.
 *
 * WHAT MUST SURVIVE: failures, anything a human or an agent asked for, and the
 * fact that a schedule is alive at all (agent_automations.last_triggered_at /
 * run_count, plus the new last_work_at / idle_run_count).
 */

const read = (p: string) => readFileSync(resolve(__dirname, '../../../', p), 'utf-8');

const agentExecute = read('supabase/functions/agent-execute/index.ts');
const dispatcher = read('supabase/functions/automation-dispatcher/index.ts');
const contract = read('supabase/functions/_shared/activity/work-done.ts');

describe('the work-done contract reads a declared number and nothing else', () => {
  it('reads the declared count', () => {
    expect(declaredWorkDone({ work_done: 0 })).toBe(0);
    expect(declaredWorkDone({ work_done: 7 })).toBe(7);
    expect(WORK_DONE_KEY).toBe('work_done');
  });

  it('undeclared is UNKNOWN (null), never "did nothing"', () => {
    // Every one of these is a real no-op payload from the incident. Without the
    // declared key they must stay unknown — the row is the fallback, not the
    // exception.
    expect(declaredWorkDone({ processed: 0 })).toBeNull();
    expect(declaredWorkDone({ swept: 0, message: 'No unqualified leads.' })).toBeNull();
    expect(declaredWorkDone({ signals_fired: 0, leads_evaluated: 0 })).toBeNull();
    expect(declaredWorkDone([])).toBeNull();
    expect(declaredWorkDone(null)).toBeNull();
    expect(declaredWorkDone('nothing to do')).toBeNull();
  });

  it('rejects junk in the declared slot instead of coercing it', () => {
    expect(declaredWorkDone({ work_done: '0' })).toBeNull();
    expect(declaredWorkDone({ work_done: -1 })).toBeNull();
    expect(declaredWorkDone({ work_done: Number.NaN })).toBeNull();
  });

  it('suppresses ONLY an unattended, successful, declared-zero run', () => {
    const idle = { work_done: 0 };
    expect(isIdleScheduledRun(idle, { scheduled: true, failed: false })).toBe(true);

    // A human or an agent asked for it → they get their receipt.
    expect(isIdleScheduledRun(idle, { scheduled: false, failed: false })).toBe(false);
    // A failure always earns a row. That is the point of keeping one.
    expect(isIdleScheduledRun(idle, { scheduled: true, failed: true })).toBe(false);
    // Work happened.
    expect(isIdleScheduledRun({ work_done: 1 }, { scheduled: true, failed: false })).toBe(false);
    // Undeclared → unknown → row.
    expect(isIdleScheduledRun({ processed: 0 }, { scheduled: true, failed: false })).toBe(false);
  });

  it('never grows a name list or a message matcher', () => {
    // If this fails, someone taught the contract about a specific skill or
    // started reading prose. Fix the handler's declaration instead.
    // Comments stripped: the docblock names the incident's skills on purpose —
    // it is the CODE that must not know them.
    const code = contract
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/qualify_lead|reindex_consultants|score_visitor_intent|sla_check/);
    expect(code).not.toMatch(/\.length === 0|No unqualified|includes\(/);
  });
});

describe('agent-execute suppresses the row at the one place it writes it', () => {
  it('imports the contract rather than re-deciding locally', () => {
    expect(agentExecute).toMatch(
      /import \{ isIdleScheduledRun, declaredWorkDone \} from '\.\.\/_shared\/activity\/work-done\.ts'/,
    );
  });

  it('only a caller that DECLARED the run scheduled can suppress anything', () => {
    // `scheduled` is an explicit request field, not inferred from agent_type:
    // a flowpilot-executor automation and a FlowPilot chat turn carry the same
    // tag, and only one of them is unattended.
    expect(agentExecute).toMatch(/scheduled\?: boolean;/);
    expect(agentExecute).toMatch(/agent_type, conversation_id, scheduled, objective_context/);
    expect(agentExecute).toMatch(/scheduled: scheduled === true,/);
    expect(agentExecute).toMatch(/failed: handlerFailed,/);
  });

  it('gates the insert on the contract', () => {
    expect(agentExecute).toMatch(/const activityId = idleTick \? null : await logActivity\(supabase, \{/);
  });

  it('tells the caller what it decided, without breaking the envelope', () => {
    // The envelope guardrail (agent-execute-envelope) owns the status prefix;
    // these two fields ride behind trust_level so the dispatcher can record
    // last_work_at without a second round trip.
    expect(agentExecute).toMatch(
      /status: handlerFailed \? 'failed' : 'success', result, trust_level: trustLevel, work_done: workDone, activity_logged: !idleTick/,
    );
  });
});

describe('the dispatcher keeps "it ran" on the automation row', () => {
  it('declares its runs scheduled', () => {
    expect(dispatcher).toMatch(/scheduled: true,/);
  });

  it('records work markers without ever dropping last_triggered_at / run_count', () => {
    expect(dispatcher).toMatch(/meta\.last_work_at = now;/);
    expect(dispatcher).toMatch(/meta\.idle_run_count = 0;/);
    expect(dispatcher).toMatch(/last_triggered_at: now,/);
    expect(dispatcher).toMatch(/run_count: \(auto\.run_count \|\| 0\) \+ 1,/);
  });

  it('falls back when the instance has not migrated yet (Law 4)', () => {
    // A fork that deployed the function before the migration has no
    // last_work_at column. Without the retry the WHOLE update is rejected and
    // every automation reads stale — the loudest possible regression from the
    // quietest possible change.
    expect(dispatcher).toMatch(/retrying without work markers/);
  });

  it('never treats an undeclared result as idle', () => {
    expect(dispatcher).toMatch(/typeof executeResult\.work_done === "number"/);
  });
});

describe('the sweeps named in the incident declare their count', () => {
  const cases: Array<[string, string]> = [
    ['supabase/functions/_shared/handlers/qualify-lead.ts', 'qualify_lead'],
    ['supabase/functions/_shared/handlers/social-publish.ts', 'process_due_social_posts'],
    ['supabase/functions/consultant-match/index.ts', 'reindex_consultants'],
    ['supabase/functions/score-visitor-intent/index.ts', 'score_visitor_intent'],
    ['supabase/functions/comms-send/webinar_reminders.ts', 'send_webinar_reminders'],
  ];

  it.each(cases)('%s declares work_done (%s)', (path) => {
    expect(read(path)).toMatch(/work_done/);
  });

  it('qualify_lead reports 0 on the empty sweep and n when it qualified n', () => {
    const src = read('supabase/functions/_shared/handlers/qualify-lead.ts');
    expect(src).toMatch(/swept: 0, work_done: 0, message: 'No unqualified leads\.'/);
    expect(src).toMatch(/swept: results\.length, work_done: results\.length/);
  });

  it('the social sweep returns an OBJECT — an array cannot carry the contract', () => {
    const src = read('supabase/functions/_shared/handlers/social-publish.ts');
    expect(src).toMatch(/Promise<SocialSweepReport>/);
    expect(src).toMatch(/return \{ work_done: 0, processed: \[\] \};/);
    expect(src).not.toMatch(/return \[\];/);
    // The seed has to teach the new shape or every agent reading the old one
    // silently gets undefined.
    expect(read('src/lib/modules/growth-module.ts')).toMatch(/read the list from `processed`/);
  });

  it('score_visitor_intent counts signals FIRED, not leads looked at', () => {
    expect(read('supabase/functions/score-visitor-intent/index.ts')).toMatch(
      /work_done: signalsFired/,
    );
  });
});

describe('the SQL side ships with it', () => {
  const migrations = readdirSync(resolve(__dirname, '../../../supabase/migrations'));
  const file = migrations.find((f) => f.includes('tomma-tick-lamnar-ingen-journalrad'));
  const sql = file ? read(`supabase/migrations/${file}`) : '';

  it('the migration exists and is forward-dated past the current HEAD', () => {
    expect(file).toBeTruthy();
    // Below the managed ledger's HEAD a migration is silently skipped — the
    // drift class this repo has been bitten by repeatedly.
    const others = migrations.filter((f) => /^\d{14}_/.test(f) && f !== file).sort();
    expect(file!.slice(0, 14) > others[others.length - 1].slice(0, 14)).toBe(true);
  });

  it('adds both markers idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS last_work_at timestamptz/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS idle_run_count integer NOT NULL DEFAULT 0/);
  });

  it('run_sla_sweep declares work_done — replaced whole, as CREATE OR REPLACE requires', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.run_sla_sweep/);
    expect(sql).toMatch(/'work_done', v_work,/);
    // Counted from what was WRITTEN. policies_checked is not work: a sweep that
    // read 40 policies and touched nothing changed nothing.
    expect(sql).toMatch(/SELECT jsonb_array_length\(v_fresh\)/);
    expect(sql).not.toMatch(/'work_done', v_policies_checked/);
  });
});
