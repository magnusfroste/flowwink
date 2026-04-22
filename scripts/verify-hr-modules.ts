/**
 * Pre-MCP guardrail: verify all HR-suite modules are registered in the
 * unified module registry before running MCP tests.
 *
 * Run with:
 *   bun run scripts/verify-hr-modules.ts
 *   # or
 *   npx tsx scripts/verify-hr-modules.ts
 *
 * Exit code 0 = all good, 1 = something missing.
 *
 * What "HR suite" means here = the modules that together implement the
 * hire-to-retire process (employees, leave, payroll, attendance, skills,
 * employment contracts, recruitment bridge, expenses, timesheets).
 * Each must be in src/lib/modules/index.ts AND register itself via
 * defineModule() so its skills are exposed over MCP.
 */

// Side-effect import: triggers defineModule() for every module.
import '@/lib/modules';
import {
  getUnifiedModule,
  getAllUnifiedModules,
  getUnifiedSkillNames,
} from '@/lib/module-def';

interface Expectation {
  id: string;
  /** Skills that MUST be declared (subset check, not exact match) */
  requiredSkills?: string[];
  /** If true, missing the module is a hard error; if false, only warn */
  required?: boolean;
}

const HR_SUITE: Expectation[] = [
  { id: 'hr', required: true, requiredSkills: ['manage_employee'] },
  { id: 'recruitment', required: true, requiredSkills: ['hire_candidate'] },
  { id: 'expenses', required: true },
  { id: 'timesheets', required: true },
  { id: 'contracts', required: true },
  { id: 'documents', required: true },
];

type Issue = { module: string; severity: 'error' | 'warn'; message: string };

function verify(): Issue[] {
  const issues: Issue[] = [];
  const allIds = new Set(getAllUnifiedModules().map((m) => m.id));

  for (const exp of HR_SUITE) {
    const mod = getUnifiedModule(exp.id);
    if (!mod) {
      issues.push({
        module: exp.id,
        severity: exp.required ? 'error' : 'warn',
        message: `Not registered in unified registry. Add export to src/lib/modules/index.ts and call defineModule() in src/lib/modules/${exp.id}-module.ts.`,
      });
      continue;
    }

    if (exp.requiredSkills?.length) {
      const declared = new Set(getUnifiedSkillNames(exp.id));
      const missing = exp.requiredSkills.filter((s) => !declared.has(s));
      if (missing.length) {
        issues.push({
          module: exp.id,
          severity: 'error',
          message: `Missing required skill(s): ${missing.join(', ')}`,
        });
      }
    }

    // Each MCP-exposed module should declare at least one skill OR be a
    // pure data module (no skills). Warn if it has zero skills — likely a
    // forgotten skillSeeds block.
    const skills = getUnifiedSkillNames(exp.id);
    if (skills.length === 0) {
      issues.push({
        module: exp.id,
        severity: 'warn',
        message: 'Registered but exposes 0 skills over MCP — verify this is intentional.',
      });
    }
  }

  // Bonus: list any HR-related modules that exist on disk but aren't in the
  // expected list (helps catch new HR modules that should be tracked here).
  const hrAdjacent = ['attendance', 'skills', 'employment_contracts', 'payroll'];
  for (const id of hrAdjacent) {
    if (allIds.has(id)) {
      issues.push({
        module: id,
        severity: 'warn',
        message: `Module "${id}" is registered — consider adding it to HR_SUITE in scripts/verify-hr-modules.ts.`,
      });
    }
  }

  return issues;
}

function main() {
  const issues = verify();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Pre-MCP HR module registry check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const exp of HR_SUITE) {
    const mod = getUnifiedModule(exp.id);
    const skills = mod ? getUnifiedSkillNames(exp.id) : [];
    const status = mod ? '✓' : '✗';
    console.log(
      `  ${status}  ${exp.id.padEnd(16)} ${mod ? `${skills.length} skill(s)` : 'NOT REGISTERED'}`,
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warn');

  if (warnings.length) {
    console.log('\n  Warnings:');
    for (const w of warnings) console.log(`    ⚠  [${w.module}] ${w.message}`);
  }

  if (errors.length) {
    console.log('\n  Errors:');
    for (const e of errors) console.log(`    ✗  [${e.module}] ${e.message}`);
    console.log('\n  ❌ HR module registry check FAILED — fix before running MCP tests.\n');
    process.exit(1);
  }

  console.log('\n  ✅ All HR modules registered. Safe to run MCP tests.\n');
}

main();
