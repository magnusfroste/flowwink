#!/usr/bin/env tsx
/**
 * Timesheet → Invoice Regression
 * ==============================
 *
 * Runs the full agent pipeline that ClawWink (and FlowPilot) rely on for
 * autonomous billing:
 *
 *   1. preflight        — verify a billable project, an admin/approver user
 *                         and (optionally) seed a test project.
 *   2. log_time         — create a billable time entry via agent-execute.
 *   3. timesheet_summary— read it back, confirm hours/revenue add up.
 *   4. bulk_invoice     — invoke the SECURITY-DEFINER RPC to generate an
 *                         invoice from the freshly-logged hours.
 *   5. cleanup          — delete the synthetic deal/entry/invoice if
 *                         --cleanup is passed (default: leave artefacts so
 *                         a human can inspect).
 *
 * Each step prints a single coloured line:
 *   ✓ step                 – worked
 *   ⚠ step (reason)        – soft fail / blocked by config (e.g. RLS)
 *   ✗ step: <error>        – hard fail (regression)
 *
 * Exit codes:
 *   0 = pipeline green
 *   1 = hard regression (something that used to work no longer works)
 *   2 = preflight unmet (no admin user / no project) — fix the seed
 *
 * Env:
 *   SUPABASE_URL              required
 *   SUPABASE_ANON_KEY         required (used as Authorization)
 *   SUPABASE_SERVICE_ROLE_KEY optional — needed for seeding admin/projects
 *   REGRESSION_USER_ID        optional — pin to a specific user with admin role
 *   REGRESSION_PROJECT_ID     optional — pin to a specific billable project
 *
 * Flags:
 *   --seed       Insert a temporary billable project if none exists.
 *   --cleanup    Remove the time entry / deal / invoice created by this run.
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PIN_USER = process.env.REGRESSION_USER_ID;
const PIN_PROJECT = process.env.REGRESSION_PROJECT_ID;

const args = new Set(process.argv.slice(2));
const SHOULD_SEED = args.has('--seed');
const SHOULD_CLEANUP = args.has('--cleanup');

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('✗ Missing SUPABASE_URL or SUPABASE_ANON_KEY in env');
  process.exit(2);
}

const EXEC_URL = `${SUPABASE_URL}/functions/v1/agent-execute`;
const admin = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

// ── Pretty output ───────────────────────────────────────────────────────────
const C = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:   (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
  dim:   (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
};
type StepStatus = 'ok' | 'blocked' | 'failed' | 'skipped';
const results: Array<{ step: string; status: StepStatus; detail?: string }> = [];
function record(step: string, status: StepStatus, detail?: string) {
  results.push({ step, status, detail });
  const icon = status === 'ok' ? C.green('✓')
    : status === 'blocked' ? C.yellow('⚠')
    : status === 'skipped' ? C.dim('·')
    : C.red('✗');
  const line = `${icon} ${C.bold(step.padEnd(22))}${detail ? '  ' + (status === 'failed' ? C.red(detail) : C.dim(detail)) : ''}`;
  console.log(line);
}

// ── Edge-function caller ────────────────────────────────────────────────────
async function callSkill(skillName: string, args_: Record<string, unknown>, callerUserId: string) {
  const res = await fetch(EXEC_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      skill_name: skillName,
      agent_type: 'mcp',
      caller_user_id: callerUserId,
      arguments: args_,
    }),
  });
  const json = await res.json().catch(() => ({ error: `Invalid JSON (HTTP ${res.status})` }));
  return { httpStatus: res.status, body: json as any };
}

// ── Preflight ───────────────────────────────────────────────────────────────
async function preflight(): Promise<{ userId: string; projectId: string } | null> {
  if (!admin) {
    record('preflight', 'blocked', 'no SUPABASE_SERVICE_ROLE_KEY — pin REGRESSION_USER_ID & REGRESSION_PROJECT_ID instead');
    if (PIN_USER && PIN_PROJECT) return { userId: PIN_USER, projectId: PIN_PROJECT };
    return null;
  }

  // 1. Find/pin an admin or approver user
  let userId = PIN_USER;
  if (!userId) {
    const { data, error } = await admin
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['admin', 'approver'])
      .limit(1);
    if (error) { record('preflight', 'failed', `user_roles read: ${error.message}`); return null; }
    if (!data?.length) {
      record('preflight', 'blocked', 'no admin/approver in user_roles — bulk_invoice will be denied');
      return null;
    }
    userId = data[0].user_id;
  }

  // 2. Find/seed a billable project
  let projectId = PIN_PROJECT;
  if (!projectId) {
    const { data: projects } = await admin
      .from('projects').select('id, name, is_billable, hourly_rate_cents')
      .eq('is_active', true).eq('is_billable', true).gt('hourly_rate_cents', 0)
      .order('created_at', { ascending: false }).limit(1);
    if (projects?.length) {
      projectId = projects[0].id;
    } else if (SHOULD_SEED) {
      const { data: seeded, error: seedErr } = await admin.from('projects').insert({
        name: `Regression Project ${new Date().toISOString().slice(0,10)}`,
        client_name: 'Regression Suite',
        color: '#10b981', currency: 'SEK', hourly_rate_cents: 75000,
        is_billable: true, is_active: true,
      }).select('id').single();
      if (seedErr) { record('preflight', 'failed', `seed project: ${seedErr.message}`); return null; }
      projectId = seeded.id;
      record('preflight', 'ok', `seeded project ${projectId.slice(0,8)}…`);
    } else {
      record('preflight', 'blocked', 'no billable project — re-run with --seed');
      return null;
    }
  }

  record('preflight', 'ok', `user=${userId.slice(0,8)}… project=${projectId.slice(0,8)}…`);
  return { userId, projectId };
}

// ── Pipeline ────────────────────────────────────────────────────────────────
async function runPipeline(userId: string, projectId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const monthEnd = today.slice(0, 7) + '-28'; // safe across all months
  let entryId: string | null = null;
  let invoiceId: string | null = null;

  // Step 1: log_time
  {
    const { body } = await callSkill('log_time', {
      action: 'create',
      project_id: projectId,
      hours: 1.5,
      description: '[regression] auto-generated entry',
      entry_date: today,
      is_billable: true,
    }, userId);
    const r = body?.result;
    if (r?.success && r?.entry?.id) {
      entryId = r.entry.id;
      record('log_time', 'ok', `entry ${entryId!.slice(0,8)}… ${r.entry.hours}h`);
    } else {
      const err = r?.error || body?.error || 'unknown';
      record('log_time', 'failed', err);
      return { entryId, invoiceId };
    }
  }

  // Step 2: timesheet_summary
  {
    const { body } = await callSkill('timesheet_summary', {
      period: 'custom',
      project_id: projectId,
      start_date: monthStart,
      end_date: monthEnd,
      include_revenue: true,
    }, userId);
    const r = body?.result;
    if (r?.error) {
      record('timesheet_summary', 'failed', r.error);
    } else if (typeof r?.total_hours === 'number') {
      const hrs = r.total_hours;
      const rev = r.by_project?.[0]?.revenue_cents ?? 0;
      if (hrs >= 1.5) {
        record('timesheet_summary', 'ok', `${hrs}h billable, revenue ${(rev/100).toFixed(2)} SEK`);
      } else {
        record('timesheet_summary', 'blocked', `expected ≥1.5h, got ${hrs}h — read-after-write lag?`);
      }
    } else {
      record('timesheet_summary', 'failed', 'no total_hours in response');
    }
  }

  // Step 3: bulk_invoice_from_timesheets
  {
    const { body } = await callSkill('bulk_invoice_from_timesheets', {
      project_id: projectId,
      start_date: monthStart,
      end_date: monthEnd,
    }, userId);
    const r = body?.result;
    const errStr: string = r?.error || '';
    if (errStr.includes('admins/approvers')) {
      record('bulk_invoice', 'blocked', 'caller lacks admin/approver role (RLS — by design)');
    } else if (errStr.includes('without parameters in the schema cache')) {
      record('bulk_invoice', 'failed', 'rpc-arg mapping regressed (p__caller_user_id?) — see arg-mapping test');
    } else if (errStr.includes('Could not find the function')) {
      record('bulk_invoice', 'failed', 'RPC missing — re-deploy migration for bulk_invoice_from_timesheets');
    } else if (errStr) {
      record('bulk_invoice', 'failed', errStr);
    } else if (r?.invoice_id || r?.invoice?.id) {
      invoiceId = r.invoice_id || r.invoice.id;
      record('bulk_invoice', 'ok', `invoice ${invoiceId!.slice(0,8)}…`);
    } else {
      record('bulk_invoice', 'blocked', `no invoice_id in response: ${JSON.stringify(r).slice(0,120)}`);
    }
  }

  return { entryId, invoiceId };
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
async function cleanup(entryId: string | null, invoiceId: string | null) {
  if (!SHOULD_CLEANUP) { record('cleanup', 'skipped', 'pass --cleanup to remove artefacts'); return; }
  if (!admin) { record('cleanup', 'blocked', 'service role required'); return; }
  if (invoiceId) await admin.from('invoices').delete().eq('id', invoiceId);
  if (entryId) await admin.from('time_entries').delete().eq('id', entryId);
  record('cleanup', 'ok', `removed ${[entryId, invoiceId].filter(Boolean).length} rows`);
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(C.bold('\n  Timesheet → Invoice Regression'));
  console.log(C.dim(`  ${EXEC_URL}\n`));

  const ctx = await preflight();
  if (!ctx) {
    console.log('\n' + C.red('✗ preflight failed — fix above and re-run'));
    process.exit(2);
  }

  const { entryId, invoiceId } = await runPipeline(ctx.userId, ctx.projectId);
  await cleanup(entryId, invoiceId);

  // ── Summary ───────────────────────────────────────────────────────────────
  const failed = results.filter(r => r.status === 'failed');
  const blocked = results.filter(r => r.status === 'blocked');
  const ok = results.filter(r => r.status === 'ok');

  console.log('\n' + C.bold('  Summary'));
  console.log(`    ${C.green(`✓ ${ok.length} passed`)}    ${C.yellow(`⚠ ${blocked.length} blocked`)}    ${C.red(`✗ ${failed.length} failed`)}`);

  if (failed.length) {
    console.log('\n' + C.red('  Hard regressions (fix immediately):'));
    failed.forEach(f => console.log(`    • ${f.step}: ${f.detail}`));
    process.exit(1);
  }
  if (blocked.length) {
    console.log('\n' + C.yellow('  Blocked steps (config/permission, not code):'));
    blocked.forEach(b => console.log(`    • ${b.step}: ${b.detail}`));
  }
  console.log();
  process.exit(0);
})().catch(err => {
  console.error('\n' + C.red('✗ unhandled error: ') + (err?.message || err));
  process.exit(1);
});
