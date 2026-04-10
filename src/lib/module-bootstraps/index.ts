/**
 * Module Bootstraps Index
 * 
 * Import this file to register all module bootstraps.
 * Each module file calls registerBootstrap() on import.
 * 
 * The skill-map (skill-map.ts) handles name-based enable/disable
 * for ALL modules, even those without a dedicated bootstrap file.
 */

// Skill name mapping (imported by module-bootstrap.ts)
import './skill-map';

// Modules with dedicated bootstraps (seedData, full SkillSeed definitions, automations):
import './accounting';
import './expenses';
import './timesheets';
import './purchasing';

// Future modules with custom seedData can add their bootstrap here:
// import './invoicing';
// import './ecommerce';  // e.g. seed default shipping methods
// import './bookings';   // e.g. seed default availability hours
