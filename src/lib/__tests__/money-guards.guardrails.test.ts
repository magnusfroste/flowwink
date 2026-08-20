import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Four money leaks found by driving returns, approvals and expenses end-to-end
 * through the skill surface. Every one of them was a guard that existed, ran,
 * and let the money through anyway — which is why these are pinned by text:
 * the shapes below are the exact shapes that failed.
 *
 *  - refund_return's ceiling was skipped whenever the RMA had no priced lines
 *    (`v_expected > 0 AND ...`). 149 999,99 kr went out on a 499 kr order.
 *  - manage_approvals read neither required_role nor requested_by, so the
 *    approval step was a self-serve button and the audit columns stayed NULL.
 *  - manage_expenses booked an expense on "the first admin found" when the
 *    caller passed no user_id — a reimbursement to the wrong person.
 *  - manage_return_item let a refunded RMA's lines be rewritten after payout.
 */

const repoRoot = resolve(__dirname, '../../..');
const agentExecute = readFileSync(
  resolve(repoRoot, 'supabase/functions/agent-execute/index.ts'),
  'utf-8',
);

const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(resolve(migrationsDir, f), 'utf-8'))
  .join('\n');

/** The last CREATE OR REPLACE of a function across the whole migration series. */
function latestFunctionBody(fnName: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const start = migrationSql.lastIndexOf(marker);
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const end = migrationSql.indexOf('$function$;', start);
  return migrationSql.slice(start, end === -1 ? start + 8000 : end);
}

describe('a refund needs something to refund against', () => {
  const body = latestFunctionBody('refund_return');

  it('rejects an RMA with no return lines instead of treating it as unlimited', () => {
    expect(body).toMatch(/v_line_count = 0/);
    expect(body).toMatch(/has no return lines/i);
    expect(body).toMatch(/manage_return_item/);
  });

  it('rejects lines that carry no price — same hole, different shape', () => {
    expect(body).toMatch(/v_gross <= 0/);
    expect(body).toMatch(/unit_refund_cents/);
  });

  it('never brings back the guard that switched itself off at zero', () => {
    expect(body).not.toMatch(/v_expected > 0 AND v_new_total > v_expected/);
  });

  it('applies the ceiling to every call that moves money, p_final included', () => {
    expect(body).toMatch(/IF p_refund_cents > 0 AND v_new_total > v_expected THEN/);
  });

  it('lets p_final close an RMA administratively without a payout', () => {
    // p_final is decided before the ceiling check, and a zero-cent final call
    // is the documented way out of an RMA stranded past its expected total.
    expect(body).toMatch(/v_done := p_final OR v_new_total >= v_expected/);
    expect(body).toMatch(/p_refund_cents = 0 AND NOT p_final/);
  });

  it('keeps the accumulating partial-refund behaviour QA verified as correct', () => {
    expect(body).toMatch(/v_new_total := v_already \+ p_refund_cents/);
  });
});

describe('a restocking fee cannot strand a part-paid RMA', () => {
  const body = latestFunctionBody('inspect_return');

  it('refuses a fee that puts the expected total below what was already refunded', () => {
    expect(body).toMatch(/v_gross - p_restocking_fee_cents < v_already/);
    expect(body).toMatch(/already refunded/i);
  });

  it('names both numbers so the operator can pick which one to move', () => {
    expect(body).toMatch(/p_restocking_fee_cents,[\s\S]{0,400}v_already/);
  });

  it('keeps the service_role escape so the gateway still works', () => {
    expect(body).toMatch(/auth\.role\(\) = 'service_role' OR has_role\(auth\.uid\(\), 'admin'\)/);
  });
});

describe('an expense report moves its lines and its total', () => {
  const submit = latestFunctionBody('submit_expense_report');
  const approve = latestFunctionBody('approve_expense_report');

  it('submit requires the owner or an admin, with the service_role escape', () => {
    expect(submit).toMatch(/auth\.role\(\) = 'service_role'/);
    expect(submit).toMatch(/v_report\.user_id = auth\.uid\(\)/);
    expect(submit).toMatch(/has_role\(auth\.uid\(\), 'admin'\)/);
  });

  it('submit locks the expenses and recomputes the total', () => {
    expect(submit).toMatch(/UPDATE expenses[\s\S]{0,120}status = 'submitted'/);
    expect(submit).toMatch(/SUM\(amount_cents\)/);
    expect(submit).toMatch(/total_cents = v_total/);
  });

  it('approve marks the expenses approved rather than only the header', () => {
    expect(approve).toMatch(/UPDATE expenses[\s\S]{0,120}status = 'approved'/);
    expect(approve).toMatch(/total_cents = v_total/);
  });
});

describe('approval is a second pair of eyes, not a button', () => {
  const start = agentExecute.indexOf('async function executeApprovalsAction');
  const body = agentExecute.slice(start, agentExecute.indexOf('async function executePagesAction', start));

  it('reads the request before deciding it', () => {
    expect(body).toMatch(/\.select\('id, status, required_role, requested_by, entity_type, entity_id'\)/);
  });

  it('refuses self-approval', () => {
    expect(body).toMatch(/reqRow\.requested_by === callerUserId/);
    expect(body).toMatch(/self-approval is not allowed/);
  });

  it('requires the role the request demands (admin overrides)', () => {
    expect(body).toMatch(/callerRoles\.includes\(reqRow\.required_role\)/);
    expect(body).toMatch(/callerRoles\.includes\('admin'\)/);
  });

  it('stamps requested_by on create and resolved_by on the decision', () => {
    expect(body).toMatch(/requested_by: requestedBy/);
    expect(body).toMatch(/resolved_by: callerUserId/);
  });

  it('still lets a service-key call decide, but says so out loud', () => {
    expect(body).toMatch(/service-role decision/);
  });

  it('never resolves with only a status and a timestamp again', () => {
    expect(body).not.toMatch(/\.update\(\{ status, resolved_at: new Date\(\)\.toISOString\(\) \}\)/);
  });
});

describe('an expense is booked on a person, never on a stand-in', () => {
  const start = agentExecute.indexOf("case 'expenses': {");
  const body = agentExecute.slice(start, start + 6000);

  it('uses the authenticated caller when no user_id was passed', () => {
    expect(body).toMatch(/if \(!user_id\) user_id = \(args as any\)\._caller_user_id;/);
  });

  it('fails honestly instead of picking the first admin', () => {
    expect(body).toMatch(/No user identity for this expense/);
    expect(body).not.toMatch(/eq\('role', 'admin'\)\.limit\(1\)\.maybeSingle\(\)/);
  });
});

describe('refunded return lines are a receipt, not a draft', () => {
  it('blocks update/delete on lines whose return is already refunded', () => {
    expect(agentExecute).toMatch(
      /table === 'return_items' && \(action === 'update' \|\| action === 'delete'\)/,
    );
    expect(agentExecute).toMatch(/parentReturn\?\.status === 'refunded'/);
    expect(agentExecute).toMatch(/already refunded — its lines are the record/);
  });
});
