import { useEffect, useRef } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { rememberWorkspaceSidebar } from '@/hooks/useWorkspace';

/**
 * Inside a workspace, remembers the person's own gesture on the FlowWink menu
 * (the toggle at its top, or the keyboard shortcut): opened stays open in
 * workspaces, folded stays folded. The value the page was born with is not a
 * gesture, so the first render is skipped. Desktop only — a phone has no rail.
 */
export function WorkspaceSidebarMemory() {
  const { open, isMobile } = useSidebar();
  const born = useRef(true);
  useEffect(() => {
    if (born.current) { born.current = false; return; }
    if (!isMobile) rememberWorkspaceSidebar(open);
  }, [open, isMobile]);
  return null;
}
