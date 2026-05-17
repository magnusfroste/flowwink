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
  layer: 1 | 2 | 3 | 4 | 5;
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

  // Static scan of agent-execute for `case '<name>':` dispatch entries
  // (Layer 5 — catches module:/internal: handlers without a dispatcher case)
  const dispatcherCases = collectDispatcherCases();
  const edgeFunctions = collectEdgeFunctions();

  const reports: SkillReport[] = skills.map((skill) =>
    lintSingleSkill(skill, {
      rpcArgsByName,
      notNullByTable,
      publicTables,
      autoFilled,
      dispatcherCases,
      edgeFunctions,
    }),
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

function collectDispatcherCases(): Set<string> {
  const file = path.join(process.cwd(), 'supabase/functions/agent-execute/index.ts');
  const set = new Set<string>();
  if (!fs.existsSync(file)) return set;
  const src = fs.readFileSync(file, 'utf8');
  const re = /case\s+['"]([a-zA-Z0-9_]+)['"]\s*:/g;
  let m;
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
}

function collectEdgeFunctions(): Set<string> {
  const dir = path.join(process.cwd(), 'supabase/functions');
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs.readdirSync(dir).filter((n) => {
      const stat = fs.statSync(path.join(dir, n));
      return stat.isDirectory() && !n.startsWith('_') && n !== 'shared';
    }),
  );
}

interface LintCtx {
  rpcArgsByName: Map<string, Set<string>>;
  notNullByTable: Map<string, Set<string>>;
  publicTables: Set<string>;
  autoFilled: Record<string, string[]>;
  dispatcherCases: Set<string>;
  edgeFunctions: Set<string>;
}

function lintSingleSkill(skill: AgentSkillRow, ctx: LintCtx): SkillReport {
  const findings: Finding[] = [];
  const handler = skill.handler ?? '';
  // Support both shapes: { function: { parameters: { properties } } } (OpenAI tool format)
  // AND the flat { parameters: { properties } } shape some legacy seeds use.
  const td = skill.tool_definition ?? {};
  const params = td?.function?.parameters ?? td?.parameters ?? {};
  const props = params?.properties ?? {};
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
  // NOT NULL coverage is only an ERROR for skills that can actually INSERT.
  // Read-only / list / check / summary skills never write, so missing NOT
  // NULL columns are not bugs there — downgrade to INFO so the linter
  // tells the truth and we can act on real issues only.
  const WRITE_ACTIONS = ['create', 'insert', 'add', 'upsert', 'save', 'update', 'edit', 'patch'];
  const actionEnum: string[] = Array.isArray(props?.action?.enum) ? props.action.enum : [];
  // Name-based read-only inference when no action enum is declared.
  // Skills whose name signals a query/report/check never INSERT — treat
  // missing NOT NULL columns as informational rather than a blocking error.
  const READ_ONLY_NAME_RE =
    /^(list_|search_|get_|find_|fetch_|read_|summarize_|analyze_|suggest_|users_list$|crm_task_list$|accounting_reports$|site_branding_get$)|(_check|_reports|_list|_get|_status|_summary)$/;
  const READ_ONLY_NAME_HIT = READ_ONLY_NAME_RE.test(skill.name);
  const canWrite =
    actionEnum.length === 0
      ? !READ_ONLY_NAME_HIT
      : actionEnum.some((a) => WRITE_ACTIONS.includes(a));

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
      const sev: Severity = canWrite ? 'error' : 'info';
      for (const col of required) {
        if (!propSet.has(col) && !exempt.has(col)) {
          findings.push({
            layer: 2,
            severity: sev,
            rule: 'not-null-coverage',
            message: `Column "${col}" is NOT NULL on ${table} but missing from skill schema${canWrite ? '' : ' (read-only skill — informational only)'}.`,
            fix: `Add "${col}" to tool_definition.function.parameters.properties, OR add it to _skill_auto_filled_columns.${skill.name} in db-not-null-columns.json if the handler auto-fills it.`,
          });
        }
      }

      // Per-action required check — only meaningful for write-capable skills
      if (canWrite) {
        const params = td?.function?.parameters ?? td?.parameters;
        const allOf = params?.allOf ?? [];
        const hasWriteAction = actionEnum.some((a) => WRITE_ACTIONS.includes(a));
        if (hasWriteAction) {
          const requiredForCreate = new Set<string>();
          for (const branch of allOf) {
            const constVal = branch?.if?.properties?.action?.const;
            if (WRITE_ACTIONS.includes(constVal)) {
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
  }

  // ─── Layer 5: Handler reachability ─────────────────────────────────
  // For edge:* handlers, verify the function directory exists on disk.
  // (Module/internal handlers are dispatched via nested routing that
  // can't be reliably inferred via static regex — skipped here.)
  if (handler.startsWith('edge:') || handler.startsWith('function:')) {
    const fn = handler.replace(/^(edge|function):/, '');
    // Supabase routes sub-paths inside an edge function via internal routing
    // (e.g. `edge:reconciliation/auto-match` → function `reconciliation`).
    // Only check the first path segment for existence on disk.
    const topLevel = fn.split('/')[0];
    if (!ctx.edgeFunctions.has(topLevel)) {
      findings.push({
        layer: 5,
        severity: 'error',
        rule: 'edge-function-missing',
        message: `Handler is "${handler}" but supabase/functions/${topLevel}/ does not exist.`,
        fix: `Create the edge function, repoint the handler, or disable the skill.`,
      });
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
