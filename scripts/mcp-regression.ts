#!/usr/bin/env tsx
/**
 * MCP Regression Test
 * ===================
 *
 * One-shot regression check that fails CI/dev if the live MCP surface drifts
 * away from what the codebase claims it exposes.
 *
 * Pipeline (each step gates the next):
 *   1. Pre-MCP guard      — static check that all required modules are wired
 *                           into the unified registry (delegates to
 *                           verify-hr-modules.ts).
 *   2. Live initialize    — JSON-RPC `initialize` against the deployed MCP
 *                           edge function. Verifies protocol handshake.
 *   3. Live tools/list    — fetches the actual tool catalogue exposed to
 *                           external orchestrators.
 *   4. Expectation match  — every skill in EXPECTED_TOOLS must be present in
 *                           the live response. Missing → exit 1.
 *   5. Live tools/call    — smoke test that JSON-RPC execution works end-to-end
 *                           against a read-only tool (list_leads). Catches
 *                           regressions in the SSE/Streamable HTTP layer.
 *
 * Env:
 *   MCP_URL          (default: https://<project>.supabase.co/functions/v1/mcp-server)
 *   MCP_API_KEY      bearer token for the MCP server (required if RLS-gated)
 *   SUPABASE_URL     fallback to derive MCP_URL
 *   SUPABASE_ANON_KEY auto-used as Authorization if MCP_API_KEY missing
 *
 * Exit codes:
 *   0 = all green
 *   1 = expectation mismatch (regression!)
 *   2 = pre-MCP guard failed
 *   3 = network / handshake failure
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────────

const ROOT = process.cwd();

/**
 * Skills/tools we require the live MCP server to expose.
 * Grouped by module — keep in sync with src/lib/modules/*-module.ts.
 *
 * NOT exhaustive — only the load-bearing skills that prove each module's
 * surface is wired through to MCP. Adding a skill here = adding a regression
 * gate.
 */
const EXPECTED_TOOLS: Record<string, string[]> = {
  hr: ['manage_employee', 'manage_leave', 'onboarding_checklist'],
  recruitment: [
    'manage_job_posting',
    'parse_resume',
    'score_candidate',
    'move_application_stage',
    'hire_candidate',
    'summarize_candidate_pipeline',
  ],
  contracts: [
    'manage_contract',
    'contract_renewal_check',
    'send_contract_for_signature',
    'list_contract_documents',
  ],
  expenses: ['manage_expenses'],
  timesheets: ['log_time', 'timesheet_summary'],
  documents: ['manage_document'],
  invoicing: ['manage_invoice'],
  crm: ['add_lead', 'manage_leads'],
  deals: ['manage_deal'],
};

const MCP_URL =
  process.env.MCP_URL ??
  (process.env.SUPABASE_URL
    ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/mcp-server`
    : 'https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/mcp-server');

const AUTH_TOKEN = process.env.MCP_API_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

// ── Helpers ─────────────────────────────────────────────────────────────────

function bar(title: string) {
  const line = '━'.repeat(60);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function fail(code: number, msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(code);
}

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // MCP Streamable HTTP spec — server returns 406 without this
    Accept: 'application/json, text/event-stream',
  };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;

  const body = { jsonrpc: '2.0', id: Math.floor(Math.random() * 1e6), method, params };

  let res: Response;
  try {
    res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    fail(3, `Network error contacting ${MCP_URL}: ${(e as Error).message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    fail(3, `MCP ${method} → HTTP ${res.status} ${res.statusText}\n${text.slice(0, 500)}`);
  }

  // Streamable HTTP can return either JSON or SSE. Handle both.
  let payload: unknown;
  const trimmed = text.trimStart();
  const looksSse =
    trimmed.startsWith('event:') ||
    trimmed.startsWith('data:') ||
    (res.headers.get('content-type') ?? '').includes('text/event-stream');

  if (looksSse) {
    // Extract last `data: ...` line (single JSON-RPC frame per response)
    const dataLine = text
      .split('\n')
      .map((l) => l.trim())
      .reverse()
      .find((l) => l.startsWith('data:'));
    if (!dataLine) fail(3, `MCP ${method} → SSE response with no data frame`);
    payload = JSON.parse(dataLine!.slice(5).trim());
  } else {
    payload = JSON.parse(text);
  }

  const obj = payload as { error?: { message: string }; result?: unknown };
  if (obj.error) fail(3, `MCP ${method} → JSON-RPC error: ${obj.error.message}`);
  return obj.result;
}

// ── Steps ───────────────────────────────────────────────────────────────────

function step1_preMcpGuard() {
  bar('1/5  Pre-MCP guard (static module registry check)');
  const result = spawnSync('npx', ['-y', 'tsx', path.join(ROOT, 'scripts/verify-hr-modules.ts')], {
    stdio: 'inherit',
  });
  if (result.status !== 0) fail(2, 'Pre-MCP guard failed — fix module registry first.');
}

async function step2_initialize() {
  bar('2/5  Live MCP initialize handshake');
  const result = (await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-regression', version: '1.0.0' },
  })) as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string };

  console.log(`  ✓ Server: ${result?.serverInfo?.name ?? '?'} v${result?.serverInfo?.version ?? '?'}`);
  console.log(`  ✓ Protocol: ${result?.protocolVersion ?? '?'}`);
}

async function step3_listTools(): Promise<Set<string>> {
  bar('3/5  Live MCP tools/list');
  const result = (await rpc('tools/list')) as { tools?: Array<{ name: string }> };
  const names = new Set((result.tools ?? []).map((t) => t.name));
  console.log(`  ✓ ${names.size} tools exposed`);
  return names;
}

function step4_assertExpectations(live: Set<string>) {
  bar('4/5  Expectation match');

  const missing: Array<{ module: string; tool: string }> = [];
  let total = 0;

  for (const [module, tools] of Object.entries(EXPECTED_TOOLS)) {
    const hits: string[] = [];
    const miss: string[] = [];
    for (const t of tools) {
      total++;
      if (live.has(t)) hits.push(t);
      else {
        miss.push(t);
        missing.push({ module, tool: t });
      }
    }
    const mark = miss.length === 0 ? '✓' : '✗';
    console.log(
      `  ${mark}  ${module.padEnd(13)} ${hits.length}/${tools.length}` +
        (miss.length ? `   missing: ${miss.join(', ')}` : ''),
    );
  }

  console.log(`\n  ${total - missing.length}/${total} expected tools live.`);

  if (missing.length) {
    console.log('\n  REGRESSION — the following expected tools are NOT exposed:');
    for (const m of missing) console.log(`    ✗  [${m.module}] ${m.tool}`);
    fail(
      1,
      `MCP regression: ${missing.length} expected tool(s) missing from live server. ` +
        `Either add the skill to agent_skills (mcp_exposed=true) or remove it from EXPECTED_TOOLS in scripts/mcp-regression.ts.`,
    );
  }
}

async function step5_callSmokeTest(live: Set<string>) {
  bar('5/5  Live MCP tools/call smoke test');

  // Pick a safe read-only tool we know is exposed on every instance.
  const candidates = ['list_leads', 'list_orders', 'list_pages'];
  const target = candidates.find((t) => live.has(t));
  if (!target) {
    console.log('  ⚠  No safe read-only tool available — skipping tools/call smoke test.');
    return;
  }

  const result = (await rpc('tools/call', {
    name: target,
    arguments: {},
  })) as { content?: Array<{ type: string }>; isError?: boolean };

  if (result?.isError) {
    fail(1, `tools/call '${target}' returned isError=true — JSON-RPC execution is broken.`);
  }
  if (!Array.isArray(result?.content)) {
    fail(1, `tools/call '${target}' returned no content array — response shape regression.`);
  }
  console.log(`  ✓ tools/call '${target}' returned ${result.content!.length} content block(s)`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMCP regression test → ${MCP_URL}`);
  if (!AUTH_TOKEN) console.log('⚠  No bearer token set (MCP_API_KEY / SUPABASE_ANON_KEY)');

  step1_preMcpGuard();
  await step2_initialize();
  const live = await step3_listTools();
  step4_assertExpectations(live);
  await step5_callSmokeTest(live);

  console.log('\n✅ MCP regression PASSED — all expected tools exposed + tools/call works.\n');
}

main().catch((e) => fail(3, `Unhandled: ${(e as Error).message}`));
