import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the ticket-escalation sweep must be able to compare a rule to a
 * ticket — and to write the result back.
 *
 * `public.run_ticket_escalations()` shipped in 20260708124322 and was carried
 * forward unchanged by the role-matrix sweep in 20260821010000. For that whole
 * time it aborted on the first matching ticket of ANY active rule with
 *
 *     ERROR: operator does not exist: ticket_priority = text
 *
 * so the "Escalation" tab on /admin/tickets and its "Run sweep now" button were
 * dead fleet-wide. Two type mismatches, both between the same pair of columns:
 *
 *     tickets.priority                              enum public.ticket_priority
 *     ticket_escalation_rules.action_raise_priority text
 *
 *   1. `v_ticket.priority IS DISTINCT FROM v_rule.action_raise_priority`
 *      There is no enum = text operator and no implicit cast to find one.
 *      The `IS NOT NULL` guard in front does not save it: PL/pgSQL PLANS the
 *      whole IF expression the first time the statement is REACHED, and
 *      planning is where it dies. A rule that left action_raise_priority NULL
 *      aborted exactly like one that set it.
 *
 *   2. `SET priority = v_rule.action_raise_priority`
 *      Assignment context does not coerce text INTO an enum (I/O conversion
 *      only runs when the TARGET is a string type). Nobody had ever seen this
 *      one, because #1 killed the sweep two lines earlier — it surfaced the
 *      first time the fixed function actually ran.
 *
 * Fixed in 20260823040000. The live proof lives with the function itself:
 * `public.regression_ticket_escalations()` builds a ticket and three rules,
 * runs the sweep, asserts, and rolls the lot back. This file is the half of the
 * check that runs in CI, where there is no database — it can only read the SQL,
 * so it reads the SQL, on the LATEST definition rather than a named file (a
 * later CREATE OR REPLACE is what every instance actually runs).
 */

const DIR = join(__dirname, '../../../supabase/migrations');
const FN = 'run_ticket_escalations';

/** Comments carry the words we index on ("priority ="). Strip them. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** The last CREATE OR REPLACE FUNCTION body for `name`, in filename order. */
function latestDefinition(name: string): { file: string; body: string } {
  let found: { file: string; body: string } | undefined;
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, file), 'utf8');
    const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:"?public"?\.)?"?(\w+)"?\s*\(/gi;
    const hits = [...sql.matchAll(re)];
    for (let i = 0; i < hits.length; i++) {
      if (hits[i][1].toLowerCase() !== name) continue;
      const start = hits[i].index as number;
      const end = i + 1 < hits.length ? (hits[i + 1].index as number) : sql.length;
      found = { file, body: sql.slice(start, end) };
    }
  }
  expect(found, `${name}() is not defined in any migration`).toBeTruthy();
  return found!;
}

const DEF = latestDefinition(FN);
const BODY = stripComments(DEF.body);

describe('the escalation sweep can compare a rule to a ticket', () => {
  it('compares priority to the rule as text, not as an enum', () => {
    const comparison = /v_ticket\.priority(::text)?\s+IS\s+DISTINCT\s+FROM\s+v_rule\.action_raise_priority/i;
    const m = BODY.match(comparison);
    expect(
      m,
      `${FN} (latest definition in ${DEF.file}) no longer compares the ticket's ` +
        `priority to the rule's — the guardrail is reading the wrong shape, or the ` +
        `check was dropped. Re-read the function before editing this test.`,
    ).toBeTruthy();
    expect(
      m![1],
      `${FN} (${DEF.file}) compares tickets.priority (enum ticket_priority) to ` +
        `ticket_escalation_rules.action_raise_priority (text) with no cast. There ` +
        `is no such operator, and PL/pgSQL fails at PLAN time — so this aborts for ` +
        `every active rule, including ones that leave action_raise_priority NULL. ` +
        `Write: v_ticket.priority::text IS DISTINCT FROM v_rule.action_raise_priority`,
    ).toBe('::text');
  });

  it('casts the rule value on the way into the enum column', () => {
    const assignment = /SET\s+priority\s*=\s*v_rule\.action_raise_priority(::(?:public\.)?ticket_priority)?/i;
    const m = BODY.match(assignment);
    expect(
      m,
      `${FN} (${DEF.file}) no longer assigns action_raise_priority to ` +
        `tickets.priority — re-read the function before editing this test.`,
    ).toBeTruthy();
    expect(
      m![1],
      `${FN} (${DEF.file}) writes a text value straight into tickets.priority. ` +
        `Assignment context does NOT coerce text into an enum — only out of one — ` +
        `so this raises 42804 the moment a rule actually raises a priority. ` +
        `Write: SET priority = v_rule.action_raise_priority::public.ticket_priority`,
    ).toBeTruthy();
  });

  it('one unusable rule cannot take the whole sweep down with it', () => {
    // action_raise_priority is free text, so it can hold 'kritisk' or 'P1'.
    // With the cast above, such a value raises 22P02 — and the sweep dies for
    // every OTHER rule too. That is the same failure shape this file exists to
    // prevent, so the rule has to be skipped and named, not thrown on.
    expect(
      BODY,
      `${FN} (${DEF.file}) does not validate action_raise_priority against the ` +
        `ticket_priority enum before casting it. A single mistyped rule would ` +
        `abort the sweep for all of them.`,
    ).toMatch(/pg_enum/i);
    expect(
      BODY,
      `${FN} (${DEF.file}) validates the value but does not CONTINUE past a bad ` +
        `rule — skipping it is what keeps the other rules running.`,
    ).toMatch(/\bCONTINUE\s*;/i);
    expect(
      BODY,
      `${FN} (${DEF.file}) skips bad rules silently. Report them in the result ` +
        `(invalid_rules / rules_skipped) so the operator learns which row to fix.`,
    ).toMatch(/'invalid_rules'/);
  });

  it('the live regression exists and calls the sweep with a rule present', () => {
    // PL/pgSQL plans the raise-priority statement only when it is REACHED, so a
    // regression that runs the sweep with no matching ticket sails straight past
    // the bug and reports green. The fixture ticket is load-bearing.
    const reg = latestDefinition('regression_ticket_escalations');
    const body = stripComments(reg.body);
    expect(body, 'the regression never calls the sweep').toMatch(
      /public\.run_ticket_escalations\s*\(\s*\)/i,
    );
    expect(body, 'the regression never inserts an escalation rule').toMatch(
      /INSERT\s+INTO\s+public\.ticket_escalation_rules/i,
    );
    expect(
      body,
      'the regression never inserts a ticket for the rules to match — without ' +
        'one, the failing statement is never reached and the check is vacuous',
    ).toMatch(/INSERT\s+INTO\s+public\.tickets/i);
    expect(
      body,
      'the fixture ticket must be backdated: the age filter is ' +
        '`created_at < now() - interval`, and now() is the transaction ' +
        'timestamp, so a row inserted now is never old enough to match',
    ).toMatch(/now\(\)\s*-\s*interval\s*'\d+\s*hours'/i);
    expect(
      body,
      'the regression must leave nothing behind — it ends its subtransaction ' +
        'with a deliberate raise so every fixture rolls back',
    ).toMatch(/ERRCODE\s*=\s*'ZZ001'/);
  });
});
