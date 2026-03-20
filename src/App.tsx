import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
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
import ContentCampaignsPage from "./pages/admin/ContentCampaignsPage";
import QuickStartPage from "./pages/admin/QuickStartPage";

import GlobalBlocksPage from "./pages/admin/GlobalBlocksPage";
import FormSubmissionsPage from "./pages/admin/FormSubmissionsPage";
import NewsletterPage from "./pages/admin/NewsletterPage";
import BlogPostsPage from "./pages/admin/BlogPostsPage";
import BlogPostEditorPage from "./pages/admin/BlogPostEditorPage";
import BlogCategoriesPage from "./pages/admin/BlogCategoriesPage";
import BlogTagsPage from "./pages/admin/BlogTagsPage";
import BlogSettingsPage from "./pages/admin/BlogSettingsPage";
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
import KnowledgeBaseAdminPage from "./pages/admin/KnowledgeBasePage";
import AnalyticsDashboardPage from "./pages/admin/AnalyticsDashboardPage";
import BookingsPage from "./pages/admin/BookingsPage";
import BookingServicesPage from "./pages/admin/BookingServicesPage";
import BookingAvailabilityPage from "./pages/admin/BookingAvailabilityPage";
import ProfilePage from "./pages/admin/ProfilePage";
import KbArticleEditorPage from "./pages/admin/KbArticleEditorPage";
import IntegrationsStatusPage from "./pages/admin/IntegrationsStatusPage";
import CopilotPage from "./pages/admin/CopilotPage";
import LiveSupportPage from "./pages/admin/LiveSupportPage";
import TemplateExportPage from "./pages/admin/TemplateExportPage";
import TemplateLivePreviewPage from "./pages/admin/TemplateLivePreviewPage";
import TrashPage from "./pages/admin/TrashPage";
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

const TemplateGalleryPage = lazy(() => import("./pages/admin/TemplateGalleryPage"));
const SkillHubPage = lazy(() => import("./pages/admin/SkillHubPage"));

console.info("[boot] App.tsx evaluated");
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
      { path: "/blogg", element: <BlogArchivePage /> },
      { path: "/blogg/kategori/:slug", element: <BlogCategoryPage /> },
      { path: "/blogg/tagg/:slug", element: <BlogTagPage /> },
      { path: "/blogg/:slug", element: <BlogPostPage /> },
      { path: "/admin", element: <AdminDashboard /> },
      { path: "/admin/analytics", element: <AnalyticsDashboardPage /> },
      { path: "/admin/pages", element: <PagesListPage /> },
      { path: "/admin/pages/new", element: <NewPagePage /> },
      { path: "/admin/pages/trash", element: <TrashPage /> },
      { path: "/admin/pages/:id", element: <PageEditorPage /> },
      { path: "/admin/blog", element: <BlogPostsPage /> },
      { path: "/admin/blog/new", element: <BlogPostEditorPage /> },
      { path: "/admin/blog/categories", element: <BlogCategoriesPage /> },
      { path: "/admin/blog/tags", element: <BlogTagsPage /> },
      { path: "/admin/blog/settings", element: <BlogSettingsPage /> },
      { path: "/admin/blog/:id", element: <BlogPostEditorPage /> },
      { path: "/admin/media", element: <MediaLibraryPage /> },
      { path: "/admin/users", element: <UsersPage /> },
      { path: "/admin/settings", element: <SiteSettingsPage /> },
      { path: "/admin/profile", element: <ProfilePage /> },
      { path: "/admin/branding", element: <BrandingSettingsPage /> },
      
      { path: "/admin/chat", element: <ChatSettingsPage /> },
      { path: "/admin/content-api", element: <ContentApiPage /> },
      { path: "/admin/campaigns", element: <ContentCampaignsPage /> },
      { path: "/admin/quick-start", element: <QuickStartPage /> },
      
      { path: "/admin/templates", element: withPageFallback(<TemplateGalleryPage />) },
      { path: "/admin/global-blocks", element: <GlobalBlocksPage /> },
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
      { path: "/admin/bookings", element: <BookingsPage /> },
      { path: "/admin/bookings/services", element: <BookingServicesPage /> },
      { path: "/admin/bookings/availability", element: <BookingAvailabilityPage /> },
      { path: "/admin/modules", element: <ModulesPage /> },
      { path: "/admin/integrations", element: <IntegrationsStatusPage /> },
      { path: "/admin/webhooks", element: <WebhooksPage /> },
      { path: "/admin/knowledge-base", element: <KnowledgeBaseAdminPage /> },
      { path: "/admin/knowledge-base/new", element: <KbArticleEditorPage /> },
      { path: "/admin/knowledge-base/:id", element: <KbArticleEditorPage /> },
      { path: "/admin/flowpilot", element: <CopilotPage /> },
      { path: "/admin/skills", element: withPageFallback(<SkillHubPage />) },
      { path: "/admin/live-support", element: <LiveSupportPage /> },
      { path: "/admin/template-export", element: <TemplateExportPage /> },
      { path: "/admin/developer-tools", element: <DeveloperToolsPage /> },
      { path: "/admin/template-live-preview", element: <TemplateLivePreviewPage /> },
      { path: "/admin/webinars", element: <WebinarsPage /> },
      { path: "/admin/sales-intelligence", element: <SalesIntelligencePage /> },
      { path: "/admin/resume", element: <ConsultantProfilesPage /> },
      { path: "/admin/federation", element: <FederationPage /> },
      { path: "/admin/company-insights", element: <CompanyInsightsPage /> },
      { path: "/admin/growth", element: <GrowthDashboardPage /> },
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
