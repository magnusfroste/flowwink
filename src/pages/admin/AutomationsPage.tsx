/**
 * Platform Automations & Workflows
 *
 * Top-level admin page for the SaaS platform's automation engine.
 * Lives independently of FlowPilot — automations with executor='platform'
 * run deterministically via the dispatcher even when no AI operator is active.
 */

import { useState } from 'react';
import { Timer, GitBranch, Zap, Activity, type LucideIcon } from 'lucide-react';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AutomationsPanel } from '@/components/admin/skills/AutomationsPanel';
import { WorkflowsPanel } from '@/components/admin/skills/WorkflowsPanel';
import { AutomationHealthPanel } from '@/components/admin/skills/AutomationHealthPanel';
import { EventsPanel } from '@/components/admin/skills/EventsPanel';
import { cn } from '@/lib/utils';

type Section = 'automations' | 'workflows' | 'events' | 'health';

interface NavItem {
  id: Section;
  label: string;
  description: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { id: 'automations', label: 'Automations', description: 'Schedules & event triggers', icon: Timer },
  { id: 'workflows', label: 'Workflows', description: 'Multi-step skill chains', icon: GitBranch },
  { id: 'events', label: 'Events', description: 'Live platform event log', icon: Zap },
  { id: 'health', label: 'Health', description: 'Run history & error rates', icon: Activity },
];

const SECTION_TITLES: Record<Section, { title: string; description: string }> = {
  automations: {
    title: 'Automations',
    description: 'Run skills on a schedule or in response to events.',
  },
  workflows: {
    title: 'Workflows',
    description: 'Chain multiple skills into deterministic, multi-step flows.',
  },
  events: {
    title: 'Events',
    description: 'Inspect the live platform event stream that fires event-based automations.',
  },
  health: {
    title: 'Health',
    description: 'Run counts, error rates and freshness across all automations.',
  },
};

export default function AutomationsPage() {
  const [section, setSection] = useState<Section>('automations');
  const current = SECTION_TITLES[section];

  return (
    <AdminPageContainer>
      <AdminPageHeader
        title="Automations & Workflows"
        description="Schedule skills, react to events, and chain multi-step flows. Runs whether or not FlowPilot is enabled."
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Left nav panel */}
        <nav className="space-y-1 lg:sticky lg:top-4 lg:self-start">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2.5 transition-colors flex items-start gap-3 group',
                  active
                    ? 'bg-primary/10 text-foreground'
                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 mt-0.5 shrink-0',
                    active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <div className="min-w-0">
                  <div className={cn('text-sm font-medium', active && 'text-foreground')}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{current.title}</h2>
            <p className="text-sm text-muted-foreground">{current.description}</p>
          </div>

          {section === 'automations' && <AutomationsPanel />}
          {section === 'workflows' && <WorkflowsPanel />}
          {section === 'events' && <EventsPanel />}
          {section === 'health' && <AutomationHealthPanel />}
        </div>
      </div>
    </AdminPageContainer>
  );
}
