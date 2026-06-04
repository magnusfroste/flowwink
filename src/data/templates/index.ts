/**
 * Template Registry
 *
 * Aggregates all starter templates. Templates are authored as TypeScript
 * in this directory, then exported to JSON in /templates/ via:
 *
 *   bun run scripts/templates-to-json.ts
 *
 * The JSON files are the portable distribution format used by the
 * import/export engine and community contributions.
 *
 * ## Curated set
 *
 * We intentionally keep this list short. Operational demo data (consultants,
 * leads, deals, orders, expenses, …) is no longer baked into templates —
 * each module ships its own `seed_module_demo` seeder, available per-card
 * in /admin/modules. Templates should focus on visual identity:
 * pages, blocks, blog, KB, branding and FlowPilot soul.
 *
 * ## Adding a New Template
 *
 * 1. Create a new `.ts` file in this directory (e.g. `my-template.ts`)
 * 2. Export a `StarterTemplate` object from it
 * 3. Import and add it to `ALL_TEMPLATES` below
 * 4. Run `bun run scripts/templates-to-json.ts` to generate JSON
 * 5. Run `bun run test` to validate
 */

// Re-export types for convenience
export type { StarterTemplate, TemplatePage, TemplateBlogPost, TemplateProduct, TemplateConsultant, HelpStyle } from './types';

// Individual template re-exports
export { BLANK_TEMPLATE } from './blank';
export { demoCompanyTemplate } from './demo-company';
export { flowwinkPlatformTemplate } from './flowwink-platform';
export { flowwinkAgencyTemplate } from './flowwink-agency';

// Import for aggregation
import { BLANK_TEMPLATE } from './blank';
import { demoCompanyTemplate } from './demo-company';
import { flowwinkPlatformTemplate } from './flowwink-platform';
import { flowwinkAgencyTemplate } from './flowwink-agency';

import type { StarterTemplate } from './types';

/**
 * All available starter templates in display order.
 */
export const ALL_TEMPLATES: StarterTemplate[] = [
  BLANK_TEMPLATE,
  demoCompanyTemplate,
  flowwinkPlatformTemplate,
  flowwinkAgencyTemplate,
];

/** @deprecated Use ALL_TEMPLATES instead */
export const STARTER_TEMPLATES = ALL_TEMPLATES;

// Helper functions
export function getTemplateById(id: string): StarterTemplate | undefined {
  return ALL_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return ALL_TEMPLATES.filter(t => t.category === category);
}
