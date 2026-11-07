import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useModules } from '@/hooks/useModules';
import { publicModuleOff, publicRouteModule } from '@/lib/public-route-modules';
import NotFound from '@/pages/NotFound';

/**
 * A module that is off is off for visitors too (2026-11-07). Sits in the
 * router's root layout, so every public route passes it: a route of a module
 * the modules row does not carry as enabled answers the site's own 404 — to
 * a visitor, those pages do not exist. A mapped route waits for the row with
 * a spinner rather than the page (a slow row is not an open door: the
 * feedback form must not take a post in the second before the verdict).
 * Module-less routes never wait and never block.
 */
export function PublicModuleGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { data: modules, isLoading } = useModules();
  const owner = publicRouteModule(pathname);
  if (owner && isLoading && !modules) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (owner && publicModuleOff(pathname, modules)) return <NotFound />;
  return <>{children}</>;
}
