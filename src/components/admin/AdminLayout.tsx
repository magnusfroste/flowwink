import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRoleModuleAccess } from '@/hooks/useRoleModuleAccess';
import { useSecuritySettings } from '@/hooks/useSiteSettings';
import { mfaGateFor } from '@/lib/mfa-gate';
import { MfaScreen } from './mfa/MfaScreen';
import { MfaChallenge } from './mfa/MfaChallenge';
import { MfaEnroll } from './mfa/MfaEnroll';
import { isRouteAllowed } from '@/lib/admin-route-access';
import type { AppRole } from '@/types/cms';
import { SandboxBanner } from '@/components/SandboxBanner';
import { AdminSidebar } from './AdminSidebar';
import { AdminContentHeader } from './AdminContentHeader';
import { AccessDenied } from './AccessDenied';
import { Loader2 } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useFlowPilotBootstrap } from '@/hooks/useFlowPilotBootstrap';
import { useLocalePackBootstrap } from '@/hooks/useTenantLocalePack';
import { IncomingCallToaster } from './voice/IncomingCallToaster';
import Softphone from './voice/Softphone';
import { useVoiceSettings } from '@/hooks/useVoice';
import { getVoiceProvider } from '@/lib/voice-providers';

import { RolePreviewBanner } from './RolePreview';
import { TeamPresenceProvider } from './TeamPresenceProvider';
import { RingDialog } from './TeamPresence';


interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, rolesReady, isWriter, isAdmin, roles, realRoles, mfa, signOut } = useAuth();
  const { data: accessMap, isLoading: accessLoading } = useRoleModuleAccess();
  const { data: security } = useSecuritySettings();
  // The second factor, before anything else is judged: a staff session that
  // enrolled one and has not proved it, or one the instance requires one of.
  // The database refuses such a session as staff regardless (session_mfa_ok);
  // this is where it is told why, and given the screen to fix it.
  const mfaGate = mfaGateFor({ roles: realRoles, mfa, requiredForStaff: security?.mfaRequiredForStaff === true });
  const navigate = useNavigate();
  const location = useLocation();
  // The "Switch account" door on a deny: the colleague who is signed in to the
  // wrong account. The auth effect below sends a signed-out user to /auth.
  const switchAccount = async () => { await signOut(); navigate('/auth'); };
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

  if (mfaGate === 'challenge') {
    return (
      <MfaScreen>
        <MfaChallenge />
      </MfaScreen>
    );
  }
  if (mfaGate === 'enroll') {
    return (
      <MfaScreen>
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Set up your authenticator</h1>
            <p className="text-sm text-muted-foreground">This site requires a second factor for everyone who runs it.</p>
          </div>
          <MfaEnroll forced />
        </div>
      </MfaScreen>
    );
  }

  if (!isWriter) {
    return <AccessDenied reason="not-staff" onSignOut={switchAccount} />;
  }

  // Route gate — same source of truth as the sidebar (navigationGroups +
  // role_module_access). The sidebar HID pages the roles did not grant, but
  // nothing guarded the routes: a salesperson could type /admin/settings and
  // get the page. Hiding is not gating. Waits for the access map so a slow
  // load never flashes a deny at a permitted user — and waits with a SPINNER,
  // not with the page: `!accessLoading &&` alone served the page (and fired its
  // queries) until the matrix arrived, so a slow matrix was an open door. With
  // the matrix delayed 8 s the most restricted role got the whole Fixed Assets
  // page before the deny landed (view sweep, 2026-09-19).
  if (!isAdmin && accessLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // A deny with a way out (AccessDenied): the path, who grants it, the
  // dashboard. A browser that reopens its last tab on a page the role lacks
  // showed this screen as the first thing after sign-in — and a dead end at
  // the front door reads as "I cannot log in" (optic, 2026-10-26 and 10-29).
  if (!isAdmin &&
      !isRouteAllowed(location.pathname, { isAdmin, roles: roles as AppRole[], accessMap })) {
    return <AccessDenied reason="route" pathname={location.pathname} onSignOut={switchAccount} />;
  }

  return (
    <SidebarProvider>
      <TeamPresenceProvider>
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
        <RingDialog />
        {softphoneVisible && <Softphone floating />}


      </div>
      </TeamPresenceProvider>
    </SidebarProvider>
  );
}
