/**
 * Route prefetch map.
 *
 * Maps admin sidebar hrefs to the same dynamic `import()` calls used by
 * `App.tsx`'s `lazy()` route components. Calling the loader ahead of time
 * (e.g. on link hover) warms Vite/Rollup's module cache so the target
 * route's JS chunk is already parsed by the time the user clicks — which
 * kills most of the visible "flicker" on navigation.
 *
 * Deduped: each href is only prefetched once per page load.
 */

type Loader = () => Promise<unknown>;

const loaders: Record<string, Loader> = {
  "/admin": () => import("@/pages/admin/AdminDashboard"),
  "/admin/flowchat": () => import("@/pages/admin/FlowChatPage"),
  "/admin/flowchat/sessions": () => import("@/pages/admin/FlowChatSessionsPage"),
  "/admin/flowwork": () => import("@/pages/admin/WorkspaceChatPage"),
  "/admin/flowwork/sessions": () => import("@/pages/admin/FlowworkSessionsPage"),
  "/admin/flowpilot": () => import("@/pages/admin/CopilotPage"),
  "/admin/automations": () => import("@/pages/admin/AutomationsPage"),
  "/admin/federation": () => import("@/pages/admin/FederationPage"),
  "/admin/analytics": () => import("@/pages/admin/AnalyticsDashboardPage"),
  "/admin/growth": () => import("@/pages/admin/GrowthDashboardPage"),
  "/admin/pages": () => import("@/pages/admin/PagesListPage"),
  "/admin/blog": () => import("@/pages/admin/BlogPage"),
  "/admin/campaigns": () => import("@/pages/admin/ContentCampaignsPage"),
  "/admin/knowledge-base": () => import("@/pages/admin/KnowledgeBasePage"),
  "/admin/media": () => import("@/pages/admin/MediaLibraryPage"),
  "/admin/handbook": () => import("@/pages/admin/HandbookPage"),
  "/admin/docs": () => import("@/pages/admin/DocsAdminPage"),
  "/admin/wiki": () => import("@/pages/admin/WikiPage"),
  "/admin/river": () => import("@/pages/admin/RiverPage"),
  "/admin/flowtable": () => import("@/pages/admin/FlowtablePage"),
  "/admin/newsletter": () => import("@/pages/admin/NewsletterPage"),
  "/admin/webinars": () => import("@/pages/admin/WebinarsPage"),
  "/admin/webmeet": () => import("@/pages/admin/WebmeetPage"),
  "/admin/forms": () => import("@/pages/admin/FormSubmissionsPage"),
  "/admin/communications": () => import("@/pages/admin/CommunicationsPage"),
  "/admin/live-support": () => import("@/pages/admin/LiveSupportPage"),
  "/admin/voice": () => import("@/pages/admin/VoicePage"),
  "/admin/tickets": () => import("@/pages/admin/TicketsPage"),
  "/admin/company-insights": () => import("@/pages/admin/CompanyInsightsPage"),
  "/admin/customer": () => import("@/pages/admin/Customer360Page"),
  "/admin/contacts": () => import("@/pages/admin/LeadsPage"),
  "/admin/companies": () => import("@/pages/admin/CompaniesPage"),
  "/admin/sales-intelligence": () => import("@/pages/admin/SalesIntelligencePage"),
  "/admin/consultants": () => import("@/pages/admin/ConsultantProfilesPage"),
  "/admin/deals": () => import("@/pages/admin/DealsPage"),
  "/admin/pipelines/stages": () => import("@/pages/admin/PipelineStagesPage"),
  "/admin/activities": () => import("@/pages/admin/ActivitiesPage"),
  "/admin/bookings": () => import("@/pages/admin/BookingsPage"),
  "/admin/calendar": () => import("@/pages/admin/CalendarPage"),
  "/admin/surveys": () => import("@/pages/admin/SurveysPage"),
  "/admin/field-service": () => import("@/pages/admin/FieldServicePage"),
  "/admin/quotes": () => import("@/pages/admin/QuotesPage"),
  "/admin/invoices": () => import("@/pages/admin/InvoicesPage"),
  "/admin/subscriptions": () => import("@/pages/admin/SubscriptionsPage"),
  "/admin/subscriptions/dunning": () => import("@/pages/admin/DunningPage"),
  "/admin/pos": () => import("@/pages/admin/POSPage"),
  "/admin/accounting": () => import("@/pages/admin/AccountingPage"),
  "/admin/expenses": () => import("@/pages/admin/ExpensesPage"),
  "/admin/timesheets": () => import("@/pages/admin/TimesheetsPage"),
  "/admin/approvals": () => import("@/pages/admin/ApprovalsPage"),
  "/admin/reconciliation": () => import("@/pages/admin/ReconciliationPage"),
  "/admin/customers": () => import("@/pages/admin/CustomersPage"),
  "/admin/products": () => import("@/pages/admin/ProductsPage"),
  "/admin/products/units": () => import("@/pages/admin/UnitsOfMeasurePage"),
  "/admin/inventory": () => import("@/pages/admin/InventoryPage"),
  "/admin/vendors": () => import("@/pages/admin/VendorsPage"),
  "/admin/purchase-orders": () => import("@/pages/admin/PurchaseOrdersPage"),
  "/admin/orders": () => import("@/pages/admin/OrdersPage"),
  "/admin/manufacturing": () => import("@/pages/admin/ManufacturingPage"),
  "/admin/projects": () => import("@/pages/admin/ProjectsPage"),
  "/admin/hr": () => import("@/pages/admin/HRPage"),
  "/admin/recruitment": () => import("@/pages/admin/RecruitmentPage"),
  "/admin/contracts": () => import("@/pages/admin/ContractsPage"),
  "/admin/documents": () => import("@/pages/admin/DocumentsPage"),
  "/admin/maintenance": () => import("@/pages/admin/MaintenancePage"),
  "/admin/sla": () => import("@/pages/admin/SlaMonitorPage"),
  "/admin/chat": () => import("@/pages/admin/ChatSettingsPage"),
  "/admin/templates": () => import("@/pages/admin/TemplateGalleryPage"),
  "/admin/modules": () => import("@/pages/admin/ModulesPage"),
  "/admin/integrations": () => import("@/pages/admin/IntegrationsStatusPage"),
  "/admin/branding": () => import("@/pages/admin/BrandingSettingsPage"),
  "/admin/developer": () => import("@/pages/admin/DeveloperPage"),
  "/admin/system": () => import("@/pages/admin/SystemHubPage"),
  "/admin/ai-usage": () => import("@/pages/admin/AiUsagePage"),
  "/admin/users": () => import("@/pages/admin/UsersPage"),
  "/admin/roles": () => import("@/pages/admin/RolePermissionsPage"),
  "/admin/profile": () => import("@/pages/admin/ProfilePage"),
  "/admin/settings": () => import("@/pages/admin/SiteSettingsPage"),
};

const started = new Set<string>();

/**
 * Warm the JS chunk for `href` if we know its loader.
 * Safe to call repeatedly and on every hover — deduped internally.
 */
export function prefetchRoute(href: string): void {
  if (!href) return;
  // Strip query/hash so `/admin/field-service?new=1` still resolves.
  const path = href.split("?")[0].split("#")[0];
  if (started.has(path)) return;
  const loader = loaders[path];
  if (!loader) return;
  started.add(path);
  // Fire and forget — errors here just mean the click will fetch normally.
  loader().catch(() => started.delete(path));
}
