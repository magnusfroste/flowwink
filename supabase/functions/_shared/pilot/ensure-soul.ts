/**
 * ensureFlowPilotSoul — FlowPilot's defaults, seeded from the server side.
 *
 * Insert-if-absent, the same rule the admin shell's bootstrapModule('flowpilot')
 * follows: memory keys soul / identity / agents / tool_policy, then the starter
 * objectives, identity-gated ones born 'paused' until company_profile carries
 * the core (the wake trigger activates them). Never overwrites a soul an
 * operator or FlowPilot itself has edited; never touches existing objectives.
 *
 * Called by the heartbeat before it thinks (fail forward: a missing soul is
 * seeded, not reported), by reset_sandbox after the template is back, and by
 * install_template when the install switched FlowPilot on.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hasCoreBusinessIdentity } from '../domains/business-identity-block.ts';
import {
  FLOWPILOT_AGENTS_RULES,
  FLOWPILOT_IDENTITY,
  FLOWPILOT_SOUL,
  FLOWPILOT_STARTER_OBJECTIVES,
  FLOWPILOT_TOOL_POLICY,
  starterObjectiveRow,
} from './soul-defaults.ts';

export interface SoulSeedResult {
  memory: string[];
  objectives: string[];
  identity_ready: boolean;
  errors: string[];
}

export async function ensureFlowPilotSoul(supabase: SupabaseClient): Promise<SoulSeedResult> {
  const out: SoulSeedResult = { memory: [], objectives: [], identity_ready: false, errors: [] };

  const entries: Array<{ key: string; value: unknown; category: 'preference' | 'context' }> = [
    { key: 'soul', value: FLOWPILOT_SOUL, category: 'preference' },
    { key: 'identity', value: FLOWPILOT_IDENTITY, category: 'preference' },
    { key: 'agents', value: FLOWPILOT_AGENTS_RULES, category: 'preference' },
    { key: 'tool_policy', value: FLOWPILOT_TOOL_POLICY, category: 'context' },
  ];
  const { data: present, error: memErr } = await supabase
    .from('agent_memory').select('key').in('key', entries.map((e) => e.key));
  if (memErr) { out.errors.push(`agent_memory read: ${memErr.message}`); return out; }
  const have = new Set((present ?? []).map((r: { key: string }) => r.key));
  for (const e of entries) {
    if (have.has(e.key)) continue;
    const { error } = await supabase.from('agent_memory').insert({ key: e.key, value: e.value, category: e.category, created_by: 'flowpilot' });
    if (error) out.errors.push(`memory ${e.key}: ${error.message}`); else out.memory.push(e.key);
  }

  // A failed read is not absence: seed identity-gated objectives paused, as the shell does.
  const { data: profileRow, error: profileErr } = await supabase
    .from('site_settings').select('value').eq('key', 'company_profile').maybeSingle();
  out.identity_ready = !profileErr && hasCoreBusinessIdentity(profileRow?.value ?? null);

  const { data: existing, error: objErr } = await supabase.from('agent_objectives').select('goal');
  if (objErr) { out.errors.push(`agent_objectives read: ${objErr.message}`); return out; }
  const goals = new Set((existing ?? []).map((r: { goal: string }) => r.goal));
  for (const obj of FLOWPILOT_STARTER_OBJECTIVES) {
    if (goals.has(obj.goal)) continue;
    const { error } = await supabase.from('agent_objectives').insert(starterObjectiveRow(obj, out.identity_ready));
    if (error) out.errors.push(`objective "${obj.goal.slice(0, 40)}…": ${error.message}`); else out.objectives.push(obj.goal);
  }
  return out;
}
