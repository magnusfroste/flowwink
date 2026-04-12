/**
 * Module Bootstraps Index
 * 
 * Import this file to register all module bootstraps.
 * 
 * All modules have been migrated to defineModule() and self-register
 * via the unified registry on import. This file only imports the
 * skill-map for backward compatibility.
 */

// Skill name mapping (imported by module-bootstrap.ts)
import './skill-map';

// ── All modules migrated to defineModule() ──
// documents, projects, contracts, hr, expenses, timesheets, invoicing, purchasing
// blog, pages, newsletter, deals, companies, forms, webinars, booking, crm, kb, media, products
// salesIntelligence, paidGrowth, resume, browserControl, federation, composio
// tickets, siteMigration, templates, developer, handbook, inventory, accounting, sla
// These are now self-contained in src/lib/modules/*-module.ts
