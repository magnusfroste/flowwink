import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRoleModuleAccess } from '@/hooks/useRoleModuleAccess';
import { isRouteAllowed } from '@/lib/admin-route-access';
import type { AppRole } from '@/types/cms';
import { SandboxBanner } from '@/components/SandboxBanner';
import { AdminSidebar } from './AdminSidebar';
import { AdminContentHeader } from './AdminContentHeader';
import { Loader2 } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useFlowPilotBootstrap } from '@/hooks/useFlowPilotBootstrap';
import { useLocalePackBootstrap } from '@/hooks/useTenantLocalePack';
import { IncomingCallToaster } from './voice/IncomingCallToaster';
import Softphone from './voice/Softphone';
import { useVoiceSettings } from '@/hooks/useVoice';
import { getVoiceProvider } from '@/lib/voice-providers';

import { RolePreviewBanner } from './RolePreview';


interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, rolesReady, isWriter, isAdmin, roles } = useAuth();
  const { data: accessMap, isLoading: accessLoading } = useRoleModuleAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: voiceSettings } = useVoiceSettings();
  // Opt-out, not opt-in: agents whose provider supports WebRTC keep the widget
  // unless an admin explicitly turns it off (existing site_settings rows have no
  // softphoneEnabled flag and must not silently lose their dialer).
  const softphoneVisible = Boolean(
    voiceSettings?.softphoneEnabled !== false &&
    voiceSettings?.provider &&
    getVoiceProvider(voiceSettings.provider)?.metadata.capabilities.webrtc,
  );



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
      // Carry the intended destination through the sign-in detour, so a shared
      // deep link (a wiki page, a KB article draft, a specific record) lands on
      // the page that was shared — not on the dashboard. Links people share in
      // chat only build a habit if they survive the login wall.
      navigate('/auth', {
        state: { from: location.pathname + location.search + location.hash },
      });
    }
  }, [loading, user, navigate, location]);

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

  // On sign-in, `user` lands before the roles fetch (deferred in useAuth) —
  // judging isWriter in that window flashed "Access Denied" at every login
  // for half a second. Wait for the verdict before delivering one; the
  // matrix gate below already had this discipline (accessLoading).
  if (!rolesReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  // Route gate — same source of truth as the sidebar (navigationGroups +
  // role_module_access). The sidebar HID pages the roles did not grant, but
  // nothing guarded the routes: a salesperson could type /admin/settings and
  // get the page. Hiding is not gating. Waits for the access map so a slow
  // load never flashes a deny at a permitted user.
  if (!isAdmin && !accessLoading &&
      !isRouteAllowed(location.pathname, { isAdmin, roles: roles as AppRole[], accessMap })) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
            Access Denied
          </h1>
          <p className="text-muted-foreground">
            Your role does not include this page.
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
        {softphoneVisible && <Softphone floating />}


      </div>
    </SidebarProvider>
  );
}
