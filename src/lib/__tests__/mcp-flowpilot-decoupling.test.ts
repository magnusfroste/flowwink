/**
 * Guardrail: MCP and Skills bootstrapping must be DECOUPLED from FlowPilot.
 *
 * Architectural law: FlowWink is a SaaS where MCP is a platform-level capability.
 * FlowPilot is one of many possible MCP consumers (OpenClaw, ClawWink, Claude
 * Desktop, ...). Activating a module MUST seed its skills with mcp_exposed=true
 * regardless of FlowPilot's enabled state. Only `automations` (cron/event triggers
 * that FlowPilot itself runs) require FlowPilot to be on.
 *
 * See: docs/architecture/mcp-as-platform.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AnyRow = Record<string, unknown>;
const updateCalls: Array<{ table: string; values: AnyRow; filter: { col: string; values: unknown } }> = [];
const insertCalls: Array<{ table: string; rows: AnyRow[] }> = [];

function makeQuery(table: string) {
  return {
    update(values: AnyRow) {
      return {
        in: (col: string, values2: unknown[]) => {
          updateCalls.push({ table, values, filter: { col, values: values2 } });
          return Promise.resolve({ error: null });
        },
        eq: (col: string, val: unknown) => {
          updateCalls.push({ table, values, filter: { col, values: val } });
          return Promise.resolve({ error: null });
        },
      };
    },
    insert(rows: AnyRow[]) {
      insertCalls.push({ table, rows });
      return Promise.resolve({ error: null });
    },
    select(_cols: string) {
      return {
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      };
    },
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

import { bootstrapModule } from '@/lib/module-bootstrap';
// Side-effect import: registers recruitment in the unified module registry
import '@/lib/modules/recruitment-module';
import type { ModulesSettings } from '@/hooks/useModules';

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe('MCP–FlowPilot decoupling', () => {
  it('seeds/enables module skills with mcp_exposed=true even when FlowPilot is DISABLED', async () => {
    const settings = {
      flowpilot: { enabled: false },
      recruitment: { enabled: true },
    } as unknown as ModulesSettings;

    const result = await bootstrapModule('recruitment', settings);
    expect(result.errors).toEqual([]);

    // Bulk-enable by name (step 3) — runs when module is registered in unified or legacy map.
    const bulkEnable = updateCalls.find(
      (c) => c.table === 'agent_skills' && c.filter.col === 'name' && (c.values as any).enabled === true,
    );
    if (bulkEnable) {
      expect(bulkEnable.values.enabled).toBe(true);
    }

    // Step 4: per-skill seed (insert OR update) flags mcp_exposed=true.
    const inserted = insertCalls.filter((c) => c.table === 'agent_skills').flatMap((c) => c.rows);
    const perSkillUpdates = updateCalls.filter(
      (c) => c.table === 'agent_skills' && c.filter.col === 'id',
    );
    expect(inserted.length + perSkillUpdates.length, 'skill seed must run when FlowPilot is off').toBeGreaterThan(0);

    for (const row of inserted) {
      expect(row.mcp_exposed).toBe(true);
      expect(row.enabled).toBe(true);
    }
    for (const u of perSkillUpdates) {
      expect(u.values.mcp_exposed).toBe(true);
      expect(u.values.enabled).toBe(true);
    }
  });

  it('does NOT insert automations when FlowPilot is disabled (FlowPilot owns the cron loop)', async () => {
    const settings = {
      flowpilot: { enabled: false },
      recruitment: { enabled: true },
    } as unknown as ModulesSettings;

    await bootstrapModule('recruitment', settings);

    const automationInserts = insertCalls.filter((c) => c.table === 'agent_automations');
    expect(automationInserts.length).toBe(0);
  });

  it('mcp-server SKILL_CATEGORY_MODULES no longer ties `automation` or `search` to flowpilot', () => {
    const src =
      fs.readFileSync(path.join(process.cwd(), 'supabase/functions/mcp-server/index.ts'), 'utf8') +
      '\n' +
      fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/mcp/groups.ts'), 'utf8');

    const automationLine = src.match(/automation:\s*\[([^\]]*)\]/);
    expect(automationLine, 'automation category must exist').toBeTruthy();
    expect(automationLine![1]).not.toMatch(/flowpilot/);

    const searchLine = src.match(/search:\s*\[([^\]]*)\]/);
    expect(searchLine, 'search category must exist').toBeTruthy();
    expect(searchLine![1]).not.toMatch(/flowpilot/);
  });
});
