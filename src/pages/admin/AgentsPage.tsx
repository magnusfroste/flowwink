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
import { useAuth } from '@/hooks/useAuth';
import { useRoleModuleAccess } from '@/hooks/useRoleModuleAccess';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Send } from 'lucide-react';
import type { AppRole } from '@/types/cms';

/**
 * Agents — the people's own MCP clients and FlowPilot's helpers, connected to
 * this instance.
 *
 * Two surfaces on one page, decided by the matrix: admins and roles granted
 * `federation` manage EVERYONE's agents (owner, activity, findings, OpenClaw
 * dispatch). Every other staff member gets *My agents* — their own, and the
 * wizard to connect one — because an agent acts as its owner and never reaches
 * further (#649), so connecting your own needs no admin. Until 2026-10-27 this
 * page required `federation`, and the staff door at /account/agents sent staff
 * back to /admin: a colleague with sales + marketing had nowhere to connect
 * their Claude and was made admin for it (optic).
 */
export default function AgentsPage() {
  const { isAdmin, roles } = useAuth();
  const { data: accessMap } = useRoleModuleAccess();
  const managesAgents = isAdmin || (roles as AppRole[]).some((r) => accessMap?.[r]?.has('federation'));
  return (
    <AdminLayout>
      {managesAgents ? <EveryonesAgents /> : <MyAgents />}
    </AdminLayout>
  );
}

function MyAgents() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="My agents"
        description="Connect the AI assistant you already use — Claude, ChatGPT, Cursor, Gemini, Copilot. It works here as you, within your access, and everything it does carries your name."
      />
      <ConnectedAgentsTable mine />
      <ConnectAgentWizard mode="self" />
    </div>
  );
}

function EveryonesAgents() {
  const [tab, setTab] = useState('agents');
  return (
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
