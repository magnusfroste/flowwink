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
 * ## Adding a New Template
 * 
 * 1. Create a new `.ts` file in this directory (e.g. `my-template.ts`)
 * 2. Export a `StarterTemplate` object from it  
 * 3. Import and add it to `ALL_TEMPLATES` below
 * 4. Run `bun run scripts/templates-to-json.ts` to generate JSON
 * 5. Run `bun run test` to validate
 * 
 * See docs/TEMPLATE-AUTHORING.md for the full block reference.
 * See templates/README.md for JSON contribution guidelines.
 */

// Re-export types for convenience
export type { StarterTemplate, TemplatePage, TemplateBlogPost, TemplateProduct, TemplateConsultant, HelpStyle } from './types';

// Individual template re-exports
export { launchpadTemplate } from './launchpad';
export { momentumTemplate } from './momentum';
export { trustcorpTemplate } from './trustcorp';
export { securehealthTemplate } from './securehealth';
export { flowwinkPlatformTemplate } from './flowwink-platform';
export { helpCenterTemplate } from './helpcenter';
export { serviceProTemplate } from './service-pro';
export { digitalShopTemplate } from './digital-shop';
export { flowwinkAgencyTemplate } from './flowwink-agency';
export { BLANK_TEMPLATE } from './blank';
export { consultAgencyTemplate } from './consult-agency';
export { demoCompanyTemplate } from './demo-company';

// Import for aggregation
import { launchpadTemplate } from './launchpad';
import { momentumTemplate } from './momentum';
import { trustcorpTemplate } from './trustcorp';
import { securehealthTemplate } from './securehealth';
import { flowwinkPlatformTemplate } from './flowwink-platform';
import { helpCenterTemplate } from './helpcenter';
import { serviceProTemplate } from './service-pro';
import { digitalShopTemplate } from './digital-shop';
import { flowwinkAgencyTemplate } from './flowwink-agency';
import { consultAgencyTemplate } from './consult-agency';
import { demoCompanyTemplate } from './demo-company';

import type { StarterTemplate } from './types';

/**
 * All available starter templates in display order.
 * 
 * These are the TypeScript-authored templates (source of truth).
 * Run `bun run scripts/templates-to-json.ts` to export to /templates/*.json
 */
export const ALL_TEMPLATES: StarterTemplate[] = [
  launchpadTemplate,
  momentumTemplate,
  trustcorpTemplate,
  securehealthTemplate,
  flowwinkPlatformTemplate,
  helpCenterTemplate,
  serviceProTemplate,
  digitalShopTemplate,
  flowwinkAgencyTemplate,
  consultAgencyTemplate,
  demoCompanyTemplate,
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
