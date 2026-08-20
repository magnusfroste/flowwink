/**
 * Guardrails: FlowWork's dispatch surface (supabase/functions/workspace-chat).
 *
 * Three independent QA runs (2026-08-20) put the same finding on the table
 * from different angles: the loop looked competent and produced nothing, or
 * produced something false. Each of these tests locks one of the mechanisms
 * that were missing.
 *
 *  1. DISCOVERY was filtered on the READ predicate, so 328 of 536 skills —
 *     every pure write — were invisible. Naming one out loud ("use
 *     place_order") produced perfect staging on the first try, which is the
 *     proof the reach was the only thing missing.
 *  2. Discovery did not consider the CALLER. FlowWork staged operations that
 *     were guaranteed to 403 on execution; three humans clicked approve on
 *     them.
 *  3. The gate trail (logGateOutcome) was fire-and-forget in a streaming
 *     isolate and never landed a single row — the audit trail built to replace
 *     the model's self-report was itself a self-report.
 *  4. The preflight checked only for UNKNOWN keys, never MISSING required
 *     ones, so an omitted `action` fell into a handler default and returned
 *     "success" for something that had not happened.
 *  5. Nothing told the model what day it is, so it staged a due date two years
 *     in the past.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isDiscoverableSkill,
  isReadSkill,
  classifyCall,
} from '../../../supabase/functions/_shared/skills/read-surface';
import { SKILL_OWNER_MODULE, ownerModuleOf } from '../../../supabase/functions/_shared/skills/skill-modules';
import artifact from '../../../supabase/seed/module-skills.json';

const src = readFileSync(
  join(process.cwd(), 'supabase/functions/workspace-chat/index.ts'),
  'utf8',
);

describe('the search surface reaches reads AND stageable writes', () => {
  it('the writes QA proved reachable-by-name are discoverable', () => {
    // Every one of these is a pure write with no read prefix and no
    // manage_*/action escape hatch — exactly the class the read filter hid.
    for (const name of [
      'place_order',
      'receive_purchase_order',
      'refund_return',
      'record_invoice_payment',
      'create_return',
      'approve_expense_report',
      'send_dunning_reminders',
    ]) {
      expect(isReadSkill(name), `${name} is genuinely a write`).toBe(false);
      expect(classifyCall(name, {}), name).toBe('stage');
      expect(isDiscoverableSkill(name), `${name} must be findable`).toBe(true);
    }
  });

  it('the deny tier stays hidden — proposing what can never run teaches nothing', () => {
    for (const name of ['get_api_keys', 'delete_user', 'purge_audit_logs', '']) {
      expect(isDiscoverableSkill(name), name).toBe(false);
    }
  });

  it('discovery covers most of the catalog, not a third of it', () => {
    const names = (artifact as { modules: Array<{ skills: Array<{ name: string }> }> })
      .modules.flatMap((m) => m.skills.map((s) => s.name));
    const discoverable = names.filter(isDiscoverableSkill);
    const readOnly = names.filter((n) => isReadSkill(n) || classifyCall(n, { action: 'list' }) === 'read');
    // The regression this locks: read-only reach was well under half.
    expect(readOnly.length).toBeLessThan(names.length * 0.6);
    expect(discoverable.length).toBeGreaterThan(names.length * 0.9);
  });

  it('search_skills filters on the caller, not just on the tier', () => {
    expect(src).toMatch(/function isOfferable\(/);
    expect(src).toMatch(/isDiscoverableSkill\(name\)/);
    expect(src).toMatch(/ownerModuleOf\(name\)/);
    // Fail-closed edges, mirroring agent-execute: platform-owned and unmapped
    // skills are admin-only.
    expect(src).toMatch(/if \(!owner \|\| owner === 'platform'\) return false;/);
    expect(src).toMatch(/callerModules\.has\(owner\)/);
    // One batched lookup, not one RPC per skill.
    expect(src).toMatch(/async function loadCallerModules\(/);
    expect(src).toMatch(/from\('role_module_access'\)/);
    // And it is applied at all three doors, not only at search.
    expect(src).toMatch(/runSearchSkills\(supabaseAdmin, args\.query \|\| String\(latestUserMessage\), callerModules\)/);
    expect(src).toMatch(/runReadSkillTool\(supabaseAdmin, String\(args\.name \|\| ''\), callerModules\)/);
    expect(src).toMatch(/if \(!isOfferable\(name, callerModules\)\)/);
  });

  it('an unreadable role grant fails closed, not open', () => {
    expect(src).toMatch(/module grants unreadable — failing closed/);
    expect(src).toMatch(/return new Set<string>\(\);/);
  });
});

describe('the skill→module map is the same ownership the executor enforces', () => {
  it('matches the seed artifact exactly', () => {
    const fromArtifact: Record<string, string> = {};
    for (const m of (artifact as { modules: Array<{ moduleId: string; skills: Array<{ name: string }> }> }).modules) {
      for (const s of m.skills) fromArtifact[s.name] = m.moduleId;
    }
    expect(
      { ...SKILL_OWNER_MODULE },
      'Stale skill-modules.ts — run `npm run skills:json`',
    ).toEqual(fromArtifact);
  });

  it('unmapped skills report null (⇒ admin-only), never a guess', () => {
    expect(ownerModuleOf('some_future_agent_authored_skill')).toBeNull();
    expect(ownerModuleOf('manage_ticket')).toBe('tickets');
  });
});

describe('the gate trail actually lands', () => {
  it('logGateOutcome is awaited — a streaming isolate drops what it does not wait for', () => {
    expect(src).toMatch(/const logGateOutcome = async \(/);
    expect(src).toMatch(/const \{ error \} = await service\.from\('agent_activity'\)\.insert\(/);
    // Every call site awaits it. `void service.from('agent_activity')` was the
    // exact shape that produced zero rows, ever.
    expect(src).not.toMatch(/void service\.from\('agent_activity'\)/);
    const calls = src.match(/^\s*(await )?logGateOutcome\(/gm) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c, `un-awaited: ${c.trim()}`).toMatch(/await logGateOutcome\(/);
  });

  it('no fire-and-forget usage insert survives on a returning path', () => {
    expect(src).not.toMatch(/void logAiUsage\(/);
  });

  it('a failed consult carries WHY into the SSE trace, not just ok:false', () => {
    expect(src).toMatch(/consulted\?: Array<\{ skill: string; ok: boolean; ms: number; error\?: string \}>/);
    expect(src).toMatch(/failReason \? \{ error: failReason \} : \{\}/);
  });
});

describe('the preflight reads the whole contract', () => {
  it('bounces MISSING required parameters, not only unknown ones', () => {
    expect(src).toMatch(/parameters\?\.required/);
    expect(src).toMatch(/missing required parameter\(s\)/);
    // A handler default must never be allowed to stand in for an omitted
    // required field — that is how "success" got reported for a fee that was
    // never set.
    expect(src).toMatch(/do NOT rely on a handler default/i);
    // Per-action requirements count too.
    expect(src).toMatch(/x-action-required/);
  });

  it('the reference guard inspects a bare `id`', () => {
    expect(src).toMatch(/const isRefKey = \(k: string\) => k === 'id' \|\| k\.endsWith\('_id'\);/);
    expect(src).toMatch(/id="\$\{v\}" is not a UUID/);
  });

  it('a well-formed UUID of the WRONG entity is bounced, and unknown tables fail open', () => {
    expect(src).toMatch(/is a valid UUID but there is no such row in/);
    expect(src).toMatch(/if \(probeErr\) continue;/);
    // The page special case (2026-08-19) survives.
    expect(src).toMatch(/entity === 'page'/);
  });
});

describe('the model knows what day it is', () => {
  it('today is injected into the system prompt, ISO + weekday', () => {
    expect(src).toMatch(/TODAY IS \$\{/);
    expect(src).toMatch(/weekday: 'long'/);
    expect(src).toMatch(/toISOString\(\)\.slice\(0, 10\)/);
    expect(src).toMatch(/explicit ISO date \(YYYY-MM-DD\)/);
    // …and it is actually part of the prompt, not a dangling const.
    expect(src).toMatch(/^\s+todayBlock,$/m);
  });
});
