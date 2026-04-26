/**
 * Platform Automations & Workflows
 *
 * Top-level admin page for the SaaS platform's automation engine.
 * Lives independently of FlowPilot — automations with executor='platform'
 * run deterministically via the dispatcher even when no AI operator is active.
 */

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AutomationsPanel } from '@/components/admin/skills/AutomationsPanel';
import { WorkflowsPanel } from '@/components/admin/skills/WorkflowsPanel';

export default function AutomationsPage() {
  const [tab, setTab] = useState<'automations' | 'workflows'>('automations');

  return (
    <AdminPageContainer>
      <AdminPageHeader
        title="Automations & Workflows"
        description="Schedule skills, react to events, and chain multi-step flows. Runs whether or not FlowPilot is enabled."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
        </TabsList>

        <TabsContent value="automations" className="mt-6">
          <AutomationsPanel />
        </TabsContent>

        <TabsContent value="workflows" className="mt-6">
          <WorkflowsPanel />
        </TabsContent>
      </Tabs>
    </AdminPageContainer>
  );
}
