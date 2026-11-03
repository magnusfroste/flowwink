import { Activity, Target, Sparkles, GitBranch } from 'lucide-react';

export type FlowPilotTab = 'today' | 'goals' | 'behaviour' | 'log';

export const COCKPIT_TABS: { id: FlowPilotTab; label: string; icon: typeof Activity }[] = [
  { id: 'today', label: 'Today', icon: Activity },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'behaviour', label: 'Behaviour', icon: Sparkles },
  { id: 'log', label: 'Log', icon: GitBranch },
];

/** Old ?tab= values (bookmarks, links in other pages) land on the tab that holds them now. */
const LEGACY_TABS: Record<string, FlowPilotTab> = {
  overview: 'today', analytics: 'today', health: 'today', chat: 'today',
  objectives: 'goals',
  persona: 'behaviour', memory: 'behaviour', autonomy: 'behaviour', evolution: 'behaviour',
  trace: 'log', sessions: 'log',
};

export function resolveCockpitTab(raw: string | null): FlowPilotTab {
  if (!raw) return 'today';
  if (COCKPIT_TABS.some((t) => t.id === raw)) return raw as FlowPilotTab;
  return LEGACY_TABS[raw] ?? 'today';
}

