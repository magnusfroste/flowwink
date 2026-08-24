import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the ticket-escalation sweep must never compare an enum column
 * against a rule's raw text field.
 *
 * `run_ticket_escalations()` shipped in 20260708124322 and never moved a single
 * ticket until 20260823053000 fixed it — six weeks of an "Escalation" tab whose
 * "Run sweep now" button aborted with
 *
 *     ERROR: operator does not exist: ticket_priority = text
 *
 * on the first matching ticket of ANY active rule. The two sides were never the
 * same type: `tickets.priority` is the enum `ticket_priority`, while
 * `ticket_escalation_rules.action_raise_priority` (and `match_priority`,
 * `match_status`) are `text`. PL/pgSQL PLANS the whole IF expression the first
 * time the statement is REACHED, and planning is where it dies — so the
 * `IS NOT NULL` guard in front saved nothing, and a rule that left the column
 * NULL aborted exactly like one that set it.
 *
 * This file pins the INVARIANT, not one implementation of it. The current body
 * validates each text field against `pg_enum` and casts it into a typed local
 * once per rule; an explicit `::` cast at the comparison would satisfy the same
 * rule. Either is fine. Comparing the column straight against `v_rule.<text>`
 * is not, and that is what these arms reject.
 *
 * Read the LATEST definition across all migrations rather than a named file: a
 * later CREATE OR REPLACE is what every instance actually runs, so pinning a
 * filename would certify a body nobody executes.
 *
 * The live half of the check is `public.regression_ticket_escalations()`
 * (20260828130000), which builds a ticket and three rules, runs the sweep,
 * asserts, and rolls it all back. This file is the half that runs in CI, where
 * there is no database.
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

/** The rule columns that are `text` and describe an enum value. */
const TEXT_RULE_FIELDS = ['match_status', 'match_priority', 'action_raise_priority'];

describe('the escalation sweep never compares an enum column to a text rule field', () => {
  it('no enum column is compared straight against v_rule.<text field>', () => {
    // `t.status = v_rule.match_status` / `v_ticket.priority IS DISTINCT FROM
    // v_rule.action_raise_priority` — the exact shape that fails at plan time.
    // A typed local (v_match_status) or an explicit ::cast both read clean here.
    const bad = new RegExp(
      String.raw`\b(?:priority|status)\s*(?:=|<>|!=|IS\s+DISTINCT\s+FROM|IS\s+NOT\s+DISTINCT\s+FROM)\s*v_rule\.\w+`,
      'gi',
    );
    const hits = [...BODY.matchAll(bad)].map((m) => m[0].replace(/\s+/g, ' '));
    expect(
      hits,
      `${FN} (latest definition in ${DEF.file}) compares an enum column directly ` +
        `against a text column on ticket_escalation_rules. There is no ` +
        `enum = text operator, and PL/pgSQL fails at PLAN time — so this aborts ` +
        `the whole sweep for every active rule, including ones where the field ` +
        `is NULL. Validate the label against pg_enum and cast it into a typed ` +
        `local first, or cast at the comparison.`,
    ).toEqual([]);
  });

  it('no raw text field is written into the priority enum column', () => {
    // Assignment context does NOT coerce text into an enum — I/O conversion
    // only runs when the TARGET is a string type. This raises 42804, and it is
    // reachable the moment a rule actually raises a priority.
    const bad = new RegExp(
      String.raw`SET\s+priority\s*=\s*v_rule\.\w+(?!\s*::)`,
      'gi',
    );
    const hits = [...BODY.matchAll(bad)].map((m) => m[0].replace(/\s+/g, ' '));
    expect(
      hits,
      `${FN} (${DEF.file}) writes a rule's text value straight into ` +
        `tickets.priority. Assign a typed local, or cast explicitly.`,
    ).toEqual([]);
  });

  it('every text rule field is validated against the enum before it is used', () => {
    expect(
      BODY,
      `${FN} (${DEF.file}) does not check its text fields against pg_enum. ` +
        `They are free text, so they can hold 'kritisk' or 'P1'; unvalidated, ` +
        `such a value fails the cast and takes the sweep down.`,
    ).toMatch(/pg_enum/i);
    for (const field of TEXT_RULE_FIELDS) {
      expect(
        BODY,
        `${FN} (${DEF.file}) never reads v_rule.${field} — the guardrail is ` +
          `reading the wrong shape, or the field was dropped. Re-read the ` +
          `function before editing this test.`,
      ).toContain(`v_rule.${field}`);
    }
  });

  it('one unusable rule cannot take the whole sweep down with it', () => {
    expect(
      BODY,
      `${FN} (${DEF.file}) validates its labels but does not CONTINUE past a ` +
        `bad rule — skipping it is what keeps the other rules running.`,
    ).toMatch(/\bCONTINUE\s*;/i);
    expect(
      BODY,
      `${FN} (${DEF.file}) skips bad rules silently. Report them in the result ` +
        `so the operator learns which row to fix.`,
    ).toMatch(/'skipped_rules'/);
  });

  it('the live regression calls the sweep with BOTH a rule and a matching ticket', () => {
    // The load-bearing detail. PL/pgSQL plans the failing statement only when it
    // is REACHED, so a regression that sweeps with rules but no matching ticket
    // sails straight past the bug and reports green.
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
