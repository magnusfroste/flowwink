/**
 * Platform Test Catalog
 *
 * Single source of truth for every test in FlowWink — runnable from the UI,
 * executed by CI, or run manually. The Platform Tests page reads this catalog
 * and presents it as a unified list, filterable by scope and module.
 *
 * Add a new module? Tests for it are auto-generated from `getAllUnifiedModules()`
 * (see `getModuleTestSuites`) — you don't need to register anything here.
 *
 * @see docs/contributing/test-suite.md — the master spec
 */

import { getAllUnifiedModules, getUnifiedSkillNames } from '@/lib/module-def';
import type { ModulesSettings } from '@/hooks/useModules';

export type TestScope = 'platform' | 'module' | 'operator' | 'guardrail';
export type TestRunMode =
  | { mode: 'edge'; function: string; payload?: Record<string, unknown> }
  | { mode: 'manual'; command: string }
  | { mode: 'docs-only' };

export interface TestSuite {
  id: string;
  title: string;
  description: string;
  scope: TestScope;
  /** Module id when scope=module */
  module?: keyof ModulesSettings | string;
  category: 'health' | 'schema' | 'skills' | 'mcp' | 'rls' | 'manifest' | 'integration' | 'behavior';
  run: TestRunMode;
  docs?: string;
  tags?: string[];
}

// ── Platform-level suites (runnable via run-platform-tests edge) ────────────

export const PLATFORM_SUITES: TestSuite[] = [
  {
    id: 'instance_health',
    title: 'Instance health',
    description: 'Verifies the database is reachable and critical tables exist (agent_skills, pages, products, site_settings).',
    scope: 'platform',
    category: 'health',
    run: { mode: 'edge', function: 'run-platform-tests', payload: { suiteIds: ['instance_health'] } },
  },
  {
    id: 'mcp_invariants',
    title: 'MCP exposure invariants',
    description: 'No orphan MCP tools (mcp_exposed=true → enabled=true). Utility skills (migrate_url, scrape_url, search_web…) are always MCP-exposed.',
    scope: 'platform',
    category: 'mcp',
    run: { mode: 'edge', function: 'run-platform-tests', payload: { suiteIds: ['mcp_invariants'] } },
    docs: 'mem://architecture/mcp-exposure-invariants',
  },
  {
    id: 'skills_health',
    title: 'Skills catalog health',
    description: 'No duplicate skill names. All enabled skills have non-trivial descriptions (≥20 chars).',
    scope: 'platform',
    category: 'skills',
    run: { mode: 'edge', function: 'run-platform-tests', payload: { suiteIds: ['skills_health'] } },
  },
  {
    id: 'rls_smoke',
    title: 'RLS smoke test',
    description: 'Anonymous client cannot read protected tables (agent_messages, agent_objectives, agent_memory, audit_logs, user_roles).',
    scope: 'platform',
    category: 'rls',
    run: { mode: 'edge', function: 'run-platform-tests', payload: { suiteIds: ['rls_smoke'] } },
  },
  {
    id: 'event_bus',
    title: 'Platform event bus roundtrip',
    description: 'emit_platform_event RPC writes a row to agent_events. Confirms the event-driven automation backbone is live.',
    scope: 'platform',
    category: 'integration',
    run: { mode: 'edge', function: 'run-platform-tests', payload: { suiteIds: ['event_bus'] } },
    docs: 'mem://architecture/event-bus-platform-layer',
  },
];

// ── Operator (FlowPilot) suites ─────────────────────────────────────────────

export const OPERATOR_SUITES: TestSuite[] = [
  {
    id: 'flowpilot_autonomy_l1_l9',
    title: 'FlowPilot autonomy (L1–L9)',
    description: 'Full reasoning suite: unit (prompt builder, tokens), integration (edge endpoints), scenarios (DB state), wiring, behavior, and L9 skill-selection accuracy benchmark.',
    scope: 'operator',
    module: 'flowpilot',
    category: 'behavior',
    run: { mode: 'docs-only' }, // lives on its own dedicated page
    docs: '/admin/autonomy-tests',
  },
];

// ── CI guardrails (cannot run from UI; documented + linked) ─────────────────

export const GUARDRAIL_SUITES: TestSuite[] = [
  {
    id: 'vitest_all',
    title: 'Vitest unit + guardrail tests',
    description: 'Pure logic, schema contracts, registry invariants, fixture diffs. Runs on every PR via CI.',
    scope: 'guardrail',
    category: 'schema',
    run: { mode: 'manual', command: 'npx vitest run' },
    docs: 'docs/contributing/test-suite.md',
  },
  {
    id: 'rpc_arg_drift',
    title: 'RPC ↔ Skill arg-mapping (Layer 1)',
    description: 'Every rpc:* skill resolves to a real pg_proc argument after p_ prefix normalization. Catches direct DB seeds that drift from RPC signatures.',
    scope: 'guardrail',
    category: 'schema',
    run: { mode: 'manual', command: 'npx vitest run src/lib/__tests__/rpc-skill-arg-drift.guardrails.test.ts' },
    docs: 'mem://architecture/agent-contract-integrity',
  },
  {
    id: 'not_null_coverage',
    title: 'Skill schema NOT NULL coverage (Layer 2)',
    description: 'Every db:<table>-backed manage_* skill exposes all required columns. Prevents agents guessing undocumented params.',
    scope: 'guardrail',
    category: 'schema',
    run: { mode: 'manual', command: 'npx vitest run src/lib/__tests__/skill-schema-not-null-coverage.guardrails.test.ts' },
  },
  {
    id: 'module_registry',
    title: 'Module registry integrity',
    description: 'Every module exported from src/lib/modules/index.ts is wired and has a valid manifest.',
    scope: 'guardrail',
    category: 'manifest',
    run: { mode: 'manual', command: 'npx vitest run src/lib/__tests__/module-registry.guardrails.test.ts' },
  },
  {
    id: 'mcp_contract',
    title: 'MCP contract — skillSeeds match exposed tools',
    description: 'MCP server\'s exposed tool list matches skillSeeds of all modules with mcp_exposed=true.',
    scope: 'guardrail',
    category: 'mcp',
    run: { mode: 'manual', command: 'npx vitest run src/lib/__tests__/mcp-contract.guardrails.test.ts' },
  },
  {
    id: 'skill_linter',
    title: 'Skill Linter (Agent Contract Integrity)',
    description: '4-layer pre-release check on every skill: arg mapping, NOT NULL coverage, value domain, module registration.',
    scope: 'guardrail',
    category: 'skills',
    run: { mode: 'manual', command: 'bun run lint:skills' },
    docs: 'mem://architecture/skill-linter',
  },
  {
    id: 'mcp_regression',
    title: 'MCP regression (live deployment)',
    description: 'End-to-end test against deployed Supabase. Runs in CI on cron + on PRs touching MCP code.',
    scope: 'guardrail',
    category: 'mcp',
    run: { mode: 'manual', command: 'npm run test:mcp-regression' },
  },
  {
    id: 'edge_function_tests',
    title: 'Deno edge function tests',
    description: 'HTTP contracts and validation logic for edge functions. Run pre-deploy.',
    scope: 'guardrail',
    category: 'integration',
    run: { mode: 'manual', command: 'supabase test functions' },
  },
];

// ── Per-module suites (auto-generated from registered modules) ──────────────

/**
 * Build a TestSuite for every registered unified module that declares skills.
 * Each suite calls run-platform-tests with the module's expected skill seeds
 * and verifies they all exist in agent_skills.
 *
 * Add a new module via defineModule() with skillSeeds → it shows up here
 * automatically. No registration step needed.
 */
export function getModuleTestSuites(): TestSuite[] {
  const suites: TestSuite[] = [];
  for (const mod of getAllUnifiedModules()) {
    const skills = getUnifiedSkillNames(mod.id);
    if (skills.length === 0) continue;
    suites.push({
      id: `module_${mod.id}_skills`,
      title: `${mod.name}: skill seeds present`,
      description: `Verifies all ${skills.length} skill seed${skills.length === 1 ? '' : 's'} declared by the ${mod.name} module exist in agent_skills.`,
      scope: 'module',
      module: mod.id,
      category: 'skills',
      run: {
        mode: 'edge',
        function: 'run-platform-tests',
        payload: {
          suiteIds: ['module_skills'],
          payload: { moduleId: mod.id, expectedSkills: skills },
        },
      },
    });
  }
  return suites.sort((a, b) => a.title.localeCompare(b.title));
}

export function getAllSuites(): TestSuite[] {
  return [
    ...PLATFORM_SUITES,
    ...OPERATOR_SUITES,
    ...getModuleTestSuites(),
    ...GUARDRAIL_SUITES,
  ];
}
