import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectedAgentsTable } from '@/components/admin/agents/ConnectedAgentsTable';
import { ConnectAgentWizard } from '@/components/admin/agents/ConnectAgentWizard';
import { McpActivityLog } from '@/components/admin/federation/McpActivityLog';
import { McpFindings } from '@/components/admin/federation/McpFindings';

/**
 * Agents — the people's own MCP clients and FlowPilot's helpers, connected to
 * this instance. Two things to do here: see who is connected, connect one more.
 * The former Federation page (A2A peers, channels, invitation tree) stays
 * reachable under Advanced until it is retired.
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
        <p className="text-xs text-muted-foreground">
          Advanced: the legacy <Link to="/admin/federation" className="underline">Federation page</Link> (A2A peers, channels, invitation tree) is still there while it is being retired.
        </p>
      </div>
    </AdminLayout>
  );
}
