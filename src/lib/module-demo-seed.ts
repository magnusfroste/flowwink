/**
 * Module → demo seeder mapping.
 *
 * Maps the ModulesSettings key to the module name accepted by
 * the `seed_module_demo(module, scenario)` RPC (see migrations).
 *
 * Only modules listed here show a "Seed demo data" button in the
 * admin Modules page. Adding a new seeder = add a CASE branch in
 * the SQL dispatcher + an entry here.
 */
import type { ModulesSettings } from "@/hooks/useModules";

export const MODULE_DEMO_SEEDERS: Partial<Record<keyof ModulesSettings, string>> = {
  leads: "crm",
  quotes: "quotes",
  invoicing: "invoices",
  expenses: "expenses",
  ecommerce: "ecommerce",
  resume: "consultants",
  blog: "blog",
  knowledgeBase: "kb",
  projects: "projects",
  hr: "hr",
  tickets: "tickets",
  bookings: "bookings",
  newsletter: "newsletter",
  purchasing: "vendors",
  contracts: "contracts",
  companies: "companies",
  deals: "deals",
  recruitment: "recruitment",
  pricelists: "pricelists",
  surveys: "surveys",
};

export function getSeederForModule(
  moduleId: keyof ModulesSettings,
): string | undefined {
  return MODULE_DEMO_SEEDERS[moduleId];
}
