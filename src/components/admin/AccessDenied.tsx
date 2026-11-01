import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * The one "Access Denied" screen for the admin shell — and it has a way out.
 *
 * Found on optic, 2026-10-26 and again 2026-10-29: Svante (sales + marketing)
 * reported that he "could not log in", and was made admin to get past it. He was
 * logged in the whole time (a Safari session from August, refreshed that
 * morning). Safari reopens the tab where it was closed, and that tab stood on a
 * page his roles do not include — FlowChat, Settings, Users: 47 of the 112
 * admin routes for that role pair. The deny had no link, no path and no name of
 * who could change it, so the first thing a colleague saw after opening the
 * browser was a dead end, and a dead end at the front door reads as "I cannot
 * log in". The role was never the problem; the screen was.
 *
 * Two facts and two doors. The facts: WHICH page was refused (the path, so
 * "this page" is not a mystery when the sidebar is not drawn) and WHO grants it
 * (an admin, under Users → Roles — the EmailRouteNotice rule: the diagnosis is
 * for everyone, the door is for admins). The doors: the dashboard, which every
 * staff role may open, and sign-out for the colleague who is in the wrong
 * account. A customer role (no staff role at all) is sent to the portal
 * instead, since the dashboard would refuse them again.
 */
export type AccessDeniedReason = 'route' | 'not-staff';

export interface AccessDeniedProps {
  reason: AccessDeniedReason;
  /** The pathname that was refused — named on screen for `route`. */
  pathname?: string;
  /** Signs the user out; the "Switch account" door. Omitted → no such door. */
  onSignOut?: () => void | Promise<void>;
}

export function AccessDenied({ reason, pathname, onSignOut }: AccessDeniedProps) {
  const route = reason === 'route';
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4" data-access-denied={reason}>
      <div className="max-w-md text-center">
        <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground">
          {route
            ? <>Your role does not include <code className="rounded bg-muted px-1 py-0.5 text-sm text-foreground">{pathname || 'this page'}</code>.</>
            : <>Your account has no staff role, so the admin area is not yours to open.</>}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {route
            ? 'An administrator grants pages per role under Users → Roles. Everything your role does include is on the dashboard.'
            : 'An administrator adds staff roles under Users. The customer portal is the place for your account.'}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to={route ? '/admin' : '/account'}>{route ? 'Go to dashboard' : 'Go to customer portal'}</Link>
          </Button>
          {onSignOut && (
            <Button variant="outline" onClick={() => { void onSignOut(); }}>
              Switch account
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
