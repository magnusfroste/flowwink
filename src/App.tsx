import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LocalePackProvider } from "@/providers/LocalePackProvider";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import { BrandingProvider } from "@/providers/BrandingProvider";
import { CartProvider } from "@/contexts/CartContext";
import { CartSidebar } from "@/components/public/CartSidebar";

const AuthPage = lazy(() => import("./pages/AuthPage"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const PagesListPage = lazy(() => import("./pages/admin/PagesListPage"));
const NewPagePage = lazy(() => import("./pages/admin/NewPagePage"));
const PageEditorPage = lazy(() => import("./pages/admin/PageEditorPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const LoginActivityPage = lazy(() => import("./pages/admin/LoginActivityPage"));

const RolePermissionsPage = lazy(() => import("./pages/admin/RolePermissionsPage"));
const MediaLibraryPage = lazy(() => import("./pages/admin/MediaLibraryPage"));
const SiteSettingsPage = lazy(() => import("./pages/admin/SiteSettingsPage"));
const BrandingSettingsPage = lazy(() => import("./pages/admin/BrandingSettingsPage"));

const ChatSettingsPage = lazy(() => import("./pages/admin/ChatSettingsPage"));
const WorkspaceChatPage = lazy(() => import("./pages/admin/WorkspaceChatPage"));
const ContentApiPage = lazy(() => import("./pages/admin/ContentApiPage"));
const DeveloperPage = lazy(() => import("./pages/admin/DeveloperPage"));
const ProcessCoveragePage = lazy(() => import("./pages/admin/ProcessCoveragePage"));
const AiUsagePage = lazy(() => import("./pages/admin/AiUsagePage"));
const ContentCampaignsPage = lazy(() => import("./pages/admin/ContentCampaignsPage"));



const FormSubmissionsPage = lazy(() => import("./pages/admin/FormSubmissionsPage"));
const NewsletterPage = lazy(() => import("./pages/admin/NewsletterPage"));
const CommunicationsPage = lazy(() => import("./pages/admin/CommunicationsPage"));
const EmailPage = lazy(() => import("./pages/admin/EmailPage"));
const BlogPage = lazy(() => import("./pages/admin/BlogPage"));
const BlogPostEditorPage = lazy(() => import("./pages/admin/BlogPostEditorPage"));
const ModulesPage = lazy(() => import("./pages/admin/ModulesPage"));
const AutomationsPage = lazy(() => import("./pages/admin/AutomationsPage"));
const VisitorIntelligencePage = lazy(() => import("./pages/admin/VisitorIntelligencePage"));
const WebhooksPage = lazy(() => import("./pages/admin/WebhooksPage"));
const LeadsPage = lazy(() => import("./pages/admin/LeadsPage"));
const LeadDetailPage = lazy(() => import("./pages/admin/LeadDetailPage"));
const DealsPage = lazy(() => import("./pages/admin/DealsPage"));
const DealDetailPage = lazy(() => import("./pages/admin/DealDetailPage"));
const CompaniesPage = lazy(() => import("./pages/admin/CompaniesPage"));
const CompanyDetailPage = lazy(() => import("./pages/admin/CompanyDetailPage"));
const ProductsPage = lazy(() => import("./pages/admin/ProductsPage"));
const OrdersPage = lazy(() => import("./pages/admin/OrdersPage"));
const CustomersPage = lazy(() => import("./pages/admin/CustomersPage"));
const InventoryPage = lazy(() => import("./pages/admin/InventoryPage"));
const VendorsPage = lazy(() => import("./pages/admin/VendorsPage"));
const PurchaseOrdersPage = lazy(() => import("./pages/admin/PurchaseOrdersPage"));
const ManufacturingPage = lazy(() => import("./pages/admin/ManufacturingPage"));
const SlaMonitorPage = lazy(() => import("./pages/admin/SlaMonitorPage"));
const KnowledgeBaseAdminPage = lazy(() => import("./pages/admin/KnowledgeBasePage"));
const AnalyticsDashboardPage = lazy(() => import("./pages/admin/AnalyticsDashboardPage"));
const BookingsPage = lazy(() => import("./pages/admin/BookingsPage"));
const ProfilePage = lazy(() => import("./pages/admin/ProfilePage"));
const KbArticleEditorPage = lazy(() => import("./pages/admin/KbArticleEditorPage"));
const IntegrationsStatusPage = lazy(() => import("./pages/admin/IntegrationsStatusPage"));
const CopilotPage = lazy(() => import("./pages/admin/CopilotPage"));
const FlowChatPage = lazy(() => import("./pages/admin/FlowChatPage"));

const LiveSupportPage = lazy(() => import("./pages/admin/LiveSupportPage"));

const TemplateLivePreviewPage = lazy(() => import("./pages/admin/TemplateLivePreviewPage"));
const DocsAdminPage = lazy(() => import("./pages/admin/DocsAdminPage"));
const Customer360Page = lazy(() => import("./pages/admin/Customer360Page"));
const SurveysPage = lazy(() => import("./pages/admin/SurveysPage"));
const PublicSurveyPage = lazy(() => import("./pages/PublicSurveyPage"));
const FieldServicePage = lazy(() => import("./pages/admin/FieldServicePage"));
const POSPage = lazy(() => import("./pages/admin/POSPage"));
const PosAuditPage = lazy(() => import("./pages/admin/PosAuditPage"));
const VoicePage = lazy(() => import("./pages/admin/VoicePage"));

const PreviewPage = lazy(() => import("./pages/PreviewPage"));
import PublicPage from "./pages/PublicPage";
const BlogArchivePage = lazy(() => import("./pages/BlogArchivePage"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const BlogCategoryPage = lazy(() => import("./pages/BlogCategoryPage"));
const BlogTagPage = lazy(() => import("./pages/BlogTagPage"));
const BlogAuthorPage = lazy(() => import("./pages/BlogAuthorPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const DocsLandingPage = lazy(() => import("./pages/DocsLandingPage"));
const DocsCategoryPage = lazy(() => import("./pages/DocsCategoryPage"));
const DocsArticlePage = lazy(() => import("./pages/DocsArticlePage"));
const NewsletterManagePage = lazy(() => import("./pages/NewsletterManagePage"));
const NewsletterConfirmedPage = lazy(() => import("./pages/NewsletterConfirmedPage"));
import NotFound from "./pages/NotFound";
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const CheckoutSuccessPage = lazy(() => import("./pages/CheckoutSuccessPage"));
const OrderTrackingPage = lazy(() => import("./pages/OrderTrackingPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ShopPage = lazy(() => import("./pages/ShopPage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const CustomerAuthPage = lazy(() => import("./pages/account/CustomerAuthPage"));
const AccountLayout = lazy(() => import("./pages/account/AccountLayout"));
const CustomerOrdersPage = lazy(() => import("./pages/account/OrdersPage"));
const AddressesPage = lazy(() => import("./pages/account/AddressesPage"));
const WishlistPage = lazy(() => import("./pages/account/WishlistPage"));
const CustomerProfilePage = lazy(() => import("./pages/account/ProfilePage"));
const LeavePage = lazy(() => import("./pages/account/LeavePage"));
const MyExpensesPage = lazy(() => import("./pages/account/MyExpensesPage"));
const TeamPage = lazy(() => import("./pages/account/TeamPage"));
const PerformancePage = lazy(() => import("./pages/account/PerformancePage"));
const AttendancePage = lazy(() => import("./pages/account/AttendancePage"));
const MySkillsPage = lazy(() => import("./pages/account/MySkillsPage"));
const MyContractsPage = lazy(() => import("./pages/account/MyContractsPage"));
const MyPayslipsPage = lazy(() => import("./pages/account/MyPayslipsPage"));
const DeveloperToolsPage = lazy(() => import("./pages/admin/DeveloperToolsPage"));
const MigrationAuditPage = lazy(() => import("./pages/admin/MigrationAuditPage"));
const SystemHubPage = lazy(() => import("./pages/admin/SystemHubPage"));
const WebinarsPage = lazy(() => import("./pages/admin/WebinarsPage"));
const WebmeetPage = lazy(() => import("./pages/admin/WebmeetPage"));
const MeetRoomPage = lazy(() => import("./pages/MeetRoomPage"));
const SalesIntelligencePage = lazy(() => import("./pages/admin/SalesIntelligencePage"));
const ConsultantProfilesPage = lazy(() => import("./pages/admin/ConsultantProfilesPage"));
const FederationPage = lazy(() => import("./pages/admin/FederationPage"));

const WikiPage = lazy(() => import("./pages/admin/WikiPage"));
const RiverPage = lazy(() => import("./pages/admin/RiverPage"));
const FlowtablePage = lazy(() => import("./pages/admin/FlowtablePage"));
const SkillsCatalogPage = lazy(() => import("./pages/admin/SkillsCatalogPage"));
const CompanyInsightsPage = lazy(() => import("./pages/admin/CompanyInsightsPage"));
const AutonomyTestSuitePage = lazy(() => import("./pages/admin/AutonomyTestSuitePage"));
const PlatformTestsPage = lazy(() => import("./pages/admin/PlatformTestsPage"));
const GrowthDashboardPage = lazy(() => import("./pages/admin/GrowthDashboardPage"));

const TicketsPage = lazy(() => import("./pages/admin/TicketsPage"));
const InvoicesPage = lazy(() => import("./pages/admin/InvoicesPage"));
const QuotesPage = lazy(() => import("./pages/admin/QuotesPage"));
const QuoteTemplatesPage = lazy(() => import("./pages/admin/QuoteTemplatesPage"));
const PublicQuotePage = lazy(() => import("./pages/PublicQuotePage"));
const SignatureCertificatePage = lazy(() => import("./pages/SignatureCertificatePage"));
const PublicInvoicePage = lazy(() => import("./pages/PublicInvoicePage"));
const PublicDocumentSignPage = lazy(() => import("./pages/PublicDocumentSignPage"));
const AccountingPage = lazy(() => import("./pages/admin/AccountingPage"));
const CurrenciesPage = lazy(() => import("./pages/admin/CurrenciesPage"));
const FixedAssetsPage = lazy(() => import("./pages/admin/FixedAssetsPage"));
const PayrollPage = lazy(() => import("./pages/admin/PayrollPage"));
const LocalePacksPage = lazy(() => import("./pages/admin/LocalePacksPage"));
const ExpensesPage = lazy(() => import("./pages/admin/ExpensesPage"));
const HandbookPage = lazy(() => import("./pages/admin/HandbookPage"));
const TimesheetsPage = lazy(() => import("./pages/admin/TimesheetsPage"));
const ContractsPage = lazy(() => import("./pages/admin/ContractsPage"));
const ContractEditorPage = lazy(() => import("./pages/admin/ContractEditorPage"));
const ContractTemplatesPage = lazy(() => import("./pages/admin/ContractTemplatesPage"));
const PublicContractPage = lazy(() => import("./pages/PublicContractPage"));
const HRPage = lazy(() => import("./pages/admin/HRPage"));
const RecruitmentPage = lazy(() => import("./pages/admin/RecruitmentPage"));
const CandidatePage = lazy(() => import("./pages/admin/CandidatePage"));
const JobAdminPage = lazy(() => import("./pages/admin/JobAdminPage"));
const DocumentsPage = lazy(() => import("./pages/admin/DocumentsPage"));
const ProjectsPage = lazy(() => import("./pages/admin/ProjectsPage"));
const CalendarPage = lazy(() => import("./pages/admin/CalendarPage"));
const SubscriptionsPage = lazy(() => import("./pages/admin/SubscriptionsPage"));
const DunningPage = lazy(() => import("./pages/admin/DunningPage"));
const ApprovalsPage = lazy(() => import("./pages/admin/ApprovalsPage"));
const ReconciliationPage = lazy(() => import("./pages/admin/ReconciliationPage"));
const ActivitiesPage = lazy(() => import("./pages/admin/ActivitiesPage"));
const PricelistsPage = lazy(() => import("./pages/admin/PricelistsPage"));
const ReturnsPage = lazy(() => import("./pages/admin/ReturnsPage"));
const ShippingPage = lazy(() => import("./pages/admin/ShippingPage"));
const MaintenancePage = lazy(() => import("./pages/admin/MaintenancePage"));

const PipelineStagesPage = lazy(() => import("./pages/admin/PipelineStagesPage"));
const UnitsOfMeasurePage = lazy(() => import("./pages/admin/UnitsOfMeasurePage"));


const TemplateGalleryPage = lazy(() => import("./pages/admin/TemplateGalleryPage"));

console.info("[boot] App.tsx evaluated", new Date().toISOString());
const queryClient = new QueryClient();

const withPageFallback = (element: JSX.Element) => (
  <Suspense
    fallback={
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }
  >
    {element}
  </Suspense>
);


// Layout that renders CartSidebar inside router context
function AppLayout() {
  return (
    <>
      <CartSidebar />
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <PublicPage /> },
      { path: "/auth", element: <AuthPage /> },
      { path: "/chat", element: <ChatPage /> },
      { path: "/newsletter/manage", element: <NewsletterManagePage /> },
      { path: "/newsletter/confirmed", element: <NewsletterConfirmedPage /> },
      { path: "/priser", element: <PricingPage /> },
      { path: "/shop", element: <ShopPage /> },
      { path: "/shop/:id", element: <ProductDetailPage /> },
      { path: "/cart", element: <CartPage /> },
      { path: "/account/login", element: <CustomerAuthPage /> },
      {
        path: "/account",
        element: <AccountLayout />,
        children: [
          { index: true, element: <CustomerOrdersPage /> },
          { path: "addresses", element: <AddressesPage /> },
          { path: "wishlist", element: <WishlistPage /> },
          { path: "profile", element: <CustomerProfilePage /> },
          { path: "leave", element: <LeavePage /> },
          { path: "expenses", element: <MyExpensesPage /> },
          { path: "team", element: <TeamPage /> },
          { path: "performance", element: <PerformancePage /> },
          { path: "attendance", element: <AttendancePage /> },
          { path: "skills", element: <MySkillsPage /> },
          { path: "contracts", element: <MyContractsPage /> },
          { path: "payslips", element: <MyPayslipsPage /> },
        ],
      },
      { path: "/checkout", element: <CheckoutPage /> },
      { path: "/checkout/success", element: <CheckoutSuccessPage /> },
      { path: "/track", element: <OrderTrackingPage /> },
      { path: "/track/:id", element: <OrderTrackingPage /> },
      { path: "/blog", element: <BlogArchivePage /> },
      { path: "/blog/category/:slug", element: <BlogCategoryPage /> },
      { path: "/blog/tag/:slug", element: <BlogTagPage /> },
      { path: "/blog/:slug", element: <BlogPostPage /> },
      { path: "/jobs", element: <JobsPage /> },
      { path: "/jobs/:slug", element: <JobDetailPage /> },
      { path: "/docs", element: withPageFallback(<DocsLandingPage />) },
      { path: "/docs/:category", element: withPageFallback(<DocsCategoryPage />) },
      { path: "/docs/:category/:slug", element: withPageFallback(<DocsArticlePage />) },
      { path: "/admin", element: <AdminDashboard /> },
      { path: "/admin/analytics", element: <AnalyticsDashboardPage /> },
      { path: "/admin/pages", element: <PagesListPage /> },
      { path: "/admin/pages/new", element: <NewPagePage /> },
      { path: "/admin/pages/trash", element: <PagesListPage /> },
      { path: "/admin/pages/:id", element: <PageEditorPage /> },
      { path: "/admin/blog", element: <BlogPage /> },
      { path: "/admin/blog/new", element: <BlogPostEditorPage /> },
      { path: "/admin/blog/categories", element: <BlogPage /> },
      { path: "/admin/blog/tags", element: <BlogPage /> },
      { path: "/admin/blog/settings", element: <BlogPage /> },
      { path: "/admin/blog/:id", element: <BlogPostEditorPage /> },
      { path: "/admin/media", element: <MediaLibraryPage /> },
      { path: "/admin/users", element: <UsersPage /> },
      { path: "/admin/users/login-activity", element: <LoginActivityPage /> },
      { path: "/admin/security/logins", element: <Navigate to="/admin/users/login-activity" replace /> },
      { path: "/admin/roles", element: <RolePermissionsPage /> },

      { path: "/admin/settings", element: <SiteSettingsPage /> },
      { path: "/admin/profile", element: <ProfilePage /> },
      { path: "/admin/branding", element: <BrandingSettingsPage /> },
      
      { path: "/admin/chat", element: <ChatSettingsPage /> },
      { path: "/admin/cowork", element: <WorkspaceChatPage /> },
      { path: "/admin/workspace", element: <Navigate to="/admin/cowork" replace /> },
      { path: "/admin/content-api", element: <Navigate to="/admin/developer" replace /> },
      { path: "/admin/developer", element: <DeveloperPage /> },
      { path: "/admin/migration-audit", element: <MigrationAuditPage /> },
      { path: "/admin/system", element: <SystemHubPage /> },
      { path: "/admin/process-coverage", element: <ProcessCoveragePage /> },
      { path: "/admin/ai-usage", element: <AiUsagePage /> },
      { path: "/admin/campaigns", element: <ContentCampaignsPage /> },
      { path: "/admin/quick-start", element: <Navigate to="/admin" replace /> },
      
      { path: "/admin/templates", element: withPageFallback(<TemplateGalleryPage />) },
      { path: "/admin/global-blocks", element: <Navigate to="/admin/pages?tab=header" replace /> },
      { path: "/admin/forms", element: <FormSubmissionsPage /> },
      { path: "/admin/newsletter", element: <NewsletterPage /> },
      { path: "/admin/communications", element: <CommunicationsPage /> },
      { path: "/admin/email", element: <EmailPage /> },
      { path: "/admin/leads", element: <LeadsPage /> },
      { path: "/admin/leads/:id", element: <LeadDetailPage /> },
      { path: "/admin/contacts", element: <LeadsPage /> },
      { path: "/admin/contacts/:id", element: <LeadDetailPage /> },
      { path: "/admin/deals", element: <DealsPage /> },
      { path: "/admin/deals/:id", element: <DealDetailPage /> },
      { path: "/admin/activities", element: <ActivitiesPage /> },
      { path: "/admin/companies", element: <CompaniesPage /> },
      { path: "/admin/companies/:id", element: <CompanyDetailPage /> },
      { path: "/admin/products", element: <ProductsPage /> },
      { path: "/admin/products/units", element: <UnitsOfMeasurePage /> },
      { path: "/admin/orders", element: <OrdersPage /> },
      { path: "/admin/pipelines", element: <Navigate to="/admin/pipelines/stages" replace /> },
      { path: "/admin/pipelines/stages", element: <PipelineStagesPage /> },
      { path: "/admin/approvals/chains", element: <Navigate to="/admin/approvals?tab=chains" replace /> },
      { path: "/admin/approvals/inbox", element: <Navigate to="/admin/approvals?tab=inbox" replace /> },
      { path: "/admin/customers", element: <CustomersPage /> },
      { path: "/admin/inventory", element: <InventoryPage /> },
      { path: "/admin/vendors", element: <VendorsPage /> },
      { path: "/admin/purchase-orders", element: <PurchaseOrdersPage /> },
      { path: "/admin/manufacturing", element: <ManufacturingPage /> },
      { path: "/admin/sla", element: <SlaMonitorPage /> },
      { path: "/admin/bookings", element: <BookingsPage /> },
      { path: "/admin/bookings/services", element: <BookingsPage /> },
      { path: "/admin/bookings/availability", element: <BookingsPage /> },
      { path: "/admin/modules", element: <ModulesPage /> },
      { path: "/admin/automations", element: <AutomationsPage /> },
      { path: "/admin/visitor-intelligence", element: <VisitorIntelligencePage /> },
      { path: "/admin/integrations", element: <IntegrationsStatusPage /> },
      { path: "/admin/webhooks", element: <Navigate to="/admin/developer" replace /> },
      { path: "/admin/knowledge-base", element: <KnowledgeBaseAdminPage /> },
      { path: "/admin/knowledge-base/new", element: <KbArticleEditorPage /> },
      { path: "/admin/knowledge-base/:id", element: <KbArticleEditorPage /> },
      { path: "/admin/flowpilot", element: <CopilotPage /> },
      { path: "/admin/flowpilot/engine", element: <Navigate to="/admin/flowpilot" replace /> },
      { path: "/admin/flowchat", element: <FlowChatPage /> },
      { path: "/admin/smoke-test", element: <Navigate to="/admin/platform-tests" replace /> },
      { path: "/admin/skills", element: <SkillsCatalogPage /> },
      { path: "/admin/skill-hub", element: <Navigate to="/admin/skills" replace /> },
      { path: "/admin/live-support", element: <LiveSupportPage /> },
      { path: "/admin/template-export", element: <Navigate to="/admin/templates" replace /> },
      { path: "/admin/developer-tools", element: <Navigate to="/admin/developer" replace /> },
      { path: "/admin/template-live-preview", element: <TemplateLivePreviewPage /> },
      { path: "/admin/webinars", element: <WebinarsPage /> },
      { path: "/admin/webmeet", element: <WebmeetPage /> },
      { path: "/meet/:slug", element: <MeetRoomPage /> },
      { path: "/admin/sales-intelligence", element: <SalesIntelligencePage /> },
      { path: "/admin/resume", element: <ConsultantProfilesPage /> },
      { path: "/admin/federation", element: <FederationPage /> },
      
      { path: "/admin/wiki", element: <WikiPage /> },
      { path: "/admin/wiki/:slug", element: <WikiPage /> },
      { path: "/admin/river", element: <RiverPage /> },
      { path: "/admin/flowtable", element: <FlowtablePage /> },
      { path: "/admin/flowtable/:baseSlug", element: <FlowtablePage /> },
      { path: "/admin/flowtable/:baseSlug/:tableSlug", element: <FlowtablePage /> },
      { path: "/admin/company-insights", element: <CompanyInsightsPage /> },
      { path: "/admin/growth", element: <GrowthDashboardPage /> },
      
      { path: "/admin/tickets", element: <TicketsPage /> },
      { path: "/admin/invoices", element: <InvoicesPage /> },
      { path: "/admin/quotes", element: <QuotesPage /> },
      { path: "/admin/quotes/templates", element: <QuoteTemplatesPage /> },
      { path: "/quote/:token", element: <PublicQuotePage /> },
      { path: "/quote/:token/certificate", element: <SignatureCertificatePage /> },
      { path: "/invoice/:token", element: <PublicInvoicePage /> },
      { path: "/sign/document/:token", element: <PublicDocumentSignPage /> },
      { path: "/s/:token", element: <PublicSurveyPage /> },
      { path: "/admin/accounting", element: <AccountingPage /> },
      { path: "/admin/accounting/locale-packs", element: <LocalePacksPage /> },
      { path: "/admin/currencies", element: <CurrenciesPage /> },
      { path: "/admin/fixed-assets", element: <FixedAssetsPage /> },
      { path: "/admin/payroll", element: <PayrollPage /> },
      { path: "/admin/expenses", element: <ExpensesPage /> },
      { path: "/admin/handbook", element: <HandbookPage /> },
      { path: "/admin/docs", element: <DocsAdminPage /> },
      { path: "/admin/customer", element: <Customer360Page /> },
      { path: "/admin/customer/:identifier", element: <Customer360Page /> },
      { path: "/admin/surveys", element: <SurveysPage /> },
      { path: "/admin/field-service", element: <FieldServicePage /> },
      { path: "/admin/voice", element: <VoicePage /> },
      { path: "/admin/pos", element: <POSPage /> },
      { path: "/admin/pos/audit", element: <PosAuditPage /> },
      { path: "/admin/timesheets", element: <TimesheetsPage /> },
      { path: "/admin/contracts", element: <ContractsPage /> },
      { path: "/admin/contracts/templates", element: <ContractTemplatesPage /> },
      { path: "/admin/contracts/:id", element: <ContractEditorPage /> },
      { path: "/contract/:token", element: <PublicContractPage /> },
      { path: "/contract/:token/certificate", element: <SignatureCertificatePage /> },
      { path: "/admin/hr", element: <HRPage /> },
      { path: "/admin/recruitment", element: <RecruitmentPage /> },
      { path: "/admin/recruitment/candidates/:id", element: <CandidatePage /> },
      { path: "/admin/recruitment/jobs/:id", element: <JobAdminPage /> },
      { path: "/admin/documents", element: <DocumentsPage /> },
      { path: "/admin/projects", element: <ProjectsPage /> },
      { path: "/admin/calendar", element: <CalendarPage /> },
      { path: "/admin/subscriptions", element: <SubscriptionsPage /> },
      { path: "/admin/subscriptions/dunning", element: <DunningPage /> },
      { path: "/admin/approvals", element: <ApprovalsPage /> },
      { path: "/admin/reconciliation", element: <ReconciliationPage /> },
      { path: "/admin/pricelists", element: <PricelistsPage /> },
      { path: "/admin/returns", element: <ReturnsPage /> },
      { path: "/admin/maintenance", element: <MaintenancePage /> },
      { path: "/admin/shipping", element: <ShippingPage /> },
      { path: "/admin/api-keys", element: <Navigate to="/admin/developer?tab=mcp-keys" replace /> },
      { path: "/admin/autonomy-tests", element: <AutonomyTestSuitePage /> },
      { path: "/admin/platform-tests", element: <PlatformTestsPage /> },
      { path: "/preview/:id", element: <PreviewPage /> },
      { path: "/:slug", element: <PublicPage /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LocalePackProvider>
      <HelmetProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <BrandingProvider>
              <CartProvider>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <RouterProvider router={router} />
                </TooltipProvider>
              </CartProvider>
            </BrandingProvider>
          </AuthProvider>
        </ThemeProvider>
      </HelmetProvider>
    </LocalePackProvider>
  </QueryClientProvider>
);

export default App;
