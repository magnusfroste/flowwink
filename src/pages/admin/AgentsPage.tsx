import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectedAgentsTable } from '@/components/admin/agents/ConnectedAgentsTable';
import { ConnectAgentWizard } from '@/components/admin/agents/ConnectAgentWizard';
import { McpActivityLog } from '@/components/admin/federation/McpActivityLog';
import { McpFindings } from '@/components/admin/federation/McpFindings';
import { MissionDispatchDialog } from '@/components/admin/federation/MissionDispatchDialog';
import { useConnectedAgents } from '@/hooks/useAgents';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Send } from 'lucide-react';

/**
 * Agents — the people's own MCP clients and FlowPilot's helpers, connected to
 * this instance. Two things to do here: see who is connected, connect one more.
 * Advanced: hand a mission to an OpenClaw helper (FlowPilot's own tool, kept
 * until it moves to FlowWink-as-MCP-client).
 */
export default function AgentsPage() {
  const [tab, setTab] = useState('agents');
  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Agents"
          description="FlowWink is the shared operating surface. FlowPilot is built in; everyone else connects their own agent over MCP — Claude, ChatGPT, Cursor, Gemini, Copilot, Hermes."
        />
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="agents">Connected agents</TabsTrigger>
            <TabsTrigger value="connect">Connect an agent</TabsTrigger>
            <TabsTrigger value="activity">Activity & findings</TabsTrigger>
          </TabsList>
          <TabsContent value="agents">
            <ConnectedAgentsTable />
          </TabsContent>
          <TabsContent value="connect">
            <ConnectAgentWizard mode="admin" />
          </TabsContent>
          <TabsContent value="activity" className="space-y-6">
            <McpActivityLog />
            <McpFindings />
          </TabsContent>
        </Tabs>
        <OpenClawDispatch />
      </div>
    </AdminLayout>
  );
}

/** FlowPilot's helper: dispatch a mission to a connected OpenClaw agent. */
function OpenClawDispatch() {
  const { data: agents } = useConnectedAgents();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const claws = (agents ?? []).filter((a) => a.status === 'active' && (a.client_kind === 'openclaw' || a.client_kind === 'hermes' || /claw/i.test(a.name)));
  if (claws.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Advanced — dispatch a mission</CardTitle>
        <CardDescription>Hand an autonomous mission to an OpenClaw helper. Findings land under Activity & findings.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {claws.map((a) => (
          <Button key={a.id} size="sm" variant="outline" onClick={() => setTarget({ id: a.id, name: a.name })}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> {a.name}
          </Button>
        ))}
        {target && <MissionDispatchDialog peer={target} onClose={() => setTarget(null)} />}
      </CardContent>
    </Card>
  );
}
