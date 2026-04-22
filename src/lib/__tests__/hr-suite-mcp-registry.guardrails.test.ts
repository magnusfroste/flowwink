/**
 * Pre-MCP guardrail (CI version of scripts/verify-hr-modules.ts).
 *
 * Locks in: every HR-suite module must be registered in the unified module
 * registry with at least one MCP-exposed skill. Prevents an HR module from
 * silently dropping out of the MCP surface (which would break ClawWink /
 * external orchestrators that drive HR workflows).
 */
import { describe, it, expect } from 'vitest';

// Side-effect import — registers all modules via defineModule()
import '@/lib/modules';
import { getUnifiedModule, getUnifiedSkillNames } from '@/lib/module-def';
import type { ModulesSettings } from '@/hooks/useModules';

const HR_SUITE: Array<{ id: keyof ModulesSettings; requiredSkills?: string[] }> = [
  { id: 'hr', requiredSkills: ['manage_employee'] },
  { id: 'recruitment', requiredSkills: ['hire_candidate'] },
  { id: 'expenses' },
  { id: 'timesheets' },
  { id: 'contracts' },
  { id: 'documents' },
];

describe('HR suite — pre-MCP registry guardrail', () => {
  for (const exp of HR_SUITE) {
    describe(`module: ${exp.id}`, () => {
      it('is registered in the unified module registry', () => {
        const mod = getUnifiedModule(exp.id);
        expect(
          mod,
          `Module "${exp.id}" must be registered via defineModule() and exported from src/lib/modules/index.ts`,
        ).toBeTruthy();
      });

      it('exposes at least one skill over MCP', () => {
        const skills = getUnifiedSkillNames(exp.id);
        expect(
          skills.length,
          `Module "${exp.id}" registers 0 skills — external MCP clients will not see it`,
        ).toBeGreaterThan(0);
      });

      if (exp.requiredSkills?.length) {
        it(`declares required skills: ${exp.requiredSkills.join(', ')}`, () => {
          const declared = new Set(getUnifiedSkillNames(exp.id));
          for (const s of exp.requiredSkills!) {
            expect(declared.has(s), `Missing required skill "${s}" on module "${exp.id}"`).toBe(true);
          }
        });
      }
    });
  }
});
