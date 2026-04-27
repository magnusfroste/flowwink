/**
 * Guardrail: every `manage_*` skill backed by `db:<table>` MUST expose every
 * NOT NULL column (without DB default) of that table in its tool_definition.
 *
 * Why: When a NOT NULL column is hidden from the JSON-Schema, MCP clients
 * (FlowPilot, OpenClaw, Claude Code) discover the requirement only at runtime
 * via cryptic Postgres errors and then have to "guess" undocumented param
 * names. See mem://constraints/skill-schema-must-mirror-db-not-null.
 *
 * Source of truth for column names is a snapshot fixture — regenerate via:
 *   bun run scripts/snapshot-db-not-nulls.ts
 */

import { describe, expect, it } from 'vitest';
import fixture from './fixtures/db-not-null-columns.json';
import { ALL_MODULES } from '@/lib/modules';

interface ToolProperty {
  type?: string | string[];
  description?: string;
  enum?: string[];
}

interface SkillSeed {
  name: string;
  handler?: string;
  tool_definition?: {
    function?: {
      parameters?: {
        properties?: Record<string, ToolProperty>;
        required?: string[];
      };
    };
  };
}

const NOT_NULL_TABLES = (fixture as any).tables as Record<string, string[]>;
const AUTO_FILLED = ((fixture as any)._auto_filled_columns ?? {}) as Record<
  string,
  string[]
>;

function collectManageSkills(): SkillSeed[] {
  const out: SkillSeed[] = [];
  for (const mod of ALL_MODULES as any[]) {
    const seeds: SkillSeed[] = mod.skillSeeds ?? [];
    for (const s of seeds) {
      if (s.name?.startsWith('manage_') && s.handler?.startsWith('db:')) {
        out.push(s);
      }
    }
  }
  return out;
}

describe('Skill schema NOT NULL coverage guardrails', () => {
  const skills = collectManageSkills();

  it('finds at least one db-backed manage_* skill (sanity)', () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  for (const skill of skills) {
    const table = skill.handler!.replace('db:', '');
    const requiredCols = NOT_NULL_TABLES[table];

    // Skip tables not in fixture (e.g. brand-new module — fail loudly instead)
    if (!requiredCols) {
      it(`[${skill.name}] table "${table}" must be present in fixture (regenerate snapshot)`, () => {
        expect(
          requiredCols,
          `Run: bun run scripts/snapshot-db-not-nulls.ts to refresh fixture for "${table}"`,
        ).toBeDefined();
      });
      continue;
    }

    const exemptCols = new Set(AUTO_FILLED[table] ?? []);
    const exposedProps = new Set(
      Object.keys(
        skill.tool_definition?.function?.parameters?.properties ?? {},
      ),
    );

    // Allow common alias mapping (e.g. document_id, contract_id, etc → id)
    const aliasMap: Record<string, string[]> = {
      id: [`${table.replace(/s$/, '')}_id`, 'id'],
    };

    function isExposed(col: string): boolean {
      if (exposedProps.has(col)) return true;
      const aliases = aliasMap[col];
      if (aliases?.some((a) => exposedProps.has(a))) return true;
      return false;
    }

    it(`[${skill.name}] exposes every NOT NULL column of "${table}" in tool schema`, () => {
      const missing = requiredCols
        .filter((col) => !exemptCols.has(col))
        .filter((col) => !isExposed(col));

      expect(
        missing,
        `Skill "${skill.name}" is missing tool-schema properties for NOT NULL columns ` +
          `[${missing.join(', ')}] on table "${table}". ` +
          `Either add them to tool_definition.function.parameters.properties ` +
          `(and mark required via allOf/if-then for action=create), or add them ` +
          `to "_auto_filled_columns.${table}" in db-not-null-columns.json if the ` +
          `handler/service fills them automatically (e.g. user_id from auth, ` +
          `auto-generated invoice numbers).`,
      ).toEqual([]);
    });
  }
});
