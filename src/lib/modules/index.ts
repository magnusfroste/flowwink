/**
 * Module Index
 * 
 * Central export for all FlowWink modules.
 * All modules use defineModule() for unified registration.
 * 
 * @see src/lib/module-def.ts for the unified system
 */

// ── Content ──
export { blogModule } from './blog-module';
export { pagesModule } from './pages-module';
export { kbModule } from './kb-module';
export { mediaModule } from './media-module';
export { newsletterModule } from './newsletter-module';
export { handbookModule } from './handbook-module';
export { templatesModule } from './templates-module';

// ── CRM / Data ──
export { crmModule } from './crm-module';
export { dealsModule } from './deals-module';
export { companiesModule } from './companies-module';
export { formsModule } from './forms-module';
export { bookingModule } from './booking-module';
export { productsModule } from './products-module';
export { inventoryModule } from './inventory-module';

// ── Communication ──
export { chatModule } from './chat-module';
export { liveSupportModule } from './live-support-module';
export { webinarsModule } from './webinars-module';

// ── Insights ──
export { analyticsModule } from './analytics-module';
export { companyInsightsModule } from './company-insights-module';

// ── Operations ──
export { invoicingModule } from './invoicing-module';
export { accountingModule } from './accounting-module';
export { expensesModule } from './expenses-module';
export { timesheetsModule } from './timesheets-module';
export { purchasingModule } from './purchasing-module';
export { contractsModule } from './contracts-module';
export { hrModule } from './hr-module';
export { documentsModule } from './documents-module';
export { projectsModule } from './projects-module';
export { slaModule } from './sla-module';

// ── Growth ──
export { salesIntelligenceModule } from './sales-intelligence-module';
export { growthModule } from './growth-module';
export { resumeModule } from './resume-module';

// ── System / Integration ──
export { browserControlModule } from './browser-control-module';
export { federationModule } from './federation-module';
export { composioModule } from './composio-module';
export { ticketsModule } from './tickets-module';
export { siteMigrationModule, siteMigrationMeta } from './site-migration-module';
export { developerModule } from './developer-module';

// ── Legacy (not in ModulesSettings — kept for registry compatibility) ──
export { globalBlocksModule } from './global-blocks-module';
export { ordersModule } from './orders-module';
