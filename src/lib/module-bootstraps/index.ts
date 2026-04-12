/**
 * Module Bootstraps Index
 * 
 * Import this file to register all module bootstraps.
 * Each module file calls registerBootstrap() on import.
 * 
 * The skill-map (skill-map.ts) handles name-based enable/disable
 * for ALL modules, even those without a dedicated bootstrap file.
 * 
 * Modules migrated to defineModule() no longer need entries here — 
 * they self-register via the unified registry on import.
 */

// Skill name mapping (imported by module-bootstrap.ts)
import './skill-map';

// Legacy modules with dedicated bootstraps (not yet migrated to defineModule):
import './accounting';

// ── Migrated to defineModule() ──
// documents, projects, contracts, hr, expenses, timesheets, invoicing, purchasing
// These are now self-contained in src/lib/modules/*-module.ts

// Future modules with custom seedData can add their bootstrap here:
// import './ecommerce';  // e.g. seed default shipping methods
// import './bookings';   // e.g. seed default availability hours
