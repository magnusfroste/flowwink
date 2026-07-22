import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { SandboxBanner } from '@/components/SandboxBanner';
import { AdminSidebar } from './AdminSidebar';
import { AdminContentHeader } from './AdminContentHeader';
import { Loader2 } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useFlowPilotBootstrap } from '@/hooks/useFlowPilotBootstrap';
import { useLocalePackBootstrap } from '@/hooks/useTenantLocalePack';
import { IncomingCallToaster } from './voice/IncomingCallToaster';
import Softphone from './voice/Softphone';
import { RolePreviewBanner } from './RolePreview';


interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, isWriter } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Only FlowPilot cockpit renders edge-to-edge (morning briefing chrome).
  // FlowChat is a regular admin page — keeps pinned-pages header.
  const isCopilotMode = location.pathname === '/admin/flowpilot';

  // Auto-seed FlowPilot on first admin session (idempotent)
  useFlowPilotBootstrap();

  // Same deal for the accounting locale pack: seed the chart of accounts and
  // templates the active pack declares. Was previously reachable only from
  // Accounting → Settings, so a fresh install could run with a near-empty
  // chart while RPC defaults posted to accounts that did not exist.
  useLocalePackBootstrap();

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

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {isCopilotMode ? (
            // FlowPilot cockpit: edge-to-edge, owns its own header + chrome
            <>
              <SandboxBanner />
              <RolePreviewBanner />
              {children}
            </>
          ) : (
            <>
              <SandboxBanner />
              <RolePreviewBanner />
              <AdminContentHeader />
              <main className="flex-1 overflow-auto animate-fade-in p-8">
                {children}
              </main>
            </>
          )}

        </div>
        <IncomingCallToaster />
        <Softphone floating />

      </div>
    </SidebarProvider>
  );
}
