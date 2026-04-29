/**
 * Guardrail: every `rpc:*` skill's tool_definition parameters MUST resolve
 * (after agent-execute's mapRpcArgs) to argument names that exist on the
 * underlying Postgres function.
 *
 * Why: agent-execute strips `_`-prefixed args and prefixes everything else
 * with `p_`. If a skill schema declares `period` and the RPC expects
 * `p_my_period`, the call silently fails at runtime. A missing arg name
 * is unreachable from MCP/FlowPilot — this test catches the drift in CI
 * instead of in production.
 *
 * Snapshot lives in fixtures/rpc-skill-args.json. Regenerate via:
 *   bun run scripts/snapshot-rpc-skill-args.ts
 *
 * To pull the live current state of agent_skills + pg_proc, import is
 * pure JSON so the test runs offline in CI without DB access.
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/rpc-skill-args.json';
import * as modules from '@/lib/modules';

interface RpcEntry {
  skill_name: string;
  rpc_name: string;
  pg_args: string[];
}

interface SkillSeed {
  name: string;
  handler?: string;
  tool_definition?: {
    function?: {
      parameters?: {
        properties?: Record<string, unknown>;
        required?: string[];
      };
    };
  };
}

/** Mirror of supabase/functions/agent-execute/index.ts mapRpcArgs */
function mapRpcArgs(args: string[]): string[] {
  return args
    .filter((k) => !k.startsWith('_') && k !== 'trace_id' && k !== 'objective_context')
    .map((k) => (k.startsWith('p_') ? k : `p_${k}`));
}

function collectSkillSeeds(): SkillSeed[] {
  const out: SkillSeed[] = [];
  for (const exported of Object.values(modules) as unknown[]) {
    if (!exported || typeof exported !== 'object') continue;
    const seeds = (exported as { skillSeeds?: SkillSeed[] }).skillSeeds;
    if (!Array.isArray(seeds)) continue;
    for (const s of seeds) {
      if (s && typeof s === 'object' && typeof s.name === 'string') out.push(s);
    }
  }
  return out;
}

const fixtureByName = new Map<string, RpcEntry>(
  (fixture as RpcEntry[]).map((e) => [e.skill_name, e]),
);

describe('rpc skill ↔ pg_proc arg mapping', () => {
  it('every rpc:* skill in the live snapshot has all its declared properties resolvable to a real RPC argument', () => {
    const drift: string[] = [];

    for (const entry of fixture as RpcEntry[]) {
      const seed = collectSkillSeeds().find((s) => s.name === entry.skill_name);
      // Some skills are seeded directly into the DB (not via skillSeeds).
      // Use the live-DB schema embedded in the fixture's pg_args as the
      // contract — but we can only check skills that ALSO have a seed in
      // code, which is what CI is meant to lock down.
      if (!seed) continue;

      const props = seed.tool_definition?.function?.parameters?.properties ?? {};
      const declared = Object.keys(props);
      const mapped = mapRpcArgs(declared);
      const validArgs = new Set(entry.pg_args);

      for (const arg of mapped) {
        if (!validArgs.has(arg)) {
          drift.push(
            `Skill "${entry.skill_name}" → declares "${declared.find((d) => (d.startsWith('p_') ? d : `p_${d}`) === arg) ?? arg}" ` +
              `which mapRpcArgs() converts to "${arg}", but RPC ${entry.rpc_name}(${entry.pg_args.join(', ') || '∅'}) has no such parameter.`,
          );
        }
      }
    }

    expect(drift, drift.join('\n')).toEqual([]);
  });

  it('snapshot fixture covers every rpc:* skill that exists in the codebase seeds', () => {
    const codeSeeds = collectSkillSeeds().filter((s) => s.handler?.startsWith('rpc:'));
    const missing = codeSeeds
      .filter((s) => !fixtureByName.has(s.name))
      .map((s) => s.name);

    // Skills only-in-code that aren't in the snapshot mean the snapshot is
    // stale. Re-run scripts/snapshot-rpc-skill-args.ts.
    expect(
      missing,
      `Snapshot is stale — the following rpc:* skills exist in code but not in fixtures/rpc-skill-args.json:\n  ${missing.join('\n  ')}\nRegenerate via: bun run scripts/snapshot-rpc-skill-args.ts`,
    ).toEqual([]);
  });
});
