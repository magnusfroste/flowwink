import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { BrandingProvider } from "@/providers/BrandingProvider";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import PagesListPage from "./pages/admin/PagesListPage";
import NewPagePage from "./pages/admin/NewPagePage";
import PageEditorPage from "./pages/admin/PageEditorPage";
import UsersPage from "./pages/admin/UsersPage";
import MediaLibraryPage from "./pages/admin/MediaLibraryPage";
import SiteSettingsPage from "./pages/admin/SiteSettingsPage";
import BrandingSettingsPage from "./pages/admin/BrandingSettingsPage";
import MenuOrderPage from "./pages/admin/MenuOrderPage";
import ChatSettingsPage from "./pages/admin/ChatSettingsPage";
import ContentHubPage from "./pages/admin/ContentHubPage";
import PreviewPage from "./pages/PreviewPage";
import PublicPage from "./pages/PublicPage";
import ChatPage from "./pages/ChatPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/", element: <PublicPage /> },
  { path: "/auth", element: <AuthPage /> },
  { path: "/chat", element: <ChatPage /> },
  { path: "/admin", element: <AdminDashboard /> },
  { path: "/admin/pages", element: <PagesListPage /> },
  { path: "/admin/pages/new", element: <NewPagePage /> },
  { path: "/admin/pages/:id", element: <PageEditorPage /> },
  { path: "/admin/media", element: <MediaLibraryPage /> },
  { path: "/admin/users", element: <UsersPage /> },
  { path: "/admin/settings", element: <SiteSettingsPage /> },
  { path: "/admin/branding", element: <BrandingSettingsPage /> },
  { path: "/admin/menu-order", element: <MenuOrderPage /> },
  { path: "/admin/chat", element: <ChatSettingsPage /> },
  { path: "/admin/content-hub", element: <ContentHubPage /> },
  { path: "/preview/:id", element: <PreviewPage /> },
  { path: "/:slug", element: <PublicPage /> },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthProvider>
          <BrandingProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <RouterProvider router={router} />
            </TooltipProvider>
          </BrandingProvider>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
