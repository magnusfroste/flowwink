/**
 * Pre-MCP guardrail: verify all HR-suite modules are wired into the unified
 * registry before running MCP tests.
 *
 * Pure static analysis — no runtime, no env vars, no Supabase client. Reads:
 *   - src/lib/modules/index.ts          (must export each HR module)
 *   - src/lib/modules/<id>-module.ts    (must call defineModule({ id: '<id>' }))
 *
 * Usage:
 *   bun run scripts/verify-hr-modules.ts
 *   node --experimental-strip-types scripts/verify-hr-modules.ts
 *
 * Exit 0 = OK. Exit 1 = a required HR module is missing.
 *
 * Mirrored at runtime by src/lib/__tests__/hr-suite-mcp-registry.guardrails.test.ts
 * which validates the actual unified registry (defineModule() calls).
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, 'src/lib/modules');
const INDEX_FILE = path.join(MODULES_DIR, 'index.ts');

interface Expectation {
  /** ModulesSettings key — must match defineModule({ id }) */
  id: string;
  /** Camel-case export name expected in modules/index.ts */
  exportName: string;
  /** Source file under src/lib/modules/ */
  file: string;
}

const HR_SUITE: Expectation[] = [
  { id: 'hr',           exportName: 'hrModule',          file: 'hr-module.ts' },
  { id: 'recruitment',  exportName: 'recruitmentModule', file: 'recruitment-module.ts' },
  { id: 'expenses',     exportName: 'expensesModule',    file: 'expenses-module.ts' },
  { id: 'timesheets',   exportName: 'timesheetsModule',  file: 'timesheets-module.ts' },
  { id: 'contracts',    exportName: 'contractsModule',   file: 'contracts-module.ts' },
  { id: 'documents',    exportName: 'documentsModule',   file: 'documents-module.ts' },
];

type Issue = { module: string; message: string };

function check(): { issues: Issue[]; ok: number } {
  const issues: Issue[] = [];
  let ok = 0;

  if (!fs.existsSync(INDEX_FILE)) {
    issues.push({ module: '*', message: `Missing ${INDEX_FILE}` });
    return { issues, ok };
  }
  const indexSrc = fs.readFileSync(INDEX_FILE, 'utf8');

  for (const exp of HR_SUITE) {
    const filePath = path.join(MODULES_DIR, exp.file);

    if (!fs.existsSync(filePath)) {
      issues.push({ module: exp.id, message: `Source file missing: src/lib/modules/${exp.file}` });
      continue;
    }
    const src = fs.readFileSync(filePath, 'utf8');

    // 1. Must call defineModule(...) AND declare id: '<id>'
    const hasDefine = /defineModule\s*[<(]/.test(src);
    const hasId = new RegExp(`\\bid\\s*:\\s*['"\`]${exp.id}['"\`]`).test(src);
    if (!hasDefine || !hasId) {
      issues.push({
        module: exp.id,
        message: `${exp.file} does not call defineModule({ id: '${exp.id}', ... })`,
      });
      continue;
    }

    // 2. Re-exported from modules/index.ts
    const exportRe = new RegExp(`export\\s*\\{[^}]*\\b${exp.exportName}\\b[^}]*\\}\\s*from\\s*['"]\\./${exp.file.replace('.ts', '')}['"]`);
    if (!exportRe.test(indexSrc)) {
      issues.push({
        module: exp.id,
        message: `Not re-exported from src/lib/modules/index.ts as "${exp.exportName}"`,
      });
      continue;
    }

    ok++;
  }

  return { issues, ok };
}

function main() {
  const { issues, ok } = check();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Pre-MCP HR module registry check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const exp of HR_SUITE) {
    const failed = issues.find((i) => i.module === exp.id);
    const mark = failed ? '✗' : '✓';
    console.log(`  ${mark}  ${exp.id.padEnd(14)} (${exp.exportName})`);
  }
  console.log(`\n  ${ok}/${HR_SUITE.length} HR modules registered.`);

  if (issues.length) {
    console.log('\n  Issues:');
    for (const i of issues) console.log(`    ✗  [${i.module}] ${i.message}`);
    console.log('\n  ❌ HR module registry check FAILED — fix before running MCP tests.\n');
    process.exit(1);
  }

  console.log('\n  ✅ All HR modules registered. Safe to run MCP tests.\n');
}

main();
