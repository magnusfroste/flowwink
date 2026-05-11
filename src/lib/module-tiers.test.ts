/**
 * Guardrail: enforce module tier budget + classification.
 *
 * This test is the OpenClaw-prevention measure: it fails CI the moment
 * someone adds a 9th `core` module without an explicit architectural review
 * (raising CORE_TIER_BUDGET in src/lib/module-tiers.ts).
 *
 * @see mem://architecture/module-tiers
 */
import { describe, it, expect } from 'vitest';
import {
  auditModuleTiers,
  CORE_TIER_BUDGET,
  MODULE_TIER_MAP,
  TIER_META,
  MODULE_TIERS,
} from '@/lib/module-tiers';
import { getAllUnifiedModules } from '@/lib/module-def';

// Force-import the registry so every defineModule() runs.
import '@/lib/modules';

describe('module tiers', () => {
  const declared = getAllUnifiedModules().map((m) => String(m.id));
  const audit = auditModuleTiers(declared);

  it('respects the core tier budget', () => {
    expect(
      audit.budgetExceeded,
      `Core tier has ${audit.coreCount} modules (budget: ${CORE_TIER_BUDGET}). ` +
        `Core: ${audit.byTier.core.join(', ')}. ` +
        `Adding a core module is an architectural decision — bump CORE_TIER_BUDGET ` +
        `in src/lib/module-tiers.ts only after review.`,
    ).toBe(false);
  });

  it('uses only known tier values', () => {
    for (const [id, tier] of Object.entries(MODULE_TIER_MAP)) {
      expect(MODULE_TIERS, `unknown tier "${tier}" for module "${id}"`).toContain(tier);
    }
  });

  it('has metadata for every tier', () => {
    for (const tier of MODULE_TIERS) {
      expect(TIER_META[tier]).toBeDefined();
    }
  });

  it('warns about unclassified modules (soft check)', () => {
    if (audit.unclassified.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[module-tiers] ${audit.unclassified.length} module(s) not in MODULE_TIER_MAP ` +
          `— defaulting to 'standard': ${audit.unclassified.join(', ')}`,
      );
    }
    // Soft: don't fail, just surface so contributors notice.
    expect(audit.unclassified.length).toBeLessThanOrEqual(declared.length);
  });
});
