/**
 * Template Registry
 *
 * Aggregates all starter templates. Templates are authored as TypeScript
 * in this directory, then exported to JSON in /templates/ via:
 *
 *   bun run scripts/templates-to-json.ts
 *
 * ## What templates contain
 *
 * Templates seed **pages + blocks + branding + module-enables** only.
 * Operational module data (blog posts, KB articles, products, consultants,
 * leads, deals, orders, …) is NOT baked into templates — each module ships
 * its own `seed_module_demo` seeder available per-card in /admin/modules.
 *
 * ## Adding a New Template
 *
 * 1. Create `my-template.ts` in this directory
 * 2. Export a `StarterTemplate` object
 * 3. Add it to `ALL_TEMPLATES` below
 * 4. Run `bun run scripts/templates-to-json.ts`
 * 5. Run `bun run test`
 */

export type { StarterTemplate, TemplatePage, TemplateBlogPost, TemplateProduct, TemplateConsultant, HelpStyle } from './types';

export { BLANK_TEMPLATE } from './blank';
export { demoCompanyTemplate } from './demo-company';
export { flowwinkPlatformTemplate } from './flowwink-platform';
export { flowwinkAgencyTemplate } from './flowwink-agency';
export { consultAgencyTemplate } from './consult-agency';
export { digitalShopTemplate } from './digital-shop';
export { helpcenterTemplate } from './helpcenter';
export { launchpadTemplate } from './launchpad';
export { momentumTemplate } from './momentum';
export { securehealthTemplate } from './securehealth';
export { serviceProTemplate } from './service-pro';
export { trustcorpTemplate } from './trustcorp';

import { BLANK_TEMPLATE } from './blank';
import { demoCompanyTemplate } from './demo-company';
import { flowwinkPlatformTemplate } from './flowwink-platform';
import { flowwinkAgencyTemplate } from './flowwink-agency';
import { consultAgencyTemplate } from './consult-agency';
import { digitalShopTemplate } from './digital-shop';
import { helpcenterTemplate } from './helpcenter';
import { launchpadTemplate } from './launchpad';
import { momentumTemplate } from './momentum';
import { securehealthTemplate } from './securehealth';
import { serviceProTemplate } from './service-pro';
import { trustcorpTemplate } from './trustcorp';

import type { StarterTemplate } from './types';

/**
 * All available starter templates in display order.
 */
export const ALL_TEMPLATES: StarterTemplate[] = [
  BLANK_TEMPLATE,
  demoCompanyTemplate,
  flowwinkPlatformTemplate,
  flowwinkAgencyTemplate,
  consultAgencyTemplate,
  digitalShopTemplate,
  helpcenterTemplate,
  launchpadTemplate,
  momentumTemplate,
  securehealthTemplate,
  serviceProTemplate,
  trustcorpTemplate,
];

/** @deprecated Use ALL_TEMPLATES instead */
export const STARTER_TEMPLATES = ALL_TEMPLATES;

export function getTemplateById(id: string): StarterTemplate | undefined {
  return ALL_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[] {
  return ALL_TEMPLATES.filter(t => t.category === category);
}
