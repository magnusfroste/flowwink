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
export { docsModule } from './docs-module';
export { templatesModule } from './templates-module';
export { wikiModule } from './wiki-module';
export { riverModule } from './river-module';

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
export { voiceModule } from './voice-module';
export { webinarsModule } from './webinars-module';
export { workspaceChatModule } from './workspace-chat-module';
export { customer360Module } from './customer360-module';
export { surveysModule } from './surveys-module';
export { fieldServiceModule } from './field-service-module';
export { maintenanceModule } from './maintenance-module';
export { posModule } from './pos-module';

// ── Insights ──
export { analyticsModule } from './analytics-module';
export { companyInsightsModule } from './company-insights-module';

// ── Operations ──
export { invoicingModule } from './invoicing-module';
export { accountingModule } from './accounting-module';
export { expensesModule } from './expenses-module';
export { timesheetsModule } from './timesheets-module';
export { purchasingModule } from './purchasing-module';
export { manufacturingModule } from './manufacturing-module';
export { contractsModule } from './contracts-module';
export { hrModule } from './hr-module';
export { recruitmentModule } from './recruitment-module';
export { documentsModule } from './documents-module';
export { projectsModule } from './projects-module';
export { slaModule } from './sla-module';
export { calendarModule } from './calendar-module';
export { approvalsModule } from './approvals-module';
export { quotesModule } from './quotes-module';
export { reconciliationModule } from './reconciliation-module';
export { pricelistsModule } from './pricelists-module';
export { returnsModule } from './returns-module';
export { shippingModule } from './shipping-module';
export { multiCurrencyModule } from './multi-currency-module';
export { fixedAssetsModule } from './fixed-assets-module';
export { payrollModule } from './payroll-module';

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
export { flowpilotModule } from './flowpilot-module';

// ── Recurring revenue ──
export { subscriptionsModule } from './subscriptions-module';

// ── Email transport (provider-agnostic) ──
export { emailModule } from './email-module';

// ── Legacy (not in ModulesSettings — kept for registry compatibility) ──
export { globalBlocksModule } from './global-blocks-module';
