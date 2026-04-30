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
 * Snapshot lives in fixtures/rpc-skill-args.json and reflects the LIVE
 * agent_skills + pg_proc state (including skills that are seeded directly
 * into the DB without a corresponding skillSeeds entry in code).
 *
 * Regenerate after any RPC signature change OR new rpc:* skill via:
 *   bun run scripts/snapshot-rpc-skill-args.ts
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/rpc-skill-args.json';
import * as modules from '@/lib/modules';

interface RpcEntry {
  skill_name: string;
  rpc_name: string;
  pg_args: string[];
  /** Top-level keys in tool_definition.function.parameters.properties (raw, unmapped). */
  skill_props: string[];
}

interface SkillSeed {
  name: string;
  handler?: string;
  tool_definition?: {
    function?: {
      parameters?: {
        properties?: Record<string, unknown>;
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

describe('rpc skill ↔ pg_proc arg mapping (live snapshot)', () => {
  it('every rpc:* skill in the live DB resolves all declared properties to a real RPC argument', () => {
    const drift: string[] = [];

    for (const entry of fixture as RpcEntry[]) {
      const mapped = mapRpcArgs(entry.skill_props);
      const validArgs = new Set(entry.pg_args);

      for (const arg of mapped) {
        if (!validArgs.has(arg)) {
          const original =
            entry.skill_props.find((d) => (d.startsWith('p_') ? d : `p_${d}`) === arg) ?? arg;
          drift.push(
            `Skill "${entry.skill_name}" → declares "${original}" ` +
              `which mapRpcArgs() converts to "${arg}", but RPC ${entry.rpc_name}(${entry.pg_args.join(', ') || '∅'}) has no such parameter.`,
          );
        }
      }
    }

    expect(drift, '\n' + drift.join('\n')).toEqual([]);
  });

  it('skills present in code seeds also match the live snapshot (no stale code definitions)', () => {
    const fixtureByName = new Map<string, RpcEntry>(
      (fixture as RpcEntry[]).map((e) => [e.skill_name, e]),
    );

    const drift: string[] = [];
    const pendingSeed: string[] = [];
    for (const seed of collectSkillSeeds()) {
      if (!seed.handler?.startsWith('rpc:')) continue;
      const entry = fixtureByName.get(seed.name);
      if (!entry) {
        // Skill exists in code but not yet in the live DB snapshot.
        // This happens between adding a skillSeed and module-bootstrap
        // running in production. Not a drift — just informational.
        pendingSeed.push(seed.name);
        continue;
      }
      const codeProps = Object.keys(seed.tool_definition?.function?.parameters?.properties ?? {}).sort();
      const liveProps = [...entry.skill_props].sort();
      if (JSON.stringify(codeProps) !== JSON.stringify(liveProps)) {
        drift.push(
          `Code seed "${seed.name}" properties [${codeProps.join(',')}] differ from live DB [${liveProps.join(',')}].`,
        );
      }
    }

    if (pendingSeed.length > 0) {
      console.info(
        `[rpc-skill-arg-drift] ${pendingSeed.length} code seed(s) pending DB bootstrap (not drift): ${pendingSeed.join(', ')}`,
      );
    }

    expect(drift, '\n' + drift.join('\n')).toEqual([]);
  });
});
