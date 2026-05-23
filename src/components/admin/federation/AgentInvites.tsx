import { useState } from 'react';
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
import { Copy, Check, UserPlus, Sparkles, Shield, Zap, TrendingUp, Bot, Users, Calculator } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCreateApiKey } from '@/hooks/useApiKeys';
import { useModules, type ModulesSettings } from '@/hooks/useModules';
import { toast } from 'sonner';

type ModuleKey = keyof ModulesSettings;

interface MissionTemplate {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: 'audit' | 'operator';
  description: string;
  instructions: string;
  focusResources: string[];
  focusTools: string[];
  /** Modules that must be enabled for this mission to make sense. Empty = always available. */
  requiredModules?: ModuleKey[];
}

const MISSION_TEMPLATES: MissionTemplate[] = [
  // ── Operator missions (Scenario B: external agent IS the operator) ──
  {
    id: 'full-operator',
    name: 'Full Operator',
    icon: <Bot className="h-4 w-4" />,
    category: 'operator',
    description: 'Take full operational control — manage leads, orders, content, and growth',
    instructions: `You are the primary operator of this FlowWink business platform. There is NO built-in agent — you are in charge.

## Bootstrap

1. Read \`/rest/resources/briefing\` FIRST — it gives you identity, health metrics, active objectives, modules, and skill count in one call (~50ms).
2. Read \`/rest/resources/skills\` to discover all available capabilities.
3. Read \`/rest/resources/modules\` to understand which business modules are active.

## Your Responsibilities

You are a proactive business operator. Act on what you observe:

- **Leads**: Score, qualify, and nurture incoming leads. Move hot leads to deals.
- **Orders**: Monitor order status, handle fulfillment workflows.
- **Content**: Create and optimize blog posts, update page content for SEO.
- **CRM**: Keep the pipeline healthy — update deal stages, log activities.
- **Support**: Respond to chat conversations, resolve tickets.

## Operating Cadence

Run a periodic check (suggested: every few hours):
1. Read briefing for current state
2. Check for new leads, orders, conversations
3. Take action on anything that needs attention
4. Use \`acquire_lock\` before multi-step operations to prevent conflicts

## Concurrency

Use \`acquire_lock\` / \`release_lock\` for any multi-step operation:
\`\`\`
POST /rest/execute {"tool": "acquire_lock", "arguments": {"lane": "lead:abc123", "ttl_seconds": 120}}
... do work ...
POST /rest/execute {"tool": "release_lock", "arguments": {"lane": "lead:abc123"}}
\`\`\`

## Key Principle

You own the initiative. Don't wait for instructions — observe the platform state and act like a competent business operator would.`,
    focusResources: ['flowwink://briefing', 'flowwink://skills', 'flowwink://modules'],
    focusTools: ['acquire_lock', 'release_lock', 'list_leads', 'update_lead', 'list_orders', 'list_pages', 'update_page_block'],
  },
  {
    id: 'growth-operator',
    name: 'Growth Operator',
    icon: <TrendingUp className="h-4 w-4" />,
    category: 'operator',
    description: 'Focus on lead generation, pipeline management, and conversion optimization',
    instructions: `You are the growth operator for this FlowWink platform. Your focus is pipeline and revenue.

## Bootstrap

1. Read \`/rest/resources/briefing\` for current metrics (lead count, deal count, conversion rates).
2. Read \`/rest/resources/skills\` — filter for CRM, Lead, and Deal tools.

## Growth Loop

1. **Inbound leads**: Score and qualify new leads. Prioritize by engagement signals.
2. **Pipeline health**: Review deal stages. Move stale deals forward or flag them.
3. **Content as growth engine**: Identify high-traffic pages. Suggest or create blog content targeting keywords.
4. **Conversion optimization**: Review landing pages for CTA clarity and SEO strength.

## Tools You'll Use Most

- \`list_leads\`, \`update_lead\`, \`qualify_lead\` — lead management
- \`list_deals\`, \`update_deal\` — pipeline management
- \`list_pages\`, \`update_page_block\` — landing page optimization
- \`list_blog_posts\`, \`create_blog_post\` — content marketing

## Operating Principle

Every action should tie back to revenue. Score leads, advance deals, optimize pages — in that priority order.`,
    focusResources: ['flowwink://briefing', 'flowwink://skills'],
    focusTools: ['list_leads', 'update_lead', 'list_deals', 'update_deal', 'list_pages', 'list_blog_posts'],
    requiredModules: ['leads', 'deals'],
  },
  {
    id: 'commerce-operator',
    name: 'Commerce Operator',
    icon: <Zap className="h-4 w-4" />,
    category: 'operator',
    description: 'Manage orders, inventory, and the full commerce lifecycle',
    instructions: `You are the commerce operator for this FlowWink platform. You own orders and fulfillment.

## Bootstrap

1. Read \`/rest/resources/briefing\` for order counts and revenue metrics.
2. Read \`/rest/resources/skills\` — filter for Commerce, Order, and Product tools.

## Commerce Loop

1. **Orders**: Monitor new orders. Update fulfillment status through the pipeline (picked → packed → shipped → delivered).
2. **Inventory**: Track stock levels. Flag low-stock products.
3. **Products**: Keep catalog current — pricing, descriptions, availability.
4. **Bookings**: If booking services are active, manage appointments and availability.

## Fulfillment Pipeline

unfulfilled → picked → packed → shipped → delivered

Use \`acquire_lock\` on order operations to prevent double-processing.

## Tools You'll Use Most

- \`list_orders\`, \`update_order\` — order management
- \`list_products\`, \`update_product\` — catalog management
- \`list_bookings\` — appointment management`,
    focusResources: ['flowwink://briefing', 'flowwink://skills'],
    focusTools: ['list_orders', 'list_products', 'update_product', 'list_bookings'],
    requiredModules: ['ecommerce'],
  },


  // ── New ERP/back-office operator missions ──
  {
    id: 'hr-operator',
    name: 'HR Operator',
    icon: <Users className="h-4 w-4" />,
    category: 'operator',
    description: 'Run hiring, employment contracts, onboarding and employee lifecycle',
    instructions: `You are the HR operator for this FlowWink platform. You own the people side of the business.

## Bootstrap

1. Read \`/rest/resources/briefing\` for headcount and active HR objectives.
2. Read \`/rest/resources/skills\` — filter for HR, Recruitment, Contract, and Onboarding tools.

## HR Loop

1. **Recruitment**: Track applications. Move qualified candidates through the pipeline. Use \`hire_application\` to convert an application → employee + draft employment contract from the right template.
2. **Employment contracts**: Make sure every active employee has a signed contract. Use Swedish standard templates with token replacement (name, role, salary, start date).
3. **Onboarding**: When a new employee is created, attach the role/department onboarding checklist and monitor progress.
4. **Employee directory**: Keep employees, roles, departments and managers up to date.

## Key Principle

Close the Hire-to-Onboard loop end-to-end — application in, fully onboarded employee with contract out. Never leave a new hire without a contract or checklist.`,
    focusResources: ['flowwink://briefing', 'flowwink://skills', 'flowwink://modules'],
    focusTools: ['list_applications', 'hire_application', 'list_employees', 'create_employment_contract', 'list_onboarding_checklists'],
    requiredModules: ['hr'],
  },
  {
    id: 'finance-operator',
    name: 'Finance Operator',
    icon: <Calculator className="h-4 w-4" />,
    category: 'operator',
    description: 'Own invoicing, expenses, accounting and reconciliation (BAS 2024 aware)',
    instructions: `You are the finance operator for this FlowWink platform. You own quote-to-cash and books.

## Bootstrap

1. Read \`/rest/resources/briefing\` for revenue, AR, and open period state.
2. Read \`/rest/resources/skills\` — filter for Invoicing, Expenses, Accounting and Reconciliation tools.

## Finance Loop

1. **Quote-to-cash**: Convert accepted quotes to invoices. Send invoices, track payments, follow up on overdue.
2. **Expenses**: Review submitted expense reports. Approve/reject according to policy. Trigger autonomous booking once approved.
3. **Accounting**: Use validated booking templates (BAS 2024 for Swedish setups, IFRS/US GAAP otherwise). Never invent account numbers — always pick a template.
4. **Reconciliation**: Match bank transactions against invoices and expenses. Surface unmatched items.
5. **Period close**: Respect locked accounting periods — never modify time entries or postings inside a closed month.

## Key Principle

Books must always balance and reflect reality. Prefer autonomous reconciliation over hard triggers, and always operate via templates.`,
    focusResources: ['flowwink://briefing', 'flowwink://skills', 'flowwink://modules'],
    focusTools: ['list_invoices', 'create_invoice', 'list_expenses', 'approve_expense', 'list_journal_entries', 'reconcile_transaction'],
    requiredModules: ['invoicing', 'accounting'],
  },
  {

    id: 'custom',
    name: 'Custom Mission',
    icon: <Sparkles className="h-4 w-4" />,
    category: 'operator',
    description: 'Write your own instructions for the agent',
    instructions: '',
    focusResources: ['flowwink://briefing', 'flowwink://skills', 'flowwink://modules'],
    focusTools: [],
  },
];

const MCP_RESOURCES = [
  { uri: 'flowwink://briefing', description: 'Aggregated context: identity, health, objectives, activity, modules (~50ms)' },
  { uri: 'flowwink://health', description: 'Site statistics, active objectives, module status' },
  { uri: 'flowwink://skills', description: 'Full skill registry with metadata' },
  { uri: 'flowwink://activity', description: 'Recent agent actions and logs' },
  { uri: 'flowwink://modules', description: 'Module configuration and status' },
  { uri: 'flowwink://objectives', description: 'Active business objectives' },
  { uri: 'flowwink://automations', description: 'Configured automations with schedules' },
  { uri: 'flowwink://heartbeat', description: 'Last heartbeat run status' },
  { uri: 'flowwink://peers', description: 'Federation peer connections' },
  { uri: 'flowwink://identity', description: 'Soul and configuration' },
];

export function AgentInvites() {
  const [selectedMission, setSelectedMission] = useState<string>('full-operator');
  const [customInstructions, setCustomInstructions] = useState('');
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
      // Auto-create a scoped MCP API key
      const keyName = `MCP Agent: ${agentName || 'Unnamed'} — ${mission.name}`;
      const rawKey = await createApiKey.mutateAsync({
        name: keyName,
        scopes: ['mcp:read', 'mcp:write', 'mcp:report'],
      });

      setGeneratedKey(rawKey);

      // Auto-create a2a_peers entry so the agent appears in Federation
      const peerName = agentName || 'Unnamed';
      const { error: peerError } = await supabase
        .from('a2a_peers')
        .upsert({
          name: peerName,
          url: `https://${peerName.toLowerCase().replace(/\s+/g, '-')}.local`,
          status: 'active' as const,
          mcp_api_key: rawKey.substring(0, 12),
          capabilities: {},
        }, { onConflict: 'name' });
      
      if (peerError) {
        console.warn('Failed to auto-create peer:', peerError.message);
      }

      const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;
      const instructions = selectedMission === 'custom' ? customInstructions : mission.instructions;

      const isOperator = mission.category === 'operator';
      const introLine = isOperator
        ? `You are being onboarded as the **primary operator** of a FlowWink business platform. There is no built-in agent — you have full operational control.`
        : `You have been invited to inspect and audit a FlowWink site.`;

      const prompt = `${introLine}

## Connection

- **Base URL**: ${mcpUrl}
- **Authentication**: Bearer ${rawKey}

### Option A: REST API (recommended for agents with web_fetch/curl)

Use standard HTTP requests — no MCP client needed:

\`\`\`
# List all available tools
GET ${mcpUrl}/rest/tools
Authorization: Bearer ${rawKey}

# List available resources
GET ${mcpUrl}/rest/resources
Authorization: Bearer ${rawKey}

# Read a specific resource
GET ${mcpUrl}/rest/resources/briefing
Authorization: Bearer ${rawKey}

# Execute a tool
POST ${mcpUrl}/rest/execute
Authorization: Bearer ${rawKey}
Content-Type: application/json

{"tool": "tool_name_here", "arguments": {"key": "value"}}
\`\`\`

### Option B: Native MCP (for MCP-compatible clients like Cursor, Claude Desktop)

- **Protocol**: MCP over Streamable HTTP (POST with JSON-RPC)
- Call \`tools/list\` and \`resources/list\` to discover capabilities

## Quick Start

1. ${isOperator ? 'Get full context' : 'Verify your connection'}: \`GET ${mcpUrl}/rest/resources/briefing\`
2. Discover tools: \`GET ${mcpUrl}/rest/tools\`
3. ${isOperator ? 'Understand capabilities' : 'Read site context'}: \`GET ${mcpUrl}/rest/resources/skills\`

## Key Resources

${mission.focusResources.map(r => {
  const info = MCP_RESOURCES.find(mr => mr.uri === r);
  const key = r.replace('flowwink://', '');
  return '- \`/rest/resources/' + key + '\` — ' + (info?.description || '');
}).join('\n')}

## Key Tools

These tools are most relevant for your mission:
${mission.focusTools.map(t => '- \`' + t + '\`').join('\n')}

## Your Mission: ${mission.name}

${instructions}
${isOperator ? '' : `
## Reporting Protocol

Use the \\\`openclaw_report_finding\\\` tool to report issues:
\\\`\\\`\\\`
POST ${mcpUrl}/rest/execute
Authorization: Bearer ${rawKey}
Content-Type: application/json

{
  "tool": "openclaw_report_finding",
  "arguments": {
    "title": "Short description",
    "description": "Detailed explanation",
    "severity": "critical | high | medium | low",
    "type": "bug | ux_issue | suggestion | missing_feature | performance | positive"
  }
}
\\\`\\\`\\\`

**Important**: Findings with severity "high" or "critical" automatically create objectives that can be acted on.
`}
## Verify Connection

\`GET ${mcpUrl}/rest/resources/briefing\` — should return identity, health metrics, active objectives, and module status.`;


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
            Generate a structured prompt to onboard an external agent (e.g. OpenClaw) via MCP.
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
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Key Tools</p>
              <div className="flex flex-wrap gap-1">
                {mission.focusTools.map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] font-mono">{t}</Badge>
                ))}
              </div>
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
