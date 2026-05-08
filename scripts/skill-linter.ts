/**
 * Skill Linter — kör pre-release-checklistan från
 * mem://architecture/agent-contract-integrity för en eller alla skills.
 *
 * Usage:
 *   bun run scripts/skill-linter.ts                    # lint all enabled skills
 *   bun run scripts/skill-linter.ts <skill_name>       # lint a single skill
 *   bun run scripts/skill-linter.ts --json             # machine-readable output
 *   bun run scripts/skill-linter.ts <name> --json
 *
 * Exits with code 1 if any blocking issue (severity=error) is found.
 */
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

type Severity = 'error' | 'warn' | 'info';

interface Finding {
  layer: 1 | 2 | 3 | 4;
  severity: Severity;
  rule: string;
  message: string;
  fix?: string;
}

interface SkillReport {
  skill_name: string;
  handler: string | null;
  category: string | null;
  enabled: boolean;
  mcp_exposed: boolean;
  findings: Finding[];
  ok: boolean;
}

interface LintResult {
  generated_at: string;
  total_skills: number;
  total_findings: number;
  errors: number;
  warnings: number;
  reports: SkillReport[];
}

interface AgentSkillRow {
  id: string;
  name: string;
  handler: string | null;
  category: string | null;
  enabled: boolean;
  mcp_exposed: boolean | null;
  description: string | null;
  tool_definition: any;
}

const NOT_NULL_FIXTURE = path.join(
  process.cwd(),
  'src/lib/__tests__/fixtures/db-not-null-columns.json',
);

async function lintSkills(only?: string): Promise<LintResult> {
  const client = new Client(
    process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined,
  );
  await client.connect();

  const { rows: skills } = await client.query<AgentSkillRow>(
    `
    SELECT id, name, handler, category, enabled,
           COALESCE(mcp_exposed, false) AS mcp_exposed,
           description, tool_definition
    FROM public.agent_skills
    WHERE enabled = true ${only ? 'AND name = $1' : ''}
    ORDER BY name
  `,
    only ? [only] : [],
  );

  // Pre-fetch RPC signatures
  const { rows: rpcRows } = await client.query<{ proname: string; args: string[] | string }>(`
    SELECT p.proname,
           COALESCE(array_agg(pa.parameter_name ORDER BY pa.ordinal_position)
                    FILTER (WHERE pa.parameter_name IS NOT NULL), ARRAY[]::text[]) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    LEFT JOIN information_schema.parameters pa
      ON pa.specific_name = p.proname || '_' || p.oid
    GROUP BY p.proname
  `);
  // Defensive: pg sometimes returns text[] as a literal "{a,b}" string. Normalize.
  const toArray = (v: string[] | string): string[] => {
    if (Array.isArray(v)) return v;
    const s = String(v ?? '').trim();
    if (!s || s === '{}') return [];
    return s.replace(/^\{|\}$/g, '').split(',').map((x) => x.trim()).filter(Boolean);
  };
  const rpcArgsByName = new Map(rpcRows.map((r) => [r.proname, new Set(toArray(r.args))]));

  // Pre-fetch NOT NULL columns per public table
  const { rows: notNullRows } = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND is_nullable = 'NO'
      AND column_default IS NULL
  `);
  const notNullByTable = new Map<string, Set<string>>();
  for (const { table_name, column_name } of notNullRows) {
    if (!notNullByTable.has(table_name)) notNullByTable.set(table_name, new Set());
    notNullByTable.get(table_name)!.add(column_name);
  }

  // Separately fetch the full table list — some valid tables have no NOT NULL
  // columns without defaults and would otherwise be misreported as non-existent.
  const { rows: tableRows } = await client.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const publicTables = new Set(tableRows.map((r) => r.table_name));

  const fixture = fs.existsSync(NOT_NULL_FIXTURE)
    ? JSON.parse(fs.readFileSync(NOT_NULL_FIXTURE, 'utf8'))
    : { _skill_auto_filled_columns: {} };
  const autoFilled: Record<string, string[]> = fixture._skill_auto_filled_columns ?? {};

  await client.end();

  const reports: SkillReport[] = skills.map((skill) =>
    lintSingleSkill(skill, { rpcArgsByName, notNullByTable, publicTables, autoFilled }),
  );

  const totalFindings = reports.reduce((s, r) => s + r.findings.length, 0);
  const errors = reports.reduce(
    (s, r) => s + r.findings.filter((f) => f.severity === 'error').length,
    0,
  );
  const warnings = reports.reduce(
    (s, r) => s + r.findings.filter((f) => f.severity === 'warn').length,
    0,
  );

  return {
    generated_at: new Date().toISOString(),
    total_skills: reports.length,
    total_findings: totalFindings,
    errors,
    warnings,
    reports,
  };
}

interface LintCtx {
  rpcArgsByName: Map<string, Set<string>>;
  notNullByTable: Map<string, Set<string>>;
  publicTables: Set<string>;
  autoFilled: Record<string, string[]>;
}

function lintSingleSkill(skill: AgentSkillRow, ctx: LintCtx): SkillReport {
  const findings: Finding[] = [];
  const handler = skill.handler ?? '';
  const props = skill.tool_definition?.function?.parameters?.properties ?? {};
  const propNames = Object.keys(props);
  const description = skill.description ?? '';

  // ─── Layer 1: Argument mapping (rpc:* only) ────────────────────────
  if (handler.startsWith('rpc:')) {
    const rpcName = handler.replace('rpc:', '');
    const validArgs = ctx.rpcArgsByName.get(rpcName);
    if (!validArgs) {
      findings.push({
        layer: 1,
        severity: 'error',
        rule: 'rpc-exists',
        message: `Handler points to RPC "${rpcName}" but no such function exists in public schema.`,
        fix: `Create the migration for ${rpcName}() or fix the handler value.`,
      });
    } else {
      // Apply mapRpcArgs transform
      const mapped = propNames
        .filter((k) => !k.startsWith('_') && k !== 'trace_id' && k !== 'objective_context')
        .map((k) => ({ original: k, mapped: k.startsWith('p_') ? k : `p_${k}` }));

      for (const { original, mapped: arg } of mapped) {
        if (!validArgs.has(arg)) {
          findings.push({
            layer: 1,
            severity: 'error',
            rule: 'arg-mapping',
            message: `Property "${original}" maps to "${arg}" but RPC ${rpcName} has no such parameter. Available: ${[...validArgs].join(', ') || '∅'}`,
            fix: `Rename the property to match an existing p_* arg, or add the parameter to ${rpcName}().`,
          });
        }
      }
    }
  }

  // ─── Layer 2: Schema coverage (db:* only) ──────────────────────────
  if (handler.startsWith('db:')) {
    const table = handler.replace('db:', '');
    if (!ctx.publicTables.has(table)) {
      findings.push({
        layer: 2,
        severity: 'error',
        rule: 'table-exists',
        message: `Handler points to table "${table}" but it does not exist in public schema.`,
      });
    } else {
      const required = ctx.notNullByTable.get(table) ?? new Set<string>();
      const exempt = new Set(ctx.autoFilled[skill.name] ?? []);
      const propSet = new Set(propNames);
      for (const col of required) {
        if (!propSet.has(col) && !exempt.has(col)) {
          findings.push({
            layer: 2,
            severity: 'error',
            rule: 'not-null-coverage',
            message: `Column "${col}" is NOT NULL on ${table} but missing from skill schema.`,
            fix: `Add "${col}" to tool_definition.function.parameters.properties, OR add it to _skill_auto_filled_columns.${skill.name} in db-not-null-columns.json if the handler auto-fills it.`,
          });
        }
      }

      // Per-action required check
      const params = skill.tool_definition?.function?.parameters;
      const allOf = params?.allOf ?? [];
      const writeActions = ['create', 'insert', 'add'];
      const hasActionEnum = props?.action?.enum?.some((a: string) => writeActions.includes(a));
      if (hasActionEnum) {
        const requiredForCreate = new Set<string>();
        for (const branch of allOf) {
          const constVal = branch?.if?.properties?.action?.const;
          if (writeActions.includes(constVal)) {
            for (const r of branch?.then?.required ?? []) requiredForCreate.add(r);
          }
        }
        for (const r of params?.required ?? []) requiredForCreate.add(r);
        for (const col of required) {
          if (exempt.has(col)) continue;
          if (!requiredForCreate.has(col)) {
            findings.push({
              layer: 2,
              severity: 'warn',
              rule: 'per-action-required',
              message: `Column "${col}" is NOT NULL but not marked required for write actions.`,
              fix: `Add "${col}" to allOf[if action=create].then.required.`,
            });
          }
        }
      }
    }
  }

  // ─── Layer 3: Description quality (Law 2) ──────────────────────────
  if (!description || description.length < 30) {
    findings.push({
      layer: 3,
      severity: 'warn',
      rule: 'description-too-short',
      message: `Description is ${description.length} chars — scoring algorithm needs ≥30 chars to rank reliably.`,
      fix: `Expand description to explain what the skill does and when to use it.`,
    });
  }
  if (description && !/use when:/i.test(description)) {
    findings.push({
      layer: 3,
      severity: 'warn',
      rule: 'missing-use-when',
      message: `Description lacks "Use when:" marker — skill may be selected for wrong intents.`,
      fix: `Add "Use when: <concrete trigger phrases>" to the description.`,
    });
  }
  if (description && !/not for:/i.test(description)) {
    findings.push({
      layer: 3,
      severity: 'info',
      rule: 'missing-not-for',
      message: `Description lacks "NOT for:" marker — recommended to prevent misrouting.`,
    });
  }

  // ─── Layer 4: Category & MCP exposure ──────────────────────────────
  if (!skill.category) {
    findings.push({
      layer: 4,
      severity: 'warn',
      rule: 'no-category',
      message: `Skill has no category — won't be grouped correctly in skill discovery.`,
      fix: `Set category to one of the agent_skill_category enum values.`,
    });
  }

  if (skill.mcp_exposed === false) {
    findings.push({
      layer: 4,
      severity: 'info',
      rule: 'not-mcp-exposed',
      message: `Skill is not mcp_exposed — only callable via FlowPilot, not external peers.`,
      fix: `Set mcp_exposed=true if external agents (OpenClaw/Jan/Claude Code) should call it.`,
    });
  }

  const ok = !findings.some((f) => f.severity === 'error');
  return {
    skill_name: skill.name,
    handler: skill.handler,
    category: skill.category ?? null,
    enabled: skill.enabled,
    mcp_exposed: !!skill.mcp_exposed,
    findings,
    ok,
  };
}

function formatHuman(result: LintResult, only?: string): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`🔍 Skill Linter — ${result.generated_at}`);
  lines.push(
    `Linted ${result.total_skills} skill(s) → ${result.errors} error(s), ${result.warnings} warning(s)`,
  );
  lines.push('');

  for (const r of result.reports) {
    if (only && r.skill_name !== only) continue;
    if (r.findings.length === 0) {
      lines.push(`✅ ${r.skill_name}  [${r.handler ?? 'no-handler'}]`);
      continue;
    }
    const icon = r.ok ? '⚠️ ' : '❌';
    lines.push(`${icon} ${r.skill_name}  [${r.handler ?? 'no-handler'}]`);
    for (const f of r.findings) {
      const sevIcon = f.severity === 'error' ? '  ✖' : f.severity === 'warn' ? '  ⚠' : '  ℹ';
      lines.push(`${sevIcon} L${f.layer} [${f.rule}] ${f.message}`);
      if (f.fix) lines.push(`     → fix: ${f.fix}`);
    }
    lines.push('');
  }

  lines.push('');
  lines.push(
    result.errors === 0
      ? '✓ No blocking issues — safe to release.'
      : `✗ ${result.errors} blocking issue(s) — fix before releasing.`,
  );
  lines.push('');
  return lines.join('\n');
}

// CLI entry
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const only = args.find((a) => !a.startsWith('--'));

lintSkills(only)
  .then((result) => {
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatHuman(result, only));
    }
    process.exit(result.errors > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Skill linter failed:', err);
    process.exit(2);
  });

export { lintSkills };
export type { LintResult, SkillReport, Finding };
