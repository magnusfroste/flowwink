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
import * as modules from '@/lib/modules';

interface ToolProperty {
  type?: string | string[];
  description?: string;
  enum?: string[];
}

interface JsonSchemaNode {
  properties?: Record<string, ToolProperty>;
  required?: string[];
  /**
   * Legacy pattern — kept for backwards compat. New skills should use
   * `x-action-required` instead because top-level allOf/if-then breaks
   * OpenAI gpt-4.1 strict tool-calling (HTTP 400).
   */
  allOf?: Array<{
    if?: { properties?: Record<string, { const?: string; enum?: string[] }> };
    then?: { required?: string[]; properties?: Record<string, ToolProperty> };
  }>;
  oneOf?: JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  /**
   * OpenAI-safe alternative to allOf/if-then. Maps action enum value → list
   * of additionally-required field names. Read by the guardrail and by the
   * runtime handler. Invisible to MCP clients but kept inside the schema
   * (JSON-Schema permits unknown `x-*` extensions).
   */
  'x-action-required'?: Record<string, string[]>;
}

interface SkillSeed {
  name: string;
  handler?: string;
  tool_definition?: {
    function?: {
      parameters?: JsonSchemaNode;
    };
  };
}

/** Collect the set of `action` enum values declared on the skill. */
function getActions(params: JsonSchemaNode | undefined): string[] {
  const actionProp = params?.properties?.action as ToolProperty | undefined;
  return actionProp?.enum ?? [];
}

/** Compute which fields are required for a given action value, considering allOf/if-then branches AND the x-action-required extension. */
function requiredForAction(
  params: JsonSchemaNode | undefined,
  action: string,
): Set<string> {
  const required = new Set<string>(params?.required ?? []);
  // Legacy allOf/if-then branches
  for (const branch of params?.allOf ?? []) {
    const ifAction = branch.if?.properties?.action;
    if (!ifAction) continue;
    const matches =
      ifAction.const === action ||
      (Array.isArray(ifAction.enum) && ifAction.enum.includes(action));
    if (matches) {
      for (const f of branch.then?.required ?? []) required.add(f);
    }
  }
  // OpenAI-safe x-action-required extension
  const xActionRequired = params?.['x-action-required'];
  if (xActionRequired && Array.isArray(xActionRequired[action])) {
    for (const f of xActionRequired[action]) required.add(f);
  }
  return required;
}

const NOT_NULL_TABLES = (fixture as any).tables as Record<string, string[]>;
const SKILL_AUTO_FILLED = ((fixture as any)._skill_auto_filled_columns ?? {}) as Record<
  string,
  string[]
>;

function collectManageSkills(): SkillSeed[] {
  const out: SkillSeed[] = [];
  for (const exported of Object.values(modules) as any[]) {
    if (!exported || typeof exported !== 'object') continue;
    const seeds: SkillSeed[] | undefined = exported.skillSeeds;
    if (!Array.isArray(seeds)) continue;
    for (const s of seeds) {
      if (!s || typeof s !== 'object') continue;
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

    const exemptCols = new Set(SKILL_AUTO_FILLED[skill.name] ?? []);
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
          `to "_skill_auto_filled_columns.${skill.name}" in db-not-null-columns.json ` +
          `if the handler/service fills them automatically (e.g. user_id from auth, ` +
          `auto-generated invoice numbers, update-only skills).`,
      ).toEqual([]);
    });

    // ── Per-action `required` enforcement ──────────────────────────────────
    // For each *write* action declared on the skill, verify NOT NULL columns
    // (minus skill-exempt + alias-resolved) are listed in `required` (either
    // top-level or inside an allOf/if-then branch matching that action).
    const params = skill.tool_definition?.function?.parameters;
    const actions = getActions(params);
    const WRITE_ACTIONS = new Set(['create', 'insert', 'add']);
    const writeActions = actions.filter((a) => WRITE_ACTIONS.has(a));

    for (const action of writeActions) {
      it(`[${skill.name}] marks NOT NULL columns as required for action="${action}"`, () => {
        const required = requiredForAction(params, action);
        const aliasResolvedRequired = (col: string): boolean => {
          if (required.has(col)) return true;
          const aliases = aliasMap[col];
          return aliases?.some((a) => required.has(a)) ?? false;
        };

        const notRequired = requiredCols
          .filter((col) => !exemptCols.has(col))
          .filter((col) => isExposed(col)) // already covered by other test if missing
          .filter((col) => !aliasResolvedRequired(col));

        expect(
          notRequired,
          `Skill "${skill.name}" exposes NOT NULL columns [${notRequired.join(', ')}] ` +
            `but does not mark them as required for action="${action}". ` +
            `RECOMMENDED (OpenAI-safe — flat top-level schema):\n` +
            `  parameters: { type: 'object', properties: {...}, required: ['action'],\n` +
            `    'x-action-required': { ${action}: [${notRequired.map((c) => `'${c}'`).join(', ')}] } }\n` +
            `LEGACY (allOf/if-then — breaks gpt-4.1 strict tool-calling):\n` +
            `  allOf: [{ if: { properties: { action: { const: "${action}" } } }, ` +
            `then: { required: ["action", ${notRequired.map((c) => `"${c}"`).join(', ')}] } }]\n` +
            `Or, if the handler fills it automatically, add to ` +
            `"_skill_auto_filled_columns.${skill.name}" in db-not-null-columns.json.`,
        ).toEqual([]);
      });
    }
  }
});
