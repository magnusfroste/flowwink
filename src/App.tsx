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

import AuthPage from "./pages/AuthPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import PagesListPage from "./pages/admin/PagesListPage";
import NewPagePage from "./pages/admin/NewPagePage";
import PageEditorPage from "./pages/admin/PageEditorPage";
import UsersPage from "./pages/admin/UsersPage";
import LoginActivityPage from "./pages/admin/LoginActivityPage";

import RolePermissionsPage from "./pages/admin/RolePermissionsPage";
import MediaLibraryPage from "./pages/admin/MediaLibraryPage";
import SiteSettingsPage from "./pages/admin/SiteSettingsPage";
import BrandingSettingsPage from "./pages/admin/BrandingSettingsPage";

import ChatSettingsPage from "./pages/admin/ChatSettingsPage";
import WorkspaceChatPage from "./pages/admin/WorkspaceChatPage";
import ContentApiPage from "./pages/admin/ContentApiPage";
import DeveloperPage from "./pages/admin/DeveloperPage";
import ProcessCoveragePage from "./pages/admin/ProcessCoveragePage";
import AiUsagePage from "./pages/admin/AiUsagePage";
import ContentCampaignsPage from "./pages/admin/ContentCampaignsPage";



import FormSubmissionsPage from "./pages/admin/FormSubmissionsPage";
import NewsletterPage from "./pages/admin/NewsletterPage";
import CommunicationsPage from "./pages/admin/CommunicationsPage";
import BlogPage from "./pages/admin/BlogPage";
import BlogPostEditorPage from "./pages/admin/BlogPostEditorPage";
import ModulesPage from "./pages/admin/ModulesPage";
import AutomationsPage from "./pages/admin/AutomationsPage";
import WebhooksPage from "./pages/admin/WebhooksPage";
import LeadsPage from "./pages/admin/LeadsPage";
import LeadDetailPage from "./pages/admin/LeadDetailPage";
import DealsPage from "./pages/admin/DealsPage";
import DealDetailPage from "./pages/admin/DealDetailPage";
import CompaniesPage from "./pages/admin/CompaniesPage";
import CompanyDetailPage from "./pages/admin/CompanyDetailPage";
import ProductsPage from "./pages/admin/ProductsPage";
import OrdersPage from "./pages/admin/OrdersPage";
import CustomersPage from "./pages/admin/CustomersPage";
import InventoryPage from "./pages/admin/InventoryPage";
import VendorsPage from "./pages/admin/VendorsPage";
import PurchaseOrdersPage from "./pages/admin/PurchaseOrdersPage";
import ManufacturingPage from "./pages/admin/ManufacturingPage";
import SlaMonitorPage from "./pages/admin/SlaMonitorPage";
import KnowledgeBaseAdminPage from "./pages/admin/KnowledgeBasePage";
import AnalyticsDashboardPage from "./pages/admin/AnalyticsDashboardPage";
import BookingsPage from "./pages/admin/BookingsPage";
import ProfilePage from "./pages/admin/ProfilePage";
import KbArticleEditorPage from "./pages/admin/KbArticleEditorPage";
import IntegrationsStatusPage from "./pages/admin/IntegrationsStatusPage";
import CopilotPage from "./pages/admin/CopilotPage";
import FlowChatPage from "./pages/admin/FlowChatPage";

import LiveSupportPage from "./pages/admin/LiveSupportPage";

import TemplateLivePreviewPage from "./pages/admin/TemplateLivePreviewPage";
import DocsAdminPage from "./pages/admin/DocsAdminPage";
import Customer360Page from "./pages/admin/Customer360Page";
import SurveysPage from "./pages/admin/SurveysPage";
import PublicSurveyPage from "./pages/PublicSurveyPage";
import FieldServicePage from "./pages/admin/FieldServicePage";
import POSPage from "./pages/admin/POSPage";
import PosAuditPage from "./pages/admin/PosAuditPage";

import PreviewPage from "./pages/PreviewPage";
import PublicPage from "./pages/PublicPage";
import BlogArchivePage from "./pages/BlogArchivePage";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";
import BlogPostPage from "./pages/BlogPostPage";
import BlogCategoryPage from "./pages/BlogCategoryPage";
import BlogTagPage from "./pages/BlogTagPage";
import ChatPage from "./pages/ChatPage";
const DocsLandingPage = lazy(() => import("./pages/DocsLandingPage"));
const DocsCategoryPage = lazy(() => import("./pages/DocsCategoryPage"));
const DocsArticlePage = lazy(() => import("./pages/DocsArticlePage"));
import NewsletterManagePage from "./pages/NewsletterManagePage";
import NewsletterConfirmedPage from "./pages/NewsletterConfirmedPage";
import NotFound from "./pages/NotFound";
import CheckoutPage from "./pages/CheckoutPage";
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import PricingPage from "./pages/PricingPage";
import ShopPage from "./pages/ShopPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import CartPage from "./pages/CartPage";
import CustomerAuthPage from "./pages/account/CustomerAuthPage";
import AccountLayout from "./pages/account/AccountLayout";
import CustomerOrdersPage from "./pages/account/OrdersPage";
import AddressesPage from "./pages/account/AddressesPage";
import WishlistPage from "./pages/account/WishlistPage";
import CustomerProfilePage from "./pages/account/ProfilePage";
import LeavePage from "./pages/account/LeavePage";
import MyExpensesPage from "./pages/account/MyExpensesPage";
import TeamPage from "./pages/account/TeamPage";
import PerformancePage from "./pages/account/PerformancePage";
import AttendancePage from "./pages/account/AttendancePage";
import MySkillsPage from "./pages/account/MySkillsPage";
import MyContractsPage from "./pages/account/MyContractsPage";
import DeveloperToolsPage from "./pages/admin/DeveloperToolsPage";
import WebinarsPage from "./pages/admin/WebinarsPage";
import SalesIntelligencePage from "./pages/admin/SalesIntelligencePage";
import ConsultantProfilesPage from "./pages/admin/ConsultantProfilesPage";
import FederationPage from "./pages/admin/FederationPage";

import WikiPage from "./pages/admin/WikiPage";
import RiverPage from "./pages/admin/RiverPage";
import SkillsCatalogPage from "./pages/admin/SkillsCatalogPage";
import CompanyInsightsPage from "./pages/admin/CompanyInsightsPage";
import AutonomyTestSuitePage from "./pages/admin/AutonomyTestSuitePage";
import PlatformTestsPage from "./pages/admin/PlatformTestsPage";
import GrowthDashboardPage from "./pages/admin/GrowthDashboardPage";

import TicketsPage from "./pages/admin/TicketsPage";
import InvoicesPage from "./pages/admin/InvoicesPage";
import QuotesPage from "./pages/admin/QuotesPage";
import QuoteTemplatesPage from "./pages/admin/QuoteTemplatesPage";
import PublicQuotePage from "./pages/PublicQuotePage";
import PublicInvoicePage from "./pages/PublicInvoicePage";
import AccountingPage from "./pages/admin/AccountingPage";
import CurrenciesPage from "./pages/admin/CurrenciesPage";
import FixedAssetsPage from "./pages/admin/FixedAssetsPage";
import PayrollPage from "./pages/admin/PayrollPage";
import LocalePacksPage from "./pages/admin/LocalePacksPage";
import ExpensesPage from "./pages/admin/ExpensesPage";
import HandbookPage from "./pages/admin/HandbookPage";
import TimesheetsPage from "./pages/admin/TimesheetsPage";
import ContractsPage from "./pages/admin/ContractsPage";
import ContractEditorPage from "./pages/admin/ContractEditorPage";
import ContractTemplatesPage from "./pages/admin/ContractTemplatesPage";
import PublicContractPage from "./pages/PublicContractPage";
import HRPage from "./pages/admin/HRPage";
import RecruitmentPage from "./pages/admin/RecruitmentPage";
import CandidatePage from "./pages/admin/CandidatePage";
import JobAdminPage from "./pages/admin/JobAdminPage";
import DocumentsPage from "./pages/admin/DocumentsPage";
import ProjectsPage from "./pages/admin/ProjectsPage";
import CalendarPage from "./pages/admin/CalendarPage";
import SubscriptionsPage from "./pages/admin/SubscriptionsPage";
import DunningPage from "./pages/admin/DunningPage";
import ApprovalsPage from "./pages/admin/ApprovalsPage";
import ReconciliationPage from "./pages/admin/ReconciliationPage";
import ActivitiesPage from "./pages/admin/ActivitiesPage";
import PricelistsPage from "./pages/admin/PricelistsPage";
import ReturnsPage from "./pages/admin/ReturnsPage";
import ShippingPage from "./pages/admin/ShippingPage";

import PipelineStagesPage from "./pages/admin/PipelineStagesPage";
import UnitsOfMeasurePage from "./pages/admin/UnitsOfMeasurePage";


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
      <Outlet />
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
      { path: "/admin/process-coverage", element: <ProcessCoveragePage /> },
      { path: "/admin/ai-usage", element: <AiUsagePage /> },
      { path: "/admin/campaigns", element: <ContentCampaignsPage /> },
      { path: "/admin/quick-start", element: <Navigate to="/admin" replace /> },
      
      { path: "/admin/templates", element: withPageFallback(<TemplateGalleryPage />) },
      { path: "/admin/global-blocks", element: <Navigate to="/admin/pages?tab=header" replace /> },
      { path: "/admin/forms", element: <FormSubmissionsPage /> },
      { path: "/admin/newsletter", element: <NewsletterPage /> },
      { path: "/admin/communications", element: <CommunicationsPage /> },
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
      { path: "/admin/sales-intelligence", element: <SalesIntelligencePage /> },
      { path: "/admin/resume", element: <ConsultantProfilesPage /> },
      { path: "/admin/federation", element: <FederationPage /> },
      
      { path: "/admin/wiki", element: <WikiPage /> },
      { path: "/admin/wiki/:slug", element: <WikiPage /> },
      { path: "/admin/river", element: <RiverPage /> },
      { path: "/admin/company-insights", element: <CompanyInsightsPage /> },
      { path: "/admin/growth", element: <GrowthDashboardPage /> },
      
      { path: "/admin/tickets", element: <TicketsPage /> },
      { path: "/admin/invoices", element: <InvoicesPage /> },
      { path: "/admin/quotes", element: <QuotesPage /> },
      { path: "/admin/quotes/templates", element: <QuoteTemplatesPage /> },
      { path: "/quote/:token", element: <PublicQuotePage /> },
      { path: "/invoice/:token", element: <PublicInvoicePage /> },
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
      { path: "/admin/pos", element: <POSPage /> },
      { path: "/admin/pos/audit", element: <PosAuditPage /> },
      { path: "/admin/timesheets", element: <TimesheetsPage /> },
      { path: "/admin/contracts", element: <ContractsPage /> },
      { path: "/admin/contracts/templates", element: <ContractTemplatesPage /> },
      { path: "/admin/contracts/:id", element: <ContractEditorPage /> },
      { path: "/contract/:token", element: <PublicContractPage /> },
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
