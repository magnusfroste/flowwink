import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import PublicPage from "./pages/PublicPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthProvider>
          <BrandingProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<PublicPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/pages" element={<PagesListPage />} />
                  <Route path="/admin/pages/new" element={<NewPagePage />} />
                  <Route path="/admin/pages/:id" element={<PageEditorPage />} />
                  <Route path="/admin/media" element={<MediaLibraryPage />} />
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/settings" element={<SiteSettingsPage />} />
                  <Route path="/admin/branding" element={<BrandingSettingsPage />} />
                  <Route path="/admin/menu-order" element={<MenuOrderPage />} />
                  <Route path="/:slug" element={<PublicPage />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </BrandingProvider>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
