import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AdminSidebar } from './AdminSidebar';
import { AdminContentHeader } from './AdminContentHeader';
import { Loader2 } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useFlowPilotBootstrap } from '@/hooks/useFlowPilotBootstrap';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, isWriter } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isCopilotMode = location.pathname === '/admin/copilot';

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">Redirecting to sign in…</span>
        </div>
      </div>
    );
  }

  if (!isWriter) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
            Access Denied
          </h1>
          <p className="text-muted-foreground">
            You do not have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  // In copilot mode: children provide their own left panel at full height
  if (isCopilotMode) {
    return (
      <SidebarProvider>
        <div className="flex h-screen w-full bg-background">
          {children}
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AdminContentHeader />
          <main className="flex-1 overflow-auto animate-fade-in p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
