/**
 * Platform Automations & Workflows
 *
 * Top-level admin page for the SaaS platform's automation engine.
 * Lives independently of FlowPilot — automations with executor='platform'
 * run deterministically via the dispatcher even when no AI operator is active.
 */

import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AutomationsPanel } from '@/components/admin/skills/AutomationsPanel';
import { AutomationEditorSheet } from '@/components/admin/skills/AutomationsPanel';
import { WorkflowsPanel } from '@/components/admin/skills/WorkflowsPanel';
import { AutomationHealthPanel } from '@/components/admin/skills/AutomationHealthPanel';
import { EventsPanel } from '@/components/admin/skills/EventsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Timer, GitBranch, Zap, Activity, Plus } from 'lucide-react';
import type { AgentAutomation } from '@/types/agent';
import { useUpsertAutomation } from '@/hooks/useAutomations';
import { useTabParam } from '@/hooks/useTabParam';

export default function AutomationsPage() {
  // ?tab=health from the Automation Health widget's "Details" link.
  const [tab, setTab] = useTabParam('automations');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AgentAutomation | null>(null);
  const upsert = useUpsertAutomation();

  const handleNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleEdit = (auto: AgentAutomation) => {
    setEditing(auto);
    setEditorOpen(true);
  };

  const handleSave = (data: Partial<AgentAutomation> & { name: string }) => {
    upsert.mutate(data);
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Automations & Workflows"
          description="Schedule skills, react to events, and chain multi-step flows. Runs whether or not FlowPilot is enabled."
        >
          <Button onClick={handleNew} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Automation
          </Button>
        </AdminPageHeader>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
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
            <AutomationsPanel onEdit={handleEdit} />
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

        <AutomationEditorSheet
          automation={editing}
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onSave={handleSave}
        />
      </AdminPageContainer>
    </AdminLayout>
  );
}
