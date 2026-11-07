import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { moduleRegistry } from '@/lib/module-registry';

/**
 * "This module is switched off" — the admin shell's answer when a route
 * belongs to a module the modules row does not carry as enabled (the sidebar
 * already hid the link; `moduleOffForRoute` makes the route agree).
 *
 * Two facts and two doors, as AccessDenied: WHICH module, and WHO switches it
 * (an admin, under Modules — the deep link opens that module's sheet). The
 * doors: Modules for an admin, the dashboard for everyone.
 */
export function ModuleOff({ moduleId, isAdmin }: { moduleId: string; isAdmin: boolean }) {
  const name = moduleRegistry.get(moduleId)?.name ?? moduleId;
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4" data-module-off={moduleId}>
      <div className="max-w-md text-center">
        <h1 className="font-serif text-2xl font-bold text-foreground mb-2">{name} is switched off</h1>
        <p className="text-muted-foreground">
          This page belongs to the <span className="font-medium text-foreground">{name}</span> module, which is not enabled on this site.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAdmin
            ? 'Switch it on under Modules and the page, its skills and its automations come back together.'
            : 'An administrator switches modules on under Modules. Everything that is on is on the dashboard.'}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {isAdmin && (
            <Button asChild>
              <Link to={`/admin/modules?module=${encodeURIComponent(moduleId)}`}>Open Modules</Link>
            </Button>
          )}
          <Button asChild variant={isAdmin ? 'outline' : 'default'}>
            <Link to="/admin">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
