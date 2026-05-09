/**
 * FlowPilot Cockpit (`/admin/flowpilot`)
 *
 * Layer 2 of the 3-layer model:
 *  - Layer 1 (Chat / skills) → /chat
 *  - Layer 2 (Autonomous agent) → here
 *  - Layer 3 (Automations) → /admin/automations
 *
 * Inspired by Hermes Operator: this is an "agent server" — status bar at the
 * top, no embedded chat. Chat lives at /chat. Skills/MCP live in
 * /admin/developer.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Info, Save, Loader2, Activity, Target, History, Cpu, BarChart3,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminContentHeader } from '@/components/admin/AdminContentHeader';
import { AdminSearchCommand, useAdminSearch } from '@/components/admin/AdminSearchCommand';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ObjectivesPanel } from '@/components/admin/skills/ObjectivesPanel';
import { EvolutionPanel } from '@/components/admin/skills/EvolutionPanel';
import { DistilledProposalsPanel } from '@/components/admin/skills/DistilledProposalsPanel';
import { SelfHealingAlert } from '@/components/admin/skills/SelfHealingAlert';
import { AutonomyScheduleTab } from '@/components/admin/AutonomyScheduleTab';
import { FlowPilotStatusBar } from '@/components/admin/copilot/FlowPilotStatusBar';
import { FlowPilotOverviewTab } from '@/components/admin/copilot/FlowPilotOverviewTab';
import {
  useAutonomyScheduleSettings,
  useUpdateAutonomyScheduleSettings,
  AutonomyScheduleSettings,
  defaultAutonomyScheduleSettings,
} from '@/hooks/useSiteSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type FlowPilotTab = 'overview' | 'objectives' | 'sessions' | 'memory' | 'analytics';

const TABS: { id: FlowPilotTab; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'objectives', label: 'Objectives', icon: Target },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'memory', label: 'Memory & Persona', icon: Cpu },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function CopilotPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchOpen, setSearchOpen } = useAdminSearch();

  // Migrate legacy ?tab values (chat → overview, evolution/autonomy → memory)
  const raw = searchParams.get('tab');
  const tabParam: FlowPilotTab = (() => {
    if (raw === 'evolution' || raw === 'autonomy') return 'memory';
    if (raw === 'chat' || !raw) return 'overview';
    if (TABS.some(t => t.id === raw)) return raw as FlowPilotTab;
    return 'overview';
  })();

  const setActiveTab = (tab: FlowPilotTab) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'overview') params.delete('tab');
    else params.set('tab', tab);
    setSearchParams(params, { replace: true });
  };

  // Autonomy schedule (lives inside Memory & Persona tab)
  const { data: autonomySettings } = useAutonomyScheduleSettings();
  const updateAutonomy = useUpdateAutonomyScheduleSettings();
  const [autonomyData, setAutonomyData] = useState<AutonomyScheduleSettings>(defaultAutonomyScheduleSettings);
  const [autonomySaving, setAutonomySaving] = useState(false);

  useEffect(() => {
    if (autonomySettings) setAutonomyData(autonomySettings);
  }, [autonomySettings]);

  const handleSaveAutonomy = async () => {
    setAutonomySaving(true);
    try {
      await updateAutonomy.mutateAsync(autonomyData);
      await supabase.functions.invoke('update-autonomy-cron');
      toast.success('Autonomy schedule saved');
    } catch {
      toast.error('Failed to save autonomy schedule');
    } finally {
      setAutonomySaving(false);
    }
  };

  return (
    <AdminLayout>
      <AdminSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminContentHeader />

        {/* Status bar — the "agent server" pulse */}
        <FlowPilotStatusBar />

        {/* Tabs */}
        <div className="border-b bg-background sticky top-0 z-10">
          <Tabs value={tabParam} onValueChange={(v) => setActiveTab(v as FlowPilotTab)}>
            <TabsList className="h-10 bg-transparent rounded-none px-3 gap-1">
              {TABS.map(t => {
                const Icon = t.icon;
                return (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="text-xs gap-1.5 data-[state=active]:bg-accent"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {tabParam === 'overview' && <FlowPilotOverviewTab />}

          {tabParam === 'objectives' && (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4 max-w-7xl mx-auto">
                <SelfHealingAlert />
                <ObjectivesPanel />
              </div>
            </ScrollArea>
          )}

          {tabParam === 'sessions' && (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4 max-w-7xl mx-auto">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <History className="h-4 w-4 text-primary" />
                      Sessions
                    </CardTitle>
                    <CardDescription>
                      Replay individual heartbeat iterations and chat sessions where FlowPilot acted.
                      Coming next — will show prompt → reasoning → tool-calls → result with token/cost per step.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      For now, see live activity in the{' '}
                      <button
                        className="underline font-medium text-foreground"
                        onClick={() => setActiveTab('overview')}
                      >
                        Overview
                      </button>{' '}
                      tab, or all executors (FlowPilot + MCP + cron + automation) in{' '}
                      <Link to="/admin/developer?tab=mcp-activity" className="underline font-medium text-foreground">
                        Developer → MCP Activity
                      </Link>.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          )}

          {tabParam === 'memory' && (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6 max-w-7xl mx-auto">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle className="text-sm">Memory & Persona</AlertTitle>
                  <AlertDescription className="text-xs">
                    Agent DNA — schedule, learning loop, and self-improvement proposals.
                    Models, soul and trust-levels will land here next.
                  </AlertDescription>
                </Alert>

                {/* Autonomy schedule */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">Autonomy schedule</h2>
                      <p className="text-xs text-muted-foreground">
                        When FlowPilot runs its autonomous loops.
                      </p>
                    </div>
                    <Button onClick={handleSaveAutonomy} disabled={autonomySaving} size="sm">
                      {autonomySaving
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <Save className="h-4 w-4 mr-2" />}
                      Save
                    </Button>
                  </div>
                  <AutonomyScheduleTab data={autonomyData} onChange={setAutonomyData} />
                </section>

                {/* Self-improvement / evolution */}
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">Self-improvement</h2>
                    <p className="text-xs text-muted-foreground">
                      Proposals and adjustments FlowPilot has made to its own skills/memory.
                    </p>
                  </div>
                  <DistilledProposalsPanel />
                  <EvolutionPanel />
                </section>
              </div>
            </ScrollArea>
          )}

          {tabParam === 'analytics' && (
            <ScrollArea className="h-full">
              <div className="p-4 max-w-7xl mx-auto">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Analytics
                    </CardTitle>
                    <CardDescription>
                      Tokens, cost, skill success-rate, objectives velocity, HIL approval-rate and
                      heartbeat latency. Coming in step 4 of the cockpit rollout.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      Until then, see token usage in{' '}
                      <Link to="/admin/ai-usage" className="underline font-medium text-foreground">
                        AI Usage
                      </Link>{' '}
                      and per-action runs in{' '}
                      <Link to="/admin/developer?tab=mcp-activity" className="underline font-medium text-foreground">
                        Developer → MCP Activity
                      </Link>.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
