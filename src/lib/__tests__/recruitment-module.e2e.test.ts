/**
 * E2E guardrail: Recruitment module toggle → bootstrap → MCP exposure.
 *
 * Verifies the full chain that lets ClawWink (external orchestrator) drive
 * recruitment autonomously:
 *  1. The unified module declares exactly 7 skills (incl. hire_candidate bridge to HR).
 *  2. bootstrapModule('recruitment', ...) seeds/updates each of those 7 skills
 *     with enabled=true AND mcp_exposed=true.
 *  3. The MCP server maps `recruitment` into a category group so the skills
 *     are exposed via /rest/groups and tool-listing for external callers.
 *  4. teardownModule('recruitment') disables them again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Supabase mock ───────────────────────────────────────────────────────────
type AnyRow = Record<string, unknown>;
const updateCalls: Array<{ table: string; values: AnyRow; filter: { col: string; values: unknown } }> = [];
const insertCalls: Array<{ table: string; rows: AnyRow[] }> = [];
const existingSkills = new Set<string>(); // names that "already exist" in DB

function makeQuery(table: string) {
  return {
    update(values: AnyRow) {
      return {
        in: (col: string, values2: unknown[]) => {
          updateCalls.push({ table, values, filter: { col, values: values2 } });
          return Promise.resolve({ error: null });
        },
        eq: (_col: string, _val: unknown) => {
          updateCalls.push({ table, values, filter: { col: _col, values: _val } });
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
        eq: (_col: string, val: unknown) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: existingSkills.has(String(val)) ? { id: `existing-${val}` } : null,
              error: null,
            }),
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

// Import AFTER mock is registered
import { bootstrapModule, teardownModule } from '@/lib/module-bootstrap';
import { recruitmentModule } from '@/lib/modules/recruitment-module';
import type { ModulesSettings } from '@/hooks/useModules';

const RECRUITMENT_SKILLS = [
  'manage_job_posting',
  'parse_resume',
  'score_candidate',
  'move_application_stage',
  'draft_candidate_outreach',
  'hire_candidate',
  'hire_application',
  'summarize_candidate_pipeline',
];

const allModulesEnabled = {
  flowpilot: { enabled: true },
  recruitment: { enabled: true },
} as unknown as ModulesSettings;

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  existingSkills.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('recruitment module — end-to-end autonomy contract', () => {
  it('declares exactly the 8 ClawWink-callable skills in its manifest', () => {
    expect(recruitmentModule.skills).toEqual(RECRUITMENT_SKILLS);
    expect(recruitmentModule.skillSeeds).toBeDefined();
    expect(recruitmentModule.skillSeeds!.map((s) => s.name).sort()).toEqual(
      [...RECRUITMENT_SKILLS].sort(),
    );
  });

  it('on enable: inserts all 8 skills with enabled=true AND mcp_exposed=true', async () => {
    // None exist yet → INSERT path
    const result = await bootstrapModule('recruitment', allModulesEnabled);

    expect(result.errors).toEqual([]);

    const inserted = insertCalls
      .filter((c) => c.table === 'agent_skills')
      .flatMap((c) => c.rows);

    expect(inserted).toHaveLength(8);
    for (const name of RECRUITMENT_SKILLS) {
      const row = inserted.find((r) => r.name === name);
      expect(row, `skill ${name} must be inserted`).toBeTruthy();
      expect(row!.enabled, `${name} must be enabled`).toBe(true);
      expect(row!.mcp_exposed, `${name} must be MCP-exposed for ClawWink`).toBe(true);
      expect(row!.tool_definition, `${name} needs a tool_definition for tool-calling`).toBeTruthy();
    }
  });

  it('on re-enable: updates existing skills back to enabled + mcp_exposed', async () => {
    // Pretend all 7 already exist
    for (const n of RECRUITMENT_SKILLS) existingSkills.add(n);

    const result = await bootstrapModule('recruitment', allModulesEnabled);
    expect(result.errors).toEqual([]);

    const perSkillUpdates = updateCalls.filter(
      (c) => c.table === 'agent_skills' && c.filter.col === 'id',
    );
    expect(perSkillUpdates.length).toBe(8);
    for (const u of perSkillUpdates) {
      expect(u.values.enabled).toBe(true);
      expect(u.values.mcp_exposed).toBe(true);
    }
  });

  it('teardown disables the 8 skills (without deleting them)', async () => {
    await teardownModule('recruitment');
    const disable = updateCalls.find(
      (c) =>
        c.table === 'agent_skills' &&
        c.filter.col === 'name' &&
        Array.isArray(c.filter.values) &&
        (c.filter.values as string[]).includes('score_candidate'),
    );
    expect(disable, 'teardown must bulk-disable recruitment skills by name').toBeTruthy();
    expect(disable!.values.enabled).toBe(false);
    expect((disable!.filter.values as string[]).sort()).toEqual([...RECRUITMENT_SKILLS].sort());
  });

  it('MCP server maps `recruitment` into a group so ClawWink can discover the skills', () => {
    const mcpSrc =
      fs.readFileSync(path.join(process.cwd(), 'supabase/functions/mcp-server/index.ts'), 'utf8') +
      '\n' +
      fs.readFileSync(path.join(process.cwd(), 'supabase/functions/_shared/mcp/groups.ts'), 'utf8');
    // Group registration — required for ?groups=recruitment routing
    expect(mcpSrc).toMatch(/"recruitment"/);
    // And it must live in a category bucket (crm) that the MCP server iterates
    const crmLine = mcpSrc.match(/crm:\s*\[[^\]]*\]/);
    expect(crmLine, 'CRM category group must exist').toBeTruthy();
    expect(crmLine![0]).toContain('"recruitment"');
  });
});
