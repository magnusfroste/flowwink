#!/usr/bin/env tsx
/**
 * Timesheet → Invoice Regression Runner
 * =====================================
 *
 * End-to-end probe of the billing pipeline:
 *   log_time → timesheet_summary → bulk_invoice_from_timesheets
 *
 * Each step is executed against the deployed `agent-execute` edge function
 * exactly as an MCP client would call it. Reports per-step status with a
 * clear reason for any blockage so you can tell hard regressions apart from
 * expected RLS gates.
 *
 * Env:
 *   SUPABASE_URL         (default: hardcoded project URL)
 *   SUPABASE_ANON_KEY    fallback bearer for unauthenticated calls
 *   MCP_ADMIN_JWT        admin user JWT — REQUIRED to actually verify
 *                        bulk_invoice_from_timesheets (RLS gates the RPC to
 *                        admin/approver). Without it, that step will report
 *                        `blocked: needs admin JWT` instead of failing.
 *   MCP_PROJECT_ID       optional: skip preflight project lookup
 *
 * Usage:
 *   npx tsx scripts/timesheet-regression.ts
 *   MCP_ADMIN_JWT=eyJ... npx tsx scripts/timesheet-regression.ts
 *
 * Exit codes:
 *   0 = pipeline green (or only blocked by missing admin JWT — printed clearly)
 *   1 = hard regression (RPC double-prefix, missing skill, schema drift, etc.)
 *   2 = preflight failed (no billable project, no admin user)
 *   3 = network failure
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL?.replace(/\/$/, '') ??
  'https://rzhjotxffjfsdlhrdkpj.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const ADMIN_JWT = process.env.MCP_ADMIN_JWT ?? '';
const EXEC_URL = `${SUPABASE_URL}/functions/v1/agent-execute`;

type StepStatus = 'pass' | 'blocked' | 'fail';
interface StepReport {
  name: string;
  status: StepStatus;
  reason: string;
  raw?: unknown;
}

const reports: StepReport[] = [];

function bar(s: string) {
  console.log('\n' + '━'.repeat(60));
  console.log('  ' + s);
  console.log('━'.repeat(60));
}

function record(r: StepReport) {
  const icon = r.status === 'pass' ? '✓' : r.status === 'blocked' ? '⚠' : '✗';
  console.log(`  ${icon} ${r.name.padEnd(32)} ${r.reason}`);
  reports.push(r);
}

async function callSkill(
  skillName: string,
  args: Record<string, unknown>,
  jwt: string,
  callerUserId?: string,
): Promise<{ ok: boolean; status: number; body: any; innerError?: string }> {
  const res = await fetch(EXEC_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      skill_name: skillName,
      agent_type: 'mcp',
      caller_user_id: callerUserId,
      arguments: args,
    }),
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  // agent-execute wraps RPC errors as { status:"success", result:{ error, status:"failed" } }
  const innerError =
    body?.error ||
    body?.message ||
    body?.result?.error ||
    (body?.result?.status === 'failed' ? JSON.stringify(body.result) : undefined);
  const ok = res.ok && !innerError;
  return { ok, status: res.status, body, innerError };
}

function classifyError(body: any): { kind: 'rls' | 'double-prefix' | 'missing-skill' | 'other'; msg: string } {
  const msg =
    body?.error ||
    body?.message ||
    body?.result?.error ||
    JSON.stringify(body).slice(0, 200);
  if (typeof msg === 'string') {
    if (/p__[a-z]/.test(msg)) return { kind: 'double-prefix', msg };
    if (/permission denied|RLS|row-level security|Only admins|not authorized/i.test(msg)) return { kind: 'rls', msg };
    if (/skill not found|unknown skill|no such skill/i.test(msg)) return { kind: 'missing-skill', msg };
  }
  return { kind: 'other', msg: String(msg) };
}

async function main() {
  bar('Timesheet → Invoice regression');
  console.log(`  Endpoint: ${EXEC_URL}`);
  console.log(`  Admin JWT: ${ADMIN_JWT ? 'provided' : 'NOT provided (bulk_invoice will be blocked)'}`);

  if (!ANON_KEY && !ADMIN_JWT) {
    console.error('\n✗ Need at least SUPABASE_ANON_KEY or MCP_ADMIN_JWT in env\n');
    process.exit(3);
  }

  const jwt = ADMIN_JWT || ANON_KEY;

  // ── Step 1: log_time ─────────────────────────────────────────────────
  const logRes = await callSkill(
    'log_time',
    {
      action: 'list',
      week_offset: 0,
    },
    jwt,
  );

  if (logRes.ok && !logRes.body?.error) {
    record({ name: 'log_time (list)', status: 'pass', reason: 'OK', raw: logRes.body });
  } else {
    const c = classifyError(logRes.body);
    if (c.kind === 'double-prefix') {
      record({ name: 'log_time (list)', status: 'fail', reason: `REGRESSION: double-prefix: ${c.msg}` });
    } else if (c.kind === 'rls') {
      record({ name: 'log_time (list)', status: 'blocked', reason: `RLS: ${c.msg}` });
    } else if (c.kind === 'missing-skill') {
      record({ name: 'log_time (list)', status: 'fail', reason: `REGRESSION: skill missing: ${c.msg}` });
    } else {
      record({ name: 'log_time (list)', status: 'fail', reason: c.msg });
    }
  }

  // ── Step 2: timesheet_summary ────────────────────────────────────────
  const sumRes = await callSkill('timesheet_summary', { week_offset: 0 }, jwt);

  if (sumRes.ok && !sumRes.body?.error) {
    record({ name: 'timesheet_summary', status: 'pass', reason: 'OK' });
  } else {
    const c = classifyError(sumRes.body);
    if (c.kind === 'double-prefix') {
      record({ name: 'timesheet_summary', status: 'fail', reason: `REGRESSION: double-prefix: ${c.msg}` });
    } else if (c.kind === 'rls') {
      record({ name: 'timesheet_summary', status: 'blocked', reason: `RLS: ${c.msg}` });
    } else {
      record({ name: 'timesheet_summary', status: 'fail', reason: c.msg });
    }
  }

  // ── Step 3: bulk_invoice_from_timesheets ─────────────────────────────
  const projectId = process.env.MCP_PROJECT_ID;
  if (!projectId) {
    record({
      name: 'bulk_invoice_from_timesheets',
      status: 'blocked',
      reason: 'no MCP_PROJECT_ID set — set to a billable project to verify',
    });
  } else {
    const invRes = await callSkill(
      'bulk_invoice_from_timesheets',
      {
        project_id: projectId,
        start_date: '2026-03-01',
        end_date: '2026-03-31',
        group_by: 'entry',
        due_days: 30,
      },
      jwt,
    );

    if (invRes.ok && !invRes.body?.error) {
      record({ name: 'bulk_invoice_from_timesheets', status: 'pass', reason: 'invoice draft created' });
    } else {
      const c = classifyError(invRes.body);
      if (c.kind === 'double-prefix') {
        record({ name: 'bulk_invoice_from_timesheets', status: 'fail', reason: `REGRESSION: double-prefix: ${c.msg}` });
      } else if (c.kind === 'rls') {
        record({
          name: 'bulk_invoice_from_timesheets',
          status: 'blocked',
          reason: ADMIN_JWT
            ? `RLS even with admin JWT — check user_roles: ${c.msg}`
            : 'needs admin JWT (set MCP_ADMIN_JWT)',
        });
      } else if (c.kind === 'missing-skill') {
        record({ name: 'bulk_invoice_from_timesheets', status: 'fail', reason: `REGRESSION: skill missing: ${c.msg}` });
      } else {
        record({ name: 'bulk_invoice_from_timesheets', status: 'fail', reason: c.msg });
      }
    }
  }

  // ── Verdict ──────────────────────────────────────────────────────────
  bar('Verdict');
  const failed = reports.filter((r) => r.status === 'fail');
  const blocked = reports.filter((r) => r.status === 'blocked');
  const passed = reports.filter((r) => r.status === 'pass');

  console.log(`  ${passed.length} passed · ${blocked.length} blocked · ${failed.length} failed`);

  if (failed.length > 0) {
    console.log('\n  ✗ HARD REGRESSIONS:');
    for (const f of failed) console.log(`     - ${f.name}: ${f.reason}`);
    process.exit(1);
  }

  if (blocked.length > 0) {
    console.log('\n  ⚠ Blocked (not regressions, but pipeline not fully verified):');
    for (const b of blocked) console.log(`     - ${b.name}: ${b.reason}`);
  }

  console.log('\n✅ No hard regressions detected.\n');
}

main().catch((e) => {
  console.error('\n✗ Network/unexpected error:', (e as Error).message);
  process.exit(3);
});
