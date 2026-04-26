/**
 * Platform Automations & Workflows
 *
 * Top-level admin page for the SaaS platform's automation engine.
 * Lives independently of FlowPilot — automations with executor='platform'
 * run deterministically via the dispatcher even when no AI operator is active.
 */

import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AutomationsPanel } from '@/components/admin/skills/AutomationsPanel';
import { WorkflowsPanel } from '@/components/admin/skills/WorkflowsPanel';
import { AutomationHealthPanel } from '@/components/admin/skills/AutomationHealthPanel';
import { EventsPanel } from '@/components/admin/skills/EventsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Timer, GitBranch, Zap, Activity } from 'lucide-react';

export default function AutomationsPage() {
  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
        title="Automations & Workflows"
        description="Schedule skills, react to events, and chain multi-step flows. Runs whether or not FlowPilot is enabled."
      />

      <Tabs defaultValue="automations" className="space-y-6">
        <TabsList>
          <TabsTrigger value="automations" className="gap-2">
            <Timer className="h-4 w-4" />
            Automations
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2">
            <GitBranch className="h-4 w-4" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-2">
            <Zap className="h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <Activity className="h-4 w-4" />
            Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automations" className="space-y-4">
          <AutomationsPanel />
        </TabsContent>
        <TabsContent value="workflows" className="space-y-4">
          <WorkflowsPanel />
        </TabsContent>
        <TabsContent value="events" className="space-y-4">
          <EventsPanel />
        </TabsContent>
        <TabsContent value="health" className="space-y-4">
          <AutomationHealthPanel />
        </TabsContent>
      </Tabs>
    </AdminPageContainer>
  );
}
