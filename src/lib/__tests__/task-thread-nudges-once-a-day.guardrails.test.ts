/**
 * The task thread nudges once a day — the platform keeps the cadence, not the prompt.
 *
 * The finding (optic, 2026-10-27): the task "Revisionsberättelse" carried 48
 * comments — 48 from FlowPilot, 0 from people. The same "hub blocker — who
 * owns the next step?" twice a day since 2026-09-28, once per heartbeat.
 * Across the instance: 76 FlowPilot comments in 30 days against 6 from
 * people. Peter, who reads these threads, got a wall of the same question.
 *
 * project_portfolio_brief's instructions already said "one comment per task
 * per day at most; never repeat a question that already has no answer". That
 * was prose, and the model did not follow it. So the rule now lives in
 * comment_on_task, before the insert:
 *   - ALREADY_NUDGED_TODAY — the same agent wrote on this task within 24 h;
 *   - QUESTION_STILL_OPEN  — the agent's question has no person comment after
 *     it and the task has not changed since it was asked.
 * Both are non-retryable refusals; a step or decision about the agent's own
 * work is held only to once a day; a person is never refused.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decideTaskThreadCadence,
  type CadenceVerdict,
  type ThreadAuthor,
  type ThreadComment,
} from '../../../supabase/functions/_shared/handlers/task-thread-cadence';
import { projectsModule } from '@/lib/modules/projects-module';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const NOW = new Date('2026-10-27T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const FLOWPILOT: ThreadAuthor = { author_type: 'flowpilot', author_name: 'FlowPilot' };
const PERSON: ThreadAuthor = { author_type: 'person', author_name: 'Peter' };

const fp = (kind: string, h: number): ThreadComment =>
  ({ author_type: 'flowpilot', author_name: 'FlowPilot', kind, created_at: hoursAgo(h) });
const person = (h: number): ThreadComment =>
  ({ author_type: 'person', author_name: 'Peter', kind: 'comment', created_at: hoursAgo(h) });

/** The refusal half of a verdict (the app tsconfig does not narrow on `allowed`). */
const refusal = (v: CadenceVerdict) => (v.allowed ? null : (v as Extract<CadenceVerdict, { allowed: false }>));

const RULE = 'The thread enforces one agent comment per task per day and keeps an unanswered question open — a refusal is not an error to retry.';

describe('ALREADY_NUDGED_TODAY — one agent comment per task per day', () => {
  it('refuses a second FlowPilot comment within 24 h and names when it may write again', () => {
    const v = decideTaskThreadCadence({ comments: [fp('comment', 12)], author: FLOWPILOT, kind: 'comment', taskUpdatedAt: hoursAgo(100), now: NOW });
    expect(refusal(v)?.code).toBe('ALREADY_NUDGED_TODAY');
    expect(refusal(v)?.next_comment_at).toBe(hoursAgo(-12));
    expect(refusal(v)?.hint).toContain(hoursAgo(-12));
    expect(v.last_agent_comment_at).toBe(hoursAgo(12));
  });

  it('allows it again after 24 h', () => {
    const v = decideTaskThreadCadence({ comments: [fp('comment', 25)], author: FLOWPILOT, kind: 'comment', taskUpdatedAt: hoursAgo(100), now: NOW });
    expect(v.allowed).toBe(true);
  });

  it('FlowPilot is one voice whatever name it signs with', () => {
    const renamed = { ...fp('step', 2), author_name: 'Pilot' };
    const v = decideTaskThreadCadence({ comments: [renamed], author: FLOWPILOT, kind: 'step', taskUpdatedAt: hoursAgo(100), now: NOW });
    expect(v.allowed).toBe(false);
  });

  it('another agent writing does not use up this agent’s day', () => {
    const other: ThreadComment = { author_type: 'agent', author_name: 'openclaw', kind: 'step', created_at: hoursAgo(1) };
    const v = decideTaskThreadCadence({ comments: [other], author: FLOWPILOT, kind: 'step', taskUpdatedAt: hoursAgo(100), now: NOW });
    expect(v.allowed).toBe(true);
  });
});

describe('QUESTION_STILL_OPEN — an unanswered question is not repeated', () => {
  it('refuses a new question while the last one has no answer and the task has not changed', () => {
    const v = decideTaskThreadCadence({ comments: [fp('question', 30)], author: FLOWPILOT, kind: 'question', taskUpdatedAt: hoursAgo(200), now: NOW });
    expect(refusal(v)?.code).toBe('QUESTION_STILL_OPEN');
    expect(refusal(v)?.hint).toMatch(/the question stands; wait for an answer or a change on the task/i);
    expect(v.open_question).toBe(true);
  });

  it('a nudge-comment is refused the same way', () => {
    const v = decideTaskThreadCadence({ comments: [fp('question', 30)], author: FLOWPILOT, kind: 'comment', taskUpdatedAt: hoursAgo(200), now: NOW });
    expect(refusal(v)?.code).toBe('QUESTION_STILL_OPEN');
  });

  it('a step after the question does not reopen the door to asking again', () => {
    const v = decideTaskThreadCadence({ comments: [fp('step', 26), fp('question', 50)], author: FLOWPILOT, kind: 'question', taskUpdatedAt: hoursAgo(200), now: NOW });
    expect(refusal(v)?.code).toBe('QUESTION_STILL_OPEN');
  });

  it('a person’s answer closes it', () => {
    const v = decideTaskThreadCadence({ comments: [person(28), fp('question', 30)], author: FLOWPILOT, kind: 'question', taskUpdatedAt: hoursAgo(200), now: NOW });
    expect(v.allowed).toBe(true);
    expect(v.open_question).toBe(false);
  });

  it('a change on the task since the question closes it', () => {
    const v = decideTaskThreadCadence({ comments: [fp('question', 30)], author: FLOWPILOT, kind: 'question', taskUpdatedAt: hoursAgo(5), now: NOW });
    expect(v.allowed).toBe(true);
  });
});

describe('a step or decision about the agent’s own work — once a day', () => {
  for (const kind of ['step', 'decision'] as const) {
    it(`${kind} is allowed past an open question`, () => {
      const v = decideTaskThreadCadence({ comments: [fp('question', 30)], author: FLOWPILOT, kind, taskUpdatedAt: hoursAgo(200), now: NOW });
      expect(v.allowed).toBe(true);
      expect(v.open_question).toBe(true);
    });

    it(`but a second ${kind} the same day is refused`, () => {
      const v = decideTaskThreadCadence({ comments: [fp(kind, 3)], author: FLOWPILOT, kind, taskUpdatedAt: hoursAgo(200), now: NOW });
      expect(refusal(v)?.code).toBe('ALREADY_NUDGED_TODAY');
    });
  }
});

describe('a person is never refused', () => {
  it('however busy the thread is', () => {
    const comments = [person(0.1), person(0.2), fp('question', 1)];
    for (const kind of ['comment', 'question', 'step', 'decision'] as const) {
      expect(decideTaskThreadCadence({ comments, author: PERSON, kind, taskUpdatedAt: hoursAgo(200), now: NOW }).allowed).toBe(true);
    }
  });
});

describe('the handler is the gate', () => {
  const cadence = read('supabase/functions/_shared/handlers/task-thread-cadence.ts');
  const index = read('supabase/functions/agent-execute/index.ts');
  const start = index.indexOf("handler === 'internal:comment_on_task'");
  const block = index.slice(start, index.indexOf("} else if (handler === '", start + 50));

  it('comment_on_task decides the cadence before the insert, and refuses through the envelope', () => {
    expect(start).toBeGreaterThan(0);
    const decideAt = block.indexOf('decideTaskThreadCadence({');
    const refuseAt = block.indexOf('cadenceRefusal(verdict, taskId)');
    const insertAt = block.indexOf("from('project_task_comments').insert(");
    expect(decideAt).toBeGreaterThan(0);
    expect(refuseAt).toBeGreaterThan(decideAt);
    expect(insertAt).toBeGreaterThan(refuseAt);
  });

  it('the refusal is non-retryable and carries the code and hint', () => {
    const refusal = cadence.slice(cadence.indexOf('export function cadenceRefusal'));
    expect(refusal).toMatch(/code: verdict\.code/);
    expect(refusal).toMatch(/retryable: false/);
    expect(refusal).toMatch(/hint: verdict\.hint/);
  });

  it('carries last_agent_comment_at and open_question on success too', () => {
    const success = block.slice(block.indexOf('success: true'));
    expect(success).toMatch(/last_agent_comment_at: after\.last_agent_comment_at/);
    expect(success).toMatch(/open_question: after\.open_question/);
  });

  it('the codes are part of the stable vocabulary', () => {
    const errors = read('supabase/functions/_shared/agent-errors.ts');
    expect(errors).toContain("'ALREADY_NUDGED_TODAY'");
    expect(errors).toContain("'QUESTION_STILL_OPEN'");
  });
});

describe('the skill copy states the platform’s rule', () => {
  const skills = projectsModule.skillSeeds ?? [];
  const byName = (n: string) => skills.find((s) => s.name === n);

  it('comment_on_task’s description says the thread enforces it', () => {
    expect(byName('comment_on_task')?.description).toContain(RULE);
  });

  it('project_portfolio_brief says it as the platform’s rule, not a request', () => {
    const instructions = byName('project_portfolio_brief')?.instructions ?? '';
    expect(instructions).toContain(RULE);
    expect(instructions).not.toMatch(/One comment per task per day at most/);
  });
});
