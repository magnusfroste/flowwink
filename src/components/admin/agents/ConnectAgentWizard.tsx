import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Check, ChevronRight, Copy, Loader2, Plug } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useModules } from '@/hooks/useModules';
import { useConnectAgent, useOwnerCandidates, type ConnectAgentResult } from '@/hooks/useAgents';
import { AGENT_CLIENTS, agentClient, type AgentClientKind } from '@/lib/agent-clients';
import { MISSION_TEMPLATES, TOOLSET_GROUP_OPTIONS, type MissionTemplate } from '@/lib/agent-missions';
import { buildAgentPrompt } from '@/lib/agent-prompt';

/** The three choices a colleague meets; the rest lives under Advanced. */
const SIMPLE_MISSIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'full-operator', label: 'My whole role', hint: 'Everything I can do in FlowWink, through my agent' },
  { id: 'department', label: 'One department', hint: 'Growth, commerce, HR or finance' },
  { id: 'qa-sweep', label: 'QA sweep', hint: 'Inspect and report, change nothing' },
];
const DEPARTMENT_MISSIONS = ['growth-operator', 'commerce-operator', 'hr-operator', 'finance-operator'];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy — select the text and copy it by hand');
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/**
 * Connect an agent in three choices: what to call it, which client it runs in,
 * what it is for. Admins may also pick the owner and tune the toolset; a
 * colleague connecting their own agent never sees that — the server holds the
 * agent to the owner's module access regardless.
 */
export function ConnectAgentWizard({ mode }: { mode: 'admin' | 'self' }) {
  const { user, profile } = useAuth();
  const { data: modulesSettings } = useModules();
  const { data: profiles } = useOwnerCandidates(mode === 'admin');
  const connect = useConnectAgent();

  const [name, setName] = useState('');
  const [clientKind, setClientKind] = useState<AgentClientKind>('claude');
  const [ownerUserId, setOwnerUserId] = useState<string>('');
  const [simple, setSimple] = useState<string>('full-operator');
  const [department, setDepartment] = useState<string>('growth-operator');
  const [advancedMission, setAdvancedMission] = useState<string>('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [result, setResult] = useState<(ConnectAgentResult & { mission: MissionTemplate; instructions: string }) | null>(null);

  const missionAvailable = (t: MissionTemplate) =>
    !t.requiredModules?.length || !modulesSettings || t.requiredModules.every((m) => modulesSettings[m]?.enabled);
  const availableDepartments = DEPARTMENT_MISSIONS
    .map((id) => MISSION_TEMPLATES.find((m) => m.id === id)!)
    .filter((m) => m && missionAvailable(m));

  const mission = useMemo<MissionTemplate>(() => {
    const id = advancedMission || (simple === 'department' ? department : simple);
    return MISSION_TEMPLATES.find((m) => m.id === id) ?? MISSION_TEMPLATES[0];
  }, [advancedMission, simple, department]);

  const effectiveOwnerId = mode === 'admin' ? (ownerUserId || user?.id || null) : (user?.id ?? null);
  const ownerName = mode === 'admin'
    ? (profiles?.find((p) => p.id === effectiveOwnerId)?.full_name ?? profiles?.find((p) => p.id === effectiveOwnerId)?.email ?? profile?.full_name ?? null)
    : (profile?.full_name ?? profile?.email ?? null);

  const generate = async () => {
    const instructions = mission.id === 'custom' ? customInstructions : mission.instructions;
    try {
      const res = await connect.mutateAsync({
        name: name.trim(),
        clientKind,
        ownerUserId: mode === 'admin' ? effectiveOwnerId : undefined,
        missionId: mission.id,
        missionName: mission.id === 'custom' ? name.trim() : mission.name,
        instructions,
        focusResources: mission.focusResources,
        toolsetGroups: mode === 'admin' ? groups : [],
      });
      setResult({ ...res, mission, instructions });
      toast.success(`${name.trim()} is connected — the key is shown once`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect the agent');
    }
  };

  if (result) {
    const client = agentClient(clientKind);
    const connectUrl = result.mission.category === 'operator' ? `${result.mcpUrl}?mode=dispatch` : result.mcpUrl;
    const snippet = client.snippet(connectUrl, result.rawKey, 'flowwink');
    const prompt = buildAgentPrompt({ mission: result.mission, instructions: result.instructions, mcpUrl: result.mcpUrl, rawKey: result.rawKey, agentName: name.trim(), ownerName });
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> {name.trim()} is connected</CardTitle>
          <CardDescription>
            The key below is shown <strong>once</strong>. Paste it into your client now; if you lose it, revoke the agent and connect it again.
            {result.expiresAt && (
              <> Because this client sends the key in the URL, the key expires on {new Date(result.expiresAt).toLocaleDateString()} — reconnect to renew.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>1. {client.label} — configuration</Label>
              <CopyButton text={snippet} label="Copy config" />
            </div>
            <p className="text-xs text-muted-foreground">{client.where}</p>
            <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>2. First message to the agent</Label>
              <CopyButton text={prompt} label="Copy prompt" />
            </div>
            <p className="text-xs text-muted-foreground">
              Tells the agent who it is ({name.trim()}{ownerName ? `, acting for ${ownerName}` : ''}), how to find skills and what its mission is. The same mission is stored on the server, so it survives the agent's context.
            </p>
            <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-72">{prompt}</pre>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setResult(null); setName(''); }}>Connect another</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Connect an agent</CardTitle>
        <CardDescription>
          Three choices, two minutes. The agent gets its own key and acts for {mode === 'self' ? 'you' : 'its owner'} — never beyond what {mode === 'self' ? 'you' : 'they'} can do here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">What do you call it?</Label>
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'self' ? 'My Claude' : "Peter's Hermes"} />
          </div>
          <div className="space-y-1.5">
            <Label>Which client does it run in?</Label>
            <Select value={clientKind} onValueChange={(v) => setClientKind(v as AgentClientKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AGENT_CLIENTS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === 'admin' && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Who does it act for?</Label>
              <Select value={ownerUserId || user?.id || ''} onValueChange={setOwnerUserId}>
                <SelectTrigger><SelectValue placeholder="Me" /></SelectTrigger>
                <SelectContent>
                  {profiles?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}{p.id === user?.id ? ' (me)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The agent is held to this person's module access on every call, and their name is on everything it does.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>What is it for?</Label>
          <div className="grid gap-2 md:grid-cols-3">
            {SIMPLE_MISSIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setSimple(m.id); setAdvancedMission(''); }}
                className={`rounded-md border p-3 text-left transition-colors ${simple === m.id && !advancedMission ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <div className="font-medium text-sm">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.hint}</div>
              </button>
            ))}
          </div>
          {simple === 'department' && !advancedMission && (
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="md:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableDepartments.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {mode === 'admin' && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground group/adv">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]/adv:rotate-90" /> Advanced
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <Label>Mission template</Label>
                <Select value={advancedMission || 'none'} onValueChange={(v) => setAdvancedMission(v === 'none' ? '' : v)}>
                  <SelectTrigger className="md:w-96"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Use the choice above</SelectItem>
                    {MISSION_TEMPLATES.filter(missionAvailable).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {mission.id === 'custom' && (
                  <Textarea rows={5} value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)} placeholder="The mission, in your words" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Toolset ceiling</Label>
                <p className="text-xs text-muted-foreground">Nothing ticked = everything within the owner's reach. Tick groups to narrow it further.</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {TOOLSET_GROUP_OPTIONS.map((g) => (
                    <label key={g.id} className="flex items-start gap-2 text-sm">
                      <Checkbox checked={groups.includes(g.id)} onCheckedChange={(v) => setGroups((prev) => v ? [...prev, g.id] : prev.filter((x) => x !== g.id))} className="mt-0.5" />
                      <span><span className="font-medium">{g.label}</span><span className="block text-xs text-muted-foreground">{g.hint}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={!name.trim() || connect.isPending || (mission.id === 'custom' && !customInstructions.trim())}>
            {connect.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            Connect
          </Button>
          <Badge variant="outline" className="font-normal">{mission.name}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
