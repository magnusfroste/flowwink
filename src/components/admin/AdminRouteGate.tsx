/**
 * The role matrix, for an admin page that renders OUTSIDE AdminLayout.
 *
 * AdminLayout gates every route it wraps through isRouteAllowed(). A page that
 * draws its own chrome (the template live preview: full-bleed, no sidebar)
 * skipped that gate entirely, and the most restricted staff role was served it
 * (view sweep, 2026-10-01). Same rules, same order, same spinner-not-page rule:
 * a slow matrix is not an open door.
 */
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRoleModuleAccess } from '@/hooks/useRoleModuleAccess';
import { isRouteAllowed } from '@/lib/admin-route-access';
import type { AppRole } from '@/types/cms';
import { AccessDenied } from './AccessDenied';

export function AdminRouteGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, rolesReady, isAdmin, roles, signOut } = useAuth();
  const { data: accessMap, isLoading: accessLoading } = useRoleModuleAccess();
  const switchAccount = async () => { await signOut(); navigate('/auth'); };

  if (loading || !rolesReady || (!isAdmin && accessLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin && !isRouteAllowed(location.pathname, { isAdmin, roles: roles as AppRole[], accessMap })) {
    return <AccessDenied reason="route" pathname={location.pathname} onSignOut={switchAccount} />;
  }

  return <>{children}</>;
}
