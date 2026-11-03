import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useModules } from '@/hooks/useModules';
import { useRoleModuleAccess } from '@/hooks/useRoleModuleAccess';
import { isRouteAllowed } from '@/lib/admin-route-access';
import { canUseWorkspace, resolveWorkspace, visibleSections, type WorkspaceAccess, type WorkspaceDef, type WorkspaceSection } from '@/lib/workspaces';
import type { AppRole } from '@/types/cms';

const KEY = 'fw.workspace';

function readActive(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
function writeActive(id: string | null) {
  try { if (id) sessionStorage.setItem(KEY, id); else sessionStorage.removeItem(KEY); } catch { /* private mode: the workspace then ends on the next non-entry page */ }
}

const SIDEBAR_KEY = 'fw.workspace.sidebar';

/**
 * Whether the FlowWink menu stays open in a workspace. No setting: the
 * person's own gesture is the answer. Folded is the default; whoever opens the
 * menu again inside a workspace keeps it open there (this browser), until they
 * fold it again. Unreadable storage means the default.
 */
export function workspaceSidebarOpen(): boolean {
  try { return localStorage.getItem(SIDEBAR_KEY) === 'open'; } catch { return false; }
}
export function rememberWorkspaceSidebar(open: boolean) {
  try { localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'folded'); } catch { /* the default then */ }
}

/** Leave the workspace for good: the next finance page opens without its panel. */
export function leaveWorkspace() { writeActive(null); }

/**
 * The workspace showing on this page, for this person — or null. See
 * src/lib/workspaces.ts for when one shows and who sees it.
 */
export function useWorkspace(): { def: WorkspaceDef; sections: WorkspaceSection[] } | null {
  const { pathname } = useLocation();
  const { isAdmin, roles } = useAuth();
  const { data: accessMap } = useRoleModuleAccess();
  const { data: modules } = useModules();
  const { def, nextActiveId } = resolveWorkspace(pathname, readActive());

  useEffect(() => { writeActive(nextActiveId); }, [nextActiveId]);

  return useMemo(() => {
    if (!def) return null;
    const access: WorkspaceAccess = {
      moduleEnabled: (id) => {
        if (!modules) return true;
        const mod = (modules as unknown as Record<string, { enabled?: boolean; adminUI?: boolean } | undefined>)[id];
        return !!mod?.enabled && mod.adminUI !== false;
      },
      routeAllowed: (p) => isRouteAllowed(p, { isAdmin, roles: roles as AppRole[], accessMap }),
    };
    if (!canUseWorkspace(def, access)) return null;
    return { def, sections: visibleSections(def, access) };
  }, [def, modules, isAdmin, roles, accessMap]);
}
