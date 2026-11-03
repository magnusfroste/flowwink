import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, FileText, Users, BookOpen, Image, Mail,
  Puzzle, Webhook, UserCheck, Briefcase, Building2, Package, Library, ShoppingCart,
  CalendarDays, Plug, Bot, Zap, MessageSquare, Headphones, Megaphone, Code2,
  Video, Target, Rocket, LayoutGrid, Inbox, Menu, ArrowUpCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AdminThemeToggle } from './AdminThemeToggle';
import { FlowPilotBriefingBell } from './FlowPilotBriefingBell';
import { NotificationsBell } from './NotificationsBell';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { PinnedPagesBar } from './PinnedPagesBar';
import { PinnedScroller } from './PinnedScroller';
import { QuickCreateMenu } from './QuickCreateMenu';
import { PersonMenu } from './PersonMenu';


// Icon registry — resolves the stored lucide icon NAME to its component.
// The old hand-curated 31-icon map was why some pins had icons and others
// none: pin a page whose nav icon (Shield, Database, Cable, …) was not in
// the list and the lookup came back empty. The full lucide namespace covers
// every icon the navigation can use; FileText is the fallback so a pin is
// never icon-less even if a stored name goes stale.
import * as LucideIcons from 'lucide-react';
const iconMap: Record<string, React.ComponentType<{ className?: string }>> =
  LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;

export function AdminContentHeader() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fpEnabled = useIsModuleEnabled('flowpilot');

  return (
    <div className="h-10 flex items-center gap-1 px-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">

      {/* Pinned favorites — on every admin page, the FlowPilot page too. It
          used to hide them: a leftover from the edge-to-edge "cockpit mode",
          and the one page where an admin lost their way back (2026-10-30). */}
      <PinnedScroller>
        <PinnedPagesBar userId={user?.id} />
      </PinnedScroller>

      {/* Quick create + Briefing bell + Theme toggle */}
      <QuickCreateMenu />
      <NotificationsBell />
      <FlowPilotBriefingBell />
      <AdminThemeToggle />

      {/* The person menu — the one place for you (profile, security, employment, agents). */}
      <PersonMenu />
    </div>
  );
}

// Export icon map + pin hook helper for sidebar integration
export { iconMap };
