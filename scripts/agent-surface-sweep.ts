#!/usr/bin/env bun
/**
 * Agent surface sweep — drive every skill the way an operator meets it, and
 * compare the outcome to a committed baseline.
 *
 * WHY THIS EXISTS
 *
 * A day of real bugs, none of which lived in a broken component:
 *
 *   - content memory reached one of three generative paths
 *   - `event_name` was fixed in one of two dispatchers
 *   - the form→lead chain broke where a security fix crossed a data flow
 *   - slugify existed five times, three of them half-right
 *   - a webhooks lookup threw before the automations lane it was protecting
 *
 * Every one was invisible in code review and visible in the outcome. Unit tests
 * did not catch them because each component passed its own tests. So this is
 * the third leg of the triangle: contract tests say the schema matches the
 * runtime, parity guardrails say duplicated logic agrees — and this says the
 * surface an agent actually calls still answers.
 *
 * WHY A BASELINE AND NOT A PASS/FAIL GATE
 *
 * The first live sweep probed 234 skills and 41 failed. A gate demanding zero
 * failures would have been red on day one and ignored by day two — the same
 * noise problem that makes an alert worthless. So the guard fails on
 * REGRESSION: a skill that answered before and does not now, or a new skill
 * that arrives already broken. Existing debt is recorded, visible, and shrinks
 * deliberately.
 *
 * WHAT IT WILL NOT DO
 *
 * Probe anything that sends, deletes, charges or merges. The probe list is
 * derived from each skill's own schema and filtered by name — see DESTRUCTIVE.
 *
 * USAGE
 *   FW_URL=https://<ref>.supabase.co/functions/v1/mcp-server \
 *   FW_KEY=fwk_... \
 *   bun run scripts/agent-surface-sweep.ts [--update-baseline] [--json]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolved lazily: `import.meta.dir` is bun-only, and this module is also
// imported by vitest for its pure helpers, where evaluating it at module level
// would throw before a single test ran.
const repoRoot = () => resolve(import.meta.dir ?? process.cwd(), import.meta.dir ? '..' : '.');
const baselinePath = () => resolve(repoRoot(), 'supabase/seed/agent-surface-baseline.json');
const skillsPath = () => resolve(repoRoot(), 'supabase/seed/module-skills.json');

/**
 * Never probed. A sweep that emails a customer or deletes a record to prove the
 * surface works has cost more than it found.
 */
const DESTRUCTIVE = [
  'delete', 'send', 'merge', 'refund', 'cancel', 'purge', 'reset', 'seed',
  'deploy', 'sync', 'bulk', 'escalate', 'hire', 'pay', 'void', 'close_',
  'execute', 'approve', 'reject', 'publish', 'archive', 'restock',
];

export type Outcome = 'ok' | 'broken' | 'contract_gap' | 'environment' | 'silent_failure' | 'unprobed';

export interface SkillResult {
  module: string;
  skill: string;
  outcome: Outcome;
  detail?: string;
}

/**
 * Classify a runtime error. The three classes are not cosmetic — they decide
 * whether a failure is a defect (broken, contract_gap) or a fact about this
 * instance (environment). Mixing them is what turns a guard into noise.
 */
export function classify(errorText: string | null | undefined): Outcome {
  if (!errorText) return 'ok';
  const e = String(errorText);

  // The skill cannot run at all: no handler, or the function it names is gone.
  // This is the class that broke get_blog_rss_url (handler `builtin:` exists
  // nowhere in agent-execute) and auto_mark_invoice_paid.
  if (/Unknown handler type|Could not find the function|does not exist|Unknown skill/i.test(e)) {
    return 'broken';
  }

  // This instance lacks a connected integration or a user session. Not a defect
  // — a fresh install legitimately has no Gmail and no portal login.
  // Calibrated against the first full sweep: "No bot_token provided or stored"
  // and "No base currency configured" are unconfigured instances, not defects.
  if (/not connected|No user_id|signed in as a company contact|not configured|missing .*API key|No \w+ provided or stored|No base currency/i.test(e)) {
    return 'environment';
  }

  // status=failed with nothing to act on. Its own class because it is its own
  // defect: three skills answer this way, and an agent that receives it cannot
  // self-correct — the whole point of the enriched RPC errors elsewhere.
  if (/^(None|null|undefined|unknown failure)$/i.test(e.trim())) {
    return 'silent_failure';
  }

  // The schema did not describe what the runtime demands: an action the enum
  // never listed, or a required parameter declared optional. Ten skills failed
  // this way on the first sweep, and every one of their error messages listed
  // the valid values — the information existed, just not where an agent reads
  // it before calling. Law 2.
  if (/[Uu]nknown .*action|action must be|Supported:|Use create|use set\||is required|are required|and \w+ required|Provide |required for|must be provided/i.test(e)) {
    return 'contract_gap';
  }

  return 'broken';
}

/** Derive a safe, schema-conformant probe for a skill, or null to skip it. */
export function probeFor(skill: { name: string; tool_definition?: any }): string | null {
  if (DESTRUCTIVE.some((d) => skill.name.includes(d))) return null;

  const params = skill.tool_definition?.function?.parameters ?? {};
  const props = params.properties ?? {};
  const required: string[] = params.required ?? [];

  if (required.length === 0) return '{}';
  if (required.length === 1 && required[0] === 'action' && props.action) return '{"action":"list"}';
  if (required.length === 1 && required[0] === 'p_action' && props.p_action) return '{"p_action":"list"}';
  return null; // needs an entity we would have to invent — out of scope for a sweep
}

/** A regression is a skill that got worse, or a new skill born broken. */
export function diffAgainstBaseline(
  baseline: Record<string, Outcome>,
  current: SkillResult[],
): { regressions: SkillResult[]; recoveries: SkillResult[]; newlyBroken: SkillResult[] } {
  const regressions: SkillResult[] = [];
  const recoveries: SkillResult[] = [];
  const newlyBroken: SkillResult[] = [];

  for (const r of current) {
    const was = baseline[r.skill];
    if (was === undefined) {
      // A skill nobody has swept before. Arriving already broken is a
      // regression against the repo, even though it is not one against the
      // baseline — otherwise every new broken skill enters for free.
      if (r.outcome === 'broken' || r.outcome === 'contract_gap' || r.outcome === 'silent_failure') newlyBroken.push(r);
      continue;
    }
    if (was === 'ok' && r.outcome !== 'ok' && r.outcome !== 'environment') regressions.push(r);
    if (was !== 'ok' && r.outcome === 'ok') recoveries.push(r);
  }
  return { regressions, recoveries, newlyBroken };
}

// ─── live probing ───────────────────────────────────────────────────────────

async function callSkill(url: string, key: string, name: string, args: string): Promise<string | null> {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'execute_skill', arguments: { name, arguments: JSON.parse(args) } },
  });
  const res = await fetch(`${url}?mode=dispatch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  // The gateway answers as SSE; unwrap the first data frame.
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  const payload = JSON.parse((line ?? text).replace(/^data: /, ''));

  if (payload.error) return `RPC: ${JSON.stringify(payload.error).slice(0, 200)}`;
  const inner = payload.result?.content?.[0]?.text;
  if (!inner) return 'no content in response';

  let parsed: any;
  try { parsed = JSON.parse(inner); } catch { return null; } // plain text = fine
  if (parsed.status === 'success') return null;
  return String(parsed.result?.error ?? parsed.error ?? 'unknown failure').slice(0, 300);
}

async function main() {
  const url = process.env.FW_URL;
  const key = process.env.FW_KEY;
  const update = process.argv.includes('--update-baseline');
  const asJson = process.argv.includes('--json');

  if (!url || !key) {
    console.error('FW_URL and FW_KEY are required (the MCP gateway URL and an instance API key).');
    console.error('This sweep needs a live instance — it is deliberately not a static check.');
    process.exit(2);
  }

  const skills = JSON.parse(readFileSync(skillsPath(), 'utf-8'));
  const results: SkillResult[] = [];

  for (const mod of skills.modules) {
    for (const skill of mod.skills) {
      const args = probeFor(skill);
      if (args === null) continue;
      let outcome: Outcome;
      let detail: string | undefined;
      try {
        const err = await callSkill(url, key, skill.name, args);
        outcome = classify(err);
        if (err) detail = err;
      } catch (e) {
        outcome = 'broken';
        detail = `probe failed: ${(e as Error).message}`;
      }
      results.push({ module: mod.moduleId, skill: skill.name, outcome, detail });
      if (!asJson) process.stderr.write(outcome === 'ok' ? '.' : outcome === 'environment' ? 'e' : 'X');
    }
  }
  if (!asJson) process.stderr.write('\n');

  if (update) {
    const baseline = Object.fromEntries(results.map((r) => [r.skill, r.outcome]));
    // Details for everything that is not ok — so the classifier can be
    // recalibrated from the file instead of a fresh ten-minute sweep, and so a
    // reader can see WHY a skill is in the baseline rather than just that it is.
    const details = Object.fromEntries(
      results.filter((r) => r.outcome !== 'ok' && r.detail).map((r) => [r.skill, r.detail]),
    );
    writeFileSync(baselinePath(), JSON.stringify({
      note: 'Recorded outcomes per skill. The sweep fails on REGRESSION against this, not on absolute failure count — see scripts/agent-surface-sweep.ts.',
      swept: results.length,
      baseline,
      details,
    }, null, 2) + '\n');
    console.log(`Baseline written: ${results.length} skills.`);
    return;
  }

  if (!existsSync(baselinePath())) {
    console.error(`No baseline at ${baselinePath()}. Run once with --update-baseline.`);
    process.exit(2);
  }
  const { baseline } = JSON.parse(readFileSync(baselinePath(), 'utf-8'));
  const { regressions, recoveries, newlyBroken } = diffAgainstBaseline(baseline, results);

  if (asJson) {
    console.log(JSON.stringify({ results, regressions, recoveries, newlyBroken }, null, 2));
  } else {
    const counts = results.reduce<Record<string, number>>((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] ?? 0) + 1 }), {});
    console.log(`\nSwept ${results.length}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    for (const r of recoveries) console.log(`  ✓ recovered: ${r.skill}`);
    for (const r of newlyBroken) console.log(`  ! new skill already ${r.outcome}: ${r.skill} — ${r.detail}`);
    for (const r of regressions) console.log(`  ✗ REGRESSION: ${r.skill} (${r.outcome}) — ${r.detail}`);
  }

  // Recoveries are good news and must never fail the run; debt is not a
  // failure either. Only "it worked and now it does not" and "it arrived
  // broken" stop the line.
  if (regressions.length || newlyBroken.length) process.exit(1);
}

if (import.meta.main) await main();
