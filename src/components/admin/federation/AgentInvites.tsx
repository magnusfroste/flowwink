import { useState } from 'react';
import { MISSION_TEMPLATES, MCP_RESOURCES, TOOLSET_GROUP_OPTIONS, type MissionTemplate } from '@/lib/agent-missions';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, UserPlus, Sparkles, Shield, Zap, TrendingUp, Bot, Users, Calculator, Bug } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCreateApiKey } from '@/hooks/useApiKeys';
import { useModules, type ModulesSettings } from '@/hooks/useModules';
import { toast } from 'sonner';

export function AgentInvites() {
  const [selectedMission, setSelectedMission] = useState<string>('full-operator');
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]); // [] = full access
  const toggleGroup = (id: string) =>
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  const [agentName, setAgentName] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const createApiKey = useCreateApiKey();
  const { data: modulesSettings } = useModules();

  // A mission is available when all its required modules are enabled
  // (or when it has no module dependency at all).
  const isMissionAvailable = (t: MissionTemplate): boolean => {
    if (!t.requiredModules || t.requiredModules.length === 0) return true;
    if (!modulesSettings) return true; // optimistic until loaded
    return t.requiredModules.every(m => modulesSettings[m]?.enabled);
  };

  const availableMissions = MISSION_TEMPLATES.filter(isMissionAvailable);
  const mission = (availableMissions.find(m => m.id === selectedMission)
    ?? MISSION_TEMPLATES.find(m => m.id === selectedMission)
    ?? availableMissions[0])!;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;
      const instructions = selectedMission === 'custom' ? customInstructions : mission.instructions;
      const peerName = agentName || mission.name;

      // Call federation-invite-peer edge function to create peer + mission record.
      // Send the logged-in admin's session JWT (NOT the public anon key) — the
      // edge function gates key-minting on has_role('admin'); the anon key would
      // let any anonymous caller mint mcp:* keys.
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/federation-invite-peer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            invitee_name: peerName,
            invitee_description: `MCP Agent: ${mission.name || 'Custom Mission'}`,
            invitee_url: `https://${peerName.toLowerCase().replace(/\s+/g, '-')}.local`,
            // Empty = full access (default-open); ticked groups scope the peer.
            // Enforced by the gateway from a2a_peers.toolset_groups.
            toolset_groups: selectedGroups,
            // Mission metadata — will be stored in federation_peer_missions
            mission_id: selectedMission === 'custom' ? 'custom' : mission.id,
            mission_name: selectedMission === 'custom' ? peerName : mission.name,
            instructions: instructions,
            focus_resources: mission.focusResources,
            // No hardcoded tool list — operators discover real skills via search_skills /
            // rest/tools. Hardcoded names drift from the registry and mislead agents.
            focus_tools: [],
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create peer invitation');
      }

      const inviteData = await response.json();
      const rawKey = inviteData.credentials?.mcp_api_key;

      if (!rawKey) {
        throw new Error('No API key returned from invitation');
      }

      setGeneratedKey(rawKey);

      const isOperator = mission.category === 'operator';
      // Operators get dispatch mode: broad reach to all skills via 2 tools
      // (search_skills + execute_skill) instead of hundreds of tool schemas.
      const connectUrl = isOperator ? `${mcpUrl}?mode=dispatch` : mcpUrl;
      // The instance the key belongs to, said out loud. Keys are per-instance;
      // naming it here is what stops "update the token" from silently keeping
      // an old URL — the failure that cost an external operator a full round of
      // debugging aimed entirely at the key.
      const instanceRef = (() => {
        try { return new URL(mcpUrl).host.split('.')[0]; } catch { return 'this instance'; }
      })();
      const introLine = isOperator
        ? `You are being onboarded as the **primary operator** of a FlowWink business platform. There is no built-in agent — you have full operational control.`
        : `You have been invited to inspect and audit a FlowWink site.`;

      const toolsSection = isOperator
        ? `## Working with tools

This platform has 500+ skills. To keep your context lean, your toolset is small — two discovery tools plus the lock pair (\`acquire_lock\` / \`release_lock\`) for multi-step work:

- \`search_skills({ query, groups? })\` — describe what you want to do; returns the most relevant skills (name, description, input schema).
- \`execute_skill({ name, arguments })\` — run a chosen skill by name.

**Workflow**: read your mission → \`search_skills("score new leads")\` → \`execute_skill("score_lead", { ... })\`. You have full reach to every skill without loading hundreds of definitions. \`groups\` is optional — omit it to search everything, or pass e.g. \`["crm","commerce"]\` to narrow the search.`
        : `## Discovering tools

Call \`tools/list\` to see what you can execute, then \`tools/call\` to run a tool.`;

      const prompt = `${introLine}

## Connection

Paste this whole block into your MCP client config — **URL and key together**.
A FlowWink key is minted for ONE instance and is rejected everywhere else, so
swapping only the token into an existing config fails with
\`Invalid or expired API key\` even though the key is perfectly good.

\`\`\`json
{
  "mcpServers": {
    "flowwink": {
      "url": "${connectUrl}",
      "headers": { "Authorization": "Bearer ${rawKey}" }
    }
  }
}
\`\`\`

- **Instance**: \`${instanceRef}\` — this key works only against this host
- **Transport**: MCP over Streamable HTTP (JSON-RPC over POST). No onboarding or REST calls are required — connect and use the standard MCP surfaces: \`resources/list\`, \`resources/read\`, \`tools/list\`, \`tools/call\`.

## First steps

1. **Read your mission**: \`resources/read\` → \`flowwink://mission\` — your role, responsibilities, focus areas, and priority tools. Read this first.
2. **Get context**: \`resources/read\` → \`flowwink://briefing\` — platform identity, health, active objectives, and modules.

${toolsSection}

## Key Resources

${mission.focusResources.map(r => {
  const info = MCP_RESOURCES.find(mr => mr.uri === r);
  const key = r.replace('flowwink://', '');
  return '- `flowwink://' + key + '` — ' + (info?.description || '');
}).join('\n')}

## Your Mission: ${mission.name}

The same mission is stored durably at the \`flowwink://mission\` resource — re-read it there in future sessions, when this message has scrolled out of your context. The resource and the text below are the same mission; this copy is just your starting point.

${instructions}
${isOperator ? '' : `
## Reporting Protocol

Use the \\\`openclaw_report_finding\\\` tool (via \`tools/call\`) to report issues, with arguments:
\\\`\\\`\\\`
{
  "title": "Short description",
  "description": "Detailed explanation",
  "severity": "critical | high | medium | low",
  "type": "bug | ux_issue | suggestion | missing_feature | performance | positive"
}
\\\`\\\`\\\`

**Important**: Findings with severity "high" or "critical" automatically create objectives that can be acted on.
`}
## Verify Connection

Read the \`flowwink://briefing\` resource — it should return identity, health metrics, active objectives, and module status.`;


      setGeneratedPrompt(prompt);
      toast.success('Invite prompt generated with API key');
    } catch {
      toast.error('Failed to generate invite');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedPrompt) return;
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Prompt copied to clipboard');
  };

  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite Agent via MCP
          </CardTitle>
          <CardDescription>
            Generate a structured prompt to onboard an external agent (e.g. OpenClaw, Hermes) as an <strong>operator</strong> of this FlowWink platform. Only missions whose required modules are enabled are shown.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Mission Selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Agent Name (optional)</Label>
            <Input
              placeholder="e.g. OpenClaw QA"
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Mission</Label>
            <Select value={selectedMission} onValueChange={setSelectedMission}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMissions.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      {t.icon}
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>

            </Select>
            <p className="text-xs text-muted-foreground">{mission.description}</p>
          </div>

          {selectedMission === 'custom' && (
            <div className="space-y-2">
              <Label>Custom Instructions</Label>
              <Textarea
                placeholder="Describe what the agent should inspect, review, or audit..."
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                rows={6}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label>Access scope</Label>
              <span className="text-xs text-muted-foreground">
                {selectedGroups.length === 0 ? 'Full access (all modules)' : `${selectedGroups.length} group${selectedGroups.length === 1 ? '' : 's'} selected`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty for full access. Tick groups to limit this agent to only those module categories — the gateway enforces it from the invite, no separate setting.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {TOOLSET_GROUP_OPTIONS.map(g => (
                <label key={g.id} htmlFor={`grp-${g.id}`} className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50">
                  <Checkbox id={`grp-${g.id}`} checked={selectedGroups.includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-tight">{g.label}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{g.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || (selectedMission === 'custom' && !customInstructions)}
            className="w-full"
          >
            {isGenerating ? 'Generating...' : 'Generate Invite Prompt'}
          </Button>
        </div>

        {/* Mission Preview */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {mission.icon}
              {mission.name}
              <Badge variant="default" className="text-[10px] ml-auto">
                Operator
              </Badge>

            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mission.requiredModules && mission.requiredModules.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Requires modules</p>
                <div className="flex flex-wrap gap-1">
                  {mission.requiredModules.map(m => (
                    <Badge key={m} variant="default" className="text-[10px] font-mono">{m}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Resources</p>
              <div className="flex flex-wrap gap-1">
                {mission.focusResources.map(r => (
                  <Badge key={r} variant="secondary" className="text-[10px] font-mono">{r}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Tools</p>
              <p className="text-[11px] text-muted-foreground">
                Discovered at runtime via <span className="font-mono">search_skills</span> — no fixed list.
              </p>
            </div>
            {selectedMission !== 'custom' && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Instructions Preview</p>
                <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto leading-relaxed">
                  {mission.instructions}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generated Prompt */}
      {generatedPrompt && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Invite Ready
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? 'Copied' : 'Copy Prompt'}
              </Button>
            </div>
            <CardDescription>
              Paste this into your agent's chat or configuration. The API key is embedded — it's shown only once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="p-4 rounded-lg bg-muted text-xs font-mono whitespace-pre-wrap max-h-96 overflow-auto leading-relaxed border">
                {generatedPrompt}
              </pre>
            </div>
            {generatedKey && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                <span>API key <code className="bg-muted px-1 rounded">{generatedKey.slice(0, 12)}...</code> created and visible in Developer → MCP Keys</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
