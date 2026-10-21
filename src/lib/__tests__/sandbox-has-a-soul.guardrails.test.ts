import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLOWPILOT_SOUL, FLOWPILOT_IDENTITY, FLOWPILOT_AGENTS_RULES, FLOWPILOT_STARTER_OBJECTIVES,
  REQUIRES_BUSINESS_IDENTITY, IDENTITY_HOLD_REASON, starterObjectiveRow,
} from '../../../supabase/functions/_shared/pilot/soul-defaults';
import * as gate from '@/lib/business-identity-gate';
import * as mod from '@/lib/modules/flowpilot-module';

/**
 * FlowPilot has a soul wherever it is switched on — including after a
 * server-side rebuild.
 *
 * sandbox.flowwink.com (2026-10-20): agent_memory empty, no objectives, the
 * heartbeat never run, "Missing critical memory keys: soul, identity, agents"
 * every six hours. The nightly reset_sandbox relied on "auto-bootstrap on the
 * next heartbeat/app load"; the heartbeat only reported the gap and the
 * app-load repair needs an admin to open the site. The defaults lived in the
 * frontend only, so no server path could seed them.
 *
 *   1. One source for the defaults, importable by both runtimes.
 *   2. The heartbeat seeds them before it thinks (fail forward, Law 4).
 *   3. reset_sandbox and install_template seed them server-side.
 *   4. Insert-if-absent everywhere: an edited soul is never overwritten.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('one source for the defaults', () => {
  it('the shared file carries the soul, identity, rules and starter objectives, and imports nothing', () => {
    const shared = read('supabase/functions/_shared/pilot/soul-defaults.ts');
    expect(shared).not.toMatch(/^import /m);
    expect(FLOWPILOT_SOUL.persona).toMatch(/FlowPilot/);
    expect(FLOWPILOT_IDENTITY.name).toBe('FlowPilot');
    expect(FLOWPILOT_AGENTS_RULES.version).toBeTruthy();
    expect(FLOWPILOT_STARTER_OBJECTIVES.length).toBeGreaterThan(0);
  });

  it('the frontend module reads the same defaults and defines none of its own', () => {
    const fe = read('src/lib/modules/flowpilot-module.ts');
    expect(fe).toMatch(/from '\.\.\/\.\.\/\.\.\/supabase\/functions\/_shared\/pilot\/soul-defaults'/);
    expect(fe).not.toMatch(/^const FLOWPILOT_(SOUL|IDENTITY|AGENTS_RULES) = \{/m);
    expect(mod.FLOWPILOT_STARTER_OBJECTIVES).toBe(FLOWPILOT_STARTER_OBJECTIVES);
    expect(mod.starterObjectiveRow).toBe(starterObjectiveRow);
  });

  it('the two identity-gate constants agree between the gate and the shared defaults', () => {
    expect(gate.REQUIRES_BUSINESS_IDENTITY).toBe(REQUIRES_BUSINESS_IDENTITY);
    expect(gate.IDENTITY_HOLD_REASON).toBe(IDENTITY_HOLD_REASON);
  });
});

describe('seeded from the server side', () => {
  const ensure = read('supabase/functions/_shared/pilot/ensure-soul.ts');

  it('insert-if-absent for memory and objectives, identity-gated objectives born paused', () => {
    expect(ensure).toMatch(/\.from\('agent_memory'\)\.select\('key'\)/);
    expect(ensure).toMatch(/if \(have\.has\(e\.key\)\) continue;/);
    expect(ensure).toMatch(/if \(goals\.has\(obj\.goal\)\) continue;/);
    expect(ensure).toMatch(/starterObjectiveRow\(obj, out\.identity_ready\)/);
    expect(ensure).not.toMatch(/\.update\(|\.upsert\(|\.delete\(/);
    const row = starterObjectiveRow(FLOWPILOT_STARTER_OBJECTIVES.find((o) => (o.constraints as Record<string, unknown>)[REQUIRES_BUSINESS_IDENTITY])!, false);
    expect(row.status).toBe('paused');
  });

  it('the heartbeat seeds before the brain gate, instead of only reporting the gap', () => {
    const hb = read('supabase/functions/flowpilot-heartbeat/index.ts');
    const seed = hb.indexOf('await ensureFlowPilotSoul(supabase)');
    expect(seed).toBeGreaterThan(hb.indexOf("reason: 'flowpilot_disabled'"));
    expect(seed).toBeLessThan(hb.indexOf("reason: 'no_ai_provider'"));
    expect(seed).toBeLessThan(hb.indexOf('runIntegrityGate(supabase)'));
  });

  it('reset_sandbox and install_template seed it too', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    const reset = ae.slice(ae.indexOf('async function executeResetSandbox'), ae.indexOf('async function tplExportSite'));
    expect(reset).toMatch(/await tplInstall\(supabase, \{[\s\S]*soul = await ensureFlowPilotSoul\(supabase\)/);
    expect(reset).not.toMatch(/re-seed via auto-bootstrap on the next heartbeat/);
    const install = ae.slice(ae.indexOf('async function tplInstall'), ae.indexOf('async function executeResetSandbox'));
    expect(install).toMatch(/flowpilot\?\.enabled === true\) soulSeeded = await ensureFlowPilotSoul\(supabase\)/);
  });
});
