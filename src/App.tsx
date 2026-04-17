import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
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
import MediaLibraryPage from "./pages/admin/MediaLibraryPage";
import SiteSettingsPage from "./pages/admin/SiteSettingsPage";
import BrandingSettingsPage from "./pages/admin/BrandingSettingsPage";

import ChatSettingsPage from "./pages/admin/ChatSettingsPage";
import ContentApiPage from "./pages/admin/ContentApiPage";
import DeveloperPage from "./pages/admin/DeveloperPage";
import ContentCampaignsPage from "./pages/admin/ContentCampaignsPage";



import FormSubmissionsPage from "./pages/admin/FormSubmissionsPage";
import NewsletterPage from "./pages/admin/NewsletterPage";
import BlogPage from "./pages/admin/BlogPage";
import BlogPostEditorPage from "./pages/admin/BlogPostEditorPage";
import ModulesPage from "./pages/admin/ModulesPage";
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
import SlaMonitorPage from "./pages/admin/SlaMonitorPage";
import KnowledgeBaseAdminPage from "./pages/admin/KnowledgeBasePage";
import AnalyticsDashboardPage from "./pages/admin/AnalyticsDashboardPage";
import BookingsPage from "./pages/admin/BookingsPage";
import ProfilePage from "./pages/admin/ProfilePage";
import KbArticleEditorPage from "./pages/admin/KbArticleEditorPage";
import IntegrationsStatusPage from "./pages/admin/IntegrationsStatusPage";
import CopilotPage from "./pages/admin/CopilotPage";
import LiveSupportPage from "./pages/admin/LiveSupportPage";

import TemplateLivePreviewPage from "./pages/admin/TemplateLivePreviewPage";

import PreviewPage from "./pages/PreviewPage";
import PublicPage from "./pages/PublicPage";
import BlogArchivePage from "./pages/BlogArchivePage";
import BlogPostPage from "./pages/BlogPostPage";
import BlogCategoryPage from "./pages/BlogCategoryPage";
import BlogTagPage from "./pages/BlogTagPage";
import ChatPage from "./pages/ChatPage";
import NewsletterManagePage from "./pages/NewsletterManagePage";
import NewsletterConfirmedPage from "./pages/NewsletterConfirmedPage";
import NotFound from "./pages/NotFound";
import CheckoutPage from "./pages/CheckoutPage";
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage";
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
import DeveloperToolsPage from "./pages/admin/DeveloperToolsPage";
import WebinarsPage from "./pages/admin/WebinarsPage";
import SalesIntelligencePage from "./pages/admin/SalesIntelligencePage";
import ConsultantProfilesPage from "./pages/admin/ConsultantProfilesPage";
import FederationPage from "./pages/admin/FederationPage";
import CompanyInsightsPage from "./pages/admin/CompanyInsightsPage";
import AutonomyTestSuitePage from "./pages/admin/AutonomyTestSuitePage";
import GrowthDashboardPage from "./pages/admin/GrowthDashboardPage";

import TicketsPage from "./pages/admin/TicketsPage";
import InvoicesPage from "./pages/admin/InvoicesPage";
import QuotesPage from "./pages/admin/QuotesPage";
import AccountingPage from "./pages/admin/AccountingPage";
import ExpensesPage from "./pages/admin/ExpensesPage";
import HandbookPage from "./pages/admin/HandbookPage";
import TimesheetsPage from "./pages/admin/TimesheetsPage";
import ContractsPage from "./pages/admin/ContractsPage";
import HRPage from "./pages/admin/HRPage";
import DocumentsPage from "./pages/admin/DocumentsPage";
import ProjectsPage from "./pages/admin/ProjectsPage";
import CalendarPage from "./pages/admin/CalendarPage";
import SubscriptionsPage from "./pages/admin/SubscriptionsPage";


const TemplateGalleryPage = lazy(() => import("./pages/admin/TemplateGalleryPage"));
const SkillHubPage = lazy(() => import("./pages/admin/SkillHubPage"));

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
        ],
      },
      { path: "/checkout", element: <CheckoutPage /> },
      { path: "/checkout/success", element: <CheckoutSuccessPage /> },
      { path: "/blog", element: <BlogArchivePage /> },
      { path: "/blog/category/:slug", element: <BlogCategoryPage /> },
      { path: "/blog/tag/:slug", element: <BlogTagPage /> },
      { path: "/blog/:slug", element: <BlogPostPage /> },
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
      { path: "/admin/settings", element: <SiteSettingsPage /> },
      { path: "/admin/profile", element: <ProfilePage /> },
      { path: "/admin/branding", element: <BrandingSettingsPage /> },
      
      { path: "/admin/chat", element: <ChatSettingsPage /> },
      { path: "/admin/content-api", element: <Navigate to="/admin/developer" replace /> },
      { path: "/admin/developer", element: <DeveloperPage /> },
      { path: "/admin/campaigns", element: <ContentCampaignsPage /> },
      { path: "/admin/quick-start", element: <Navigate to="/admin" replace /> },
      
      { path: "/admin/templates", element: withPageFallback(<TemplateGalleryPage />) },
      { path: "/admin/global-blocks", element: <Navigate to="/admin/pages?tab=header" replace /> },
      { path: "/admin/forms", element: <FormSubmissionsPage /> },
      { path: "/admin/newsletter", element: <NewsletterPage /> },
      { path: "/admin/contacts", element: <LeadsPage /> },
      { path: "/admin/contacts/:id", element: <LeadDetailPage /> },
      { path: "/admin/deals", element: <DealsPage /> },
      { path: "/admin/deals/:id", element: <DealDetailPage /> },
      { path: "/admin/companies", element: <CompaniesPage /> },
      { path: "/admin/companies/:id", element: <CompanyDetailPage /> },
      { path: "/admin/products", element: <ProductsPage /> },
      { path: "/admin/orders", element: <OrdersPage /> },
      { path: "/admin/customers", element: <CustomersPage /> },
      { path: "/admin/inventory", element: <InventoryPage /> },
      { path: "/admin/vendors", element: <VendorsPage /> },
      { path: "/admin/purchase-orders", element: <PurchaseOrdersPage /> },
      { path: "/admin/sla", element: <SlaMonitorPage /> },
      { path: "/admin/bookings", element: <BookingsPage /> },
      { path: "/admin/bookings/services", element: <BookingsPage /> },
      { path: "/admin/bookings/availability", element: <BookingsPage /> },
      { path: "/admin/modules", element: <ModulesPage /> },
      { path: "/admin/integrations", element: <IntegrationsStatusPage /> },
      { path: "/admin/webhooks", element: <Navigate to="/admin/developer" replace /> },
      { path: "/admin/knowledge-base", element: <KnowledgeBaseAdminPage /> },
      { path: "/admin/knowledge-base/new", element: <KbArticleEditorPage /> },
      { path: "/admin/knowledge-base/:id", element: <KbArticleEditorPage /> },
      { path: "/admin/flowpilot", element: <CopilotPage /> },
      { path: "/admin/skills", element: withPageFallback(<SkillHubPage />) },
      { path: "/admin/live-support", element: <LiveSupportPage /> },
      { path: "/admin/template-export", element: <Navigate to="/admin/templates" replace /> },
      { path: "/admin/developer-tools", element: <Navigate to="/admin/developer" replace /> },
      { path: "/admin/template-live-preview", element: <TemplateLivePreviewPage /> },
      { path: "/admin/webinars", element: <WebinarsPage /> },
      { path: "/admin/sales-intelligence", element: <SalesIntelligencePage /> },
      { path: "/admin/resume", element: <ConsultantProfilesPage /> },
      { path: "/admin/federation", element: <FederationPage /> },
      { path: "/admin/company-insights", element: <CompanyInsightsPage /> },
      { path: "/admin/growth", element: <GrowthDashboardPage /> },
      
      { path: "/admin/tickets", element: <TicketsPage /> },
      { path: "/admin/invoices", element: <InvoicesPage /> },
      { path: "/admin/quotes", element: <QuotesPage /> },
      { path: "/admin/accounting", element: <AccountingPage /> },
      { path: "/admin/expenses", element: <ExpensesPage /> },
      { path: "/admin/handbook", element: <HandbookPage /> },
      { path: "/admin/timesheets", element: <TimesheetsPage /> },
      { path: "/admin/contracts", element: <ContractsPage /> },
      { path: "/admin/hr", element: <HRPage /> },
      { path: "/admin/documents", element: <DocumentsPage /> },
      { path: "/admin/projects", element: <ProjectsPage /> },
      { path: "/admin/calendar", element: <CalendarPage /> },
      { path: "/admin/subscriptions", element: <SubscriptionsPage /> },
      { path: "/admin/api-keys", element: <Navigate to="/admin/developer?tab=mcp-keys" replace /> },
      { path: "/admin/autonomy-tests", element: <AutonomyTestSuitePage /> },
      { path: "/preview/:id", element: <PreviewPage /> },
      { path: "/:slug", element: <PublicPage /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
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
  </QueryClientProvider>
);

export default App;
