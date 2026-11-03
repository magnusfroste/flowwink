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
import { useQueryClient } from '@tanstack/react-query';
import { callSkill } from '@/lib/call-skill';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Info, Save, Loader2,
} from 'lucide-react';
import { COCKPIT_TABS as TABS, resolveCockpitTab, type FlowPilotTab } from '@/lib/cockpit-tabs';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminContentHeader } from '@/components/admin/AdminContentHeader';
import { AdminSearchCommand, useAdminSearch } from '@/components/admin/AdminSearchCommand';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ObjectivesPanel } from '@/components/admin/skills/ObjectivesPanel';
import { EvolutionPanel } from '@/components/admin/skills/EvolutionPanel';
import { DistilledProposalsPanel } from '@/components/admin/skills/DistilledProposalsPanel';
import { SelfHealingAlert } from '@/components/admin/skills/SelfHealingAlert';
import { AutonomyScheduleTab } from '@/components/admin/AutonomyScheduleTab';
import { FlowPilotStatusBar } from '@/components/admin/copilot/FlowPilotStatusBar';
import { FlowPilotOverviewTab } from '@/components/admin/copilot/FlowPilotOverviewTab';
import { FlowPilotTraceTab } from '@/components/admin/copilot/FlowPilotTraceTab';
import { AgentMemoryBrowser } from '@/components/admin/copilot/AgentMemoryBrowser';
import { ConfigRawEditor } from '@/components/admin/modules/ConfigRawEditor';

import {
  useAutonomyScheduleSettings,
  useUpdateAutonomyScheduleSettings,
  AutonomyScheduleSettings,
  defaultAutonomyScheduleSettings,
} from '@/hooks/useSiteSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Four tabs, each answering one question an admin has (FlowPilot review,
 * 2026-10-29 — there were eight, two of them placeholders):
 *   Today     — what happened, what needs me
 *   Goals     — what it works on, and what it did for each
 *   Behaviour — how it acts: schedule, voice and rules, memory, trust
 *   Log       — every run, with why it did what it did
 */
export default function CopilotPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchOpen, setSearchOpen } = useAdminSearch();

  const tabParam: FlowPilotTab = resolveCockpitTab(searchParams.get('tab'));

  const setActiveTab = (tab: FlowPilotTab) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'today') params.delete('tab');
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

  // Mark all unread FlowPilot briefings as read when the cockpit is opened —
  // this is what clears the header bell badge.
  const queryClient = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { error } = await supabase
        .from('flowpilot_briefings')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (!cancelled && !error) {
        queryClient.invalidateQueries({ queryKey: ['flowpilot-briefings'] });
        queryClient.invalidateQueries({ queryKey: ['flowpilot-briefing'] });
        queryClient.invalidateQueries({ queryKey: ['proactive-unread-count'] });
      }
    })();
    return () => { cancelled = true; };
  }, [queryClient]);

  const handleSaveAutonomy = async () => {
    setAutonomySaving(true);
    try {
      await updateAutonomy.mutateAsync(autonomyData);
      await callSkill('update_autonomy_cadence');
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
          {tabParam === 'today' && (
            <>
              <div className="px-4 pt-4 max-w-7xl mx-auto"><SelfHealingAlert /></div>
              <FlowPilotOverviewTab />
            </>
          )}

          {tabParam === 'goals' && (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4 max-w-7xl mx-auto">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle className="text-sm">Goals</AlertTitle>
                  <AlertDescription className="text-xs">
                    What FlowPilot works on when nobody asks it anything. Each run picks up the active goals, works
                    them to a concrete result and records what it did — open a goal to see its history. Pause a goal
                    to stop work on it without losing it.
                  </AlertDescription>
                </Alert>
                <ObjectivesPanel />
              </div>
            </ScrollArea>
          )}

          {tabParam === 'behaviour' && (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-8 max-w-7xl mx-auto">
                <section className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold">When it works</h2>
                      <p className="text-xs text-muted-foreground max-w-2xl">
                        The heartbeat is FlowPilot's working session: at these hours it reads its goals, acts and writes
                        what it did to the Log. Turn it off and FlowPilot only acts when someone asks in FlowChat.
                        Times are the business's own clock (Site settings).
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

                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">What it may do on its own</h2>
                    <p className="text-xs text-muted-foreground max-w-2xl">
                      Every skill has a trust level. <strong>Auto</strong> runs without asking. <strong>Notify</strong> runs
                      and shows up under “Acted on its own” on Today until someone has looked. <strong>Approve</strong> waits
                      in Approvals for a person. Change a skill's level under{' '}
                      <Link to="/admin/approvals?tab=gated-skills" className="underline">Approvals → Gated Skills</Link>.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">Voice and rules</h2>
                    <p className="text-xs text-muted-foreground max-w-2xl">
                      Who FlowPilot is and the rules it follows — its soul, identity and operating rules. They shape every
                      FlowPilot answer and action (FlowChat included). Change them when it sounds wrong or keeps doing
                      something it shouldn't; every save keeps a snapshot you can return to.
                    </p>
                  </div>
                  <ConfigRawEditor />
                </section>

                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">What it remembers</h2>
                    <p className="text-xs text-muted-foreground max-w-2xl">
                      Facts, preferences and lessons FlowPilot carries between runs. It writes most of them itself; remove
                      one that is wrong or outdated, or add a fact it should always know.
                    </p>
                  </div>
                  <AgentMemoryBrowser />
                </section>

                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">How it improves itself</h2>
                    <p className="text-xs text-muted-foreground max-w-2xl">
                      Patterns FlowPilot noticed in its own work and proposes to turn into skills, and the changes it has
                      made to its own instructions. Nothing here changes behaviour until it is approved.
                    </p>
                  </div>
                  <DistilledProposalsPanel />
                  <EvolutionPanel />
                </section>
              </div>
            </ScrollArea>
          )}

          {tabParam === 'log' && (
            <div className="h-full flex flex-col">
              <div className="px-4 pt-3 text-xs text-muted-foreground">
                Every run, newest first — select one to see why it did what it did, then each step. Conversations are under{' '}
                <Link to="/admin/flowchat/sessions" className="underline">FlowChat</Link> and{' '}
                <Link to="/admin/flowwork/sessions" className="underline">FlowWork</Link> sessions.
              </div>
              <div className="flex-1 min-h-0"><FlowPilotTraceTab /></div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
