import { useState } from 'react';
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
import { Copy, Check, UserPlus, Sparkles, Shield, Search, BarChart3, ShoppingCart, Zap, TrendingUp, Pen, Bot } from 'lucide-react';
import { useCreateApiKey } from '@/hooks/useApiKeys';
import { toast } from 'sonner';

interface MissionTemplate {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: 'audit' | 'operator';
  description: string;
  instructions: string;
  focusResources: string[];
  focusTools: string[];
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
  },
  {
    id: 'content-operator',
    name: 'Content Operator',
    icon: <Pen className="h-4 w-4" />,
    category: 'operator',
    description: 'Own the content calendar — create, optimize, and publish across all channels',
    instructions: `You are the content operator for this FlowWink platform. You own all written content.

## Bootstrap

1. Read \`/rest/resources/briefing\` for site identity and current content stats.
2. Read \`/rest/resources/skills\` — filter for CMS, Blog, and Page tools.

## Content Strategy

1. **Blog pipeline**: Create new posts aligned with the site's identity and target audience.
2. **Page optimization**: Review existing pages for SEO (meta titles, descriptions, heading structure).
3. **Knowledge base**: Keep KB articles current and comprehensive.
4. **Product descriptions**: Ensure all products have compelling, SEO-friendly copy.

## Quality Standards

- Meta titles: 50-60 chars, include primary keyword
- Meta descriptions: 120-160 chars, compelling CTAs
- Single H1 per page, proper heading hierarchy
- Content length: 800+ words for blog posts, 200+ for product descriptions

## Publishing Workflow

1. Create draft → 2. Review/optimize → 3. Publish
Use \`acquire_lock\` when editing pages to prevent conflicts.`,
    focusResources: ['flowwink://briefing', 'flowwink://skills'],
    focusTools: ['list_pages', 'update_page_block', 'list_blog_posts', 'create_blog_post', 'list_products'],
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
  },

  // ── Audit missions (existing: external agent as inspector) ──
  {
    id: 'full-audit',
    name: 'Full Site Audit',
    icon: <Shield className="h-4 w-4" />,
    category: 'audit',
    description: 'Comprehensive quality review — SEO, content, structure, accessibility',
    instructions: `Your mission is to perform a comprehensive quality audit of this FlowWink site.

1. Start by reading flowwink://health to understand the current state
2. Read flowwink://skills to see what capabilities are available
3. Inspect all pages using the page management tools — check for:
   - Missing or weak meta descriptions
   - Empty or placeholder content
   - Broken internal structure
   - SEO issues (title length, heading hierarchy)
4. Review products for completeness (descriptions, images, pricing)
5. Check blog posts for quality and SEO optimization
6. Report every finding using openclaw_report_finding with appropriate severity:
   - critical: Broken functionality or missing essential content
   - high: SEO issues, missing meta, poor UX patterns
   - medium: Content improvements, optimization opportunities
   - low: Minor suggestions and polish

Focus on actionable findings that FlowPilot can fix autonomously.`,
    focusResources: ['flowwink://health', 'flowwink://skills', 'flowwink://activity'],
    focusTools: ['openclaw_report_finding', 'list_pages', 'list_products', 'list_blog_posts'],
  },
  {
    id: 'seo-audit',
    name: 'SEO Review',
    icon: <Search className="h-4 w-4" />,
    category: 'audit',
    description: 'Focused review of meta tags, headings, content structure',
    instructions: `Your mission is to audit this site's SEO health.

1. Read flowwink://health for an overview
2. List all pages and inspect each one for:
   - Title tag (exists, length 50-60 chars, includes keywords)
   - Meta description (exists, length 120-160 chars, compelling)
   - H1 tag (single, descriptive)
   - Content length and quality
   - Internal linking structure
3. Check blog posts for SEO optimization
4. Report findings using openclaw_report_finding — focus on high-impact items first

Prioritize pages that are published and public-facing.`,
    focusResources: ['flowwink://health'],
    focusTools: ['openclaw_report_finding', 'list_pages', 'list_blog_posts'],
  },
  {
    id: 'content-review',
    name: 'Content Quality',
    icon: <BarChart3 className="h-4 w-4" />,
    category: 'audit',
    description: 'Review content for clarity, completeness and engagement',
    instructions: `Your mission is to review content quality across the site.

1. Read flowwink://health and flowwink://skills for context
2. Review all pages — evaluate:
   - Clarity and readability of copy
   - Consistency of tone and messaging
   - Call-to-action effectiveness
   - Visual content balance (text vs images)
3. Review blog posts for:
   - Engaging headlines
   - Proper excerpts
   - Content depth and value
4. Check knowledge base articles for completeness
5. Report findings using openclaw_report_finding

Focus on improvements that directly impact visitor engagement and conversion.`,
    focusResources: ['flowwink://health', 'flowwink://skills'],
    focusTools: ['openclaw_report_finding', 'list_pages', 'list_blog_posts'],
  },
  {
    id: 'commerce-audit',
    name: 'Commerce Review',
    icon: <ShoppingCart className="h-4 w-4" />,
    category: 'audit',
    description: 'Review products, pricing, and purchase flow',
    instructions: `Your mission is to audit the commerce setup.

1. Read flowwink://health for store overview
2. List and inspect all products for:
   - Complete descriptions
   - Pricing consistency
   - Image availability
   - Variant/option completeness
3. Review order flow and checkout-related pages
4. Check booking services if applicable
5. Report findings using openclaw_report_finding

Focus on issues that could prevent or discourage purchases.`,
    focusResources: ['flowwink://health'],
    focusTools: ['openclaw_report_finding', 'list_products', 'list_pages'],
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

  const mission = MISSION_TEMPLATES.find(m => m.id === selectedMission)!;

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
            Choose an <strong>Operator</strong> mission to hand over operational control, or an <strong>Audit</strong> mission for read-only inspection.
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
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Operator (Scenario B)</div>
                {MISSION_TEMPLATES.filter(t => t.category === 'operator').map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      {t.icon}
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1.5">Audit / Review</div>
                {MISSION_TEMPLATES.filter(t => t.category === 'audit').map(t => (
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
              <Badge variant={mission.category === 'operator' ? 'default' : 'secondary'} className="text-[10px] ml-auto">
                {mission.category === 'operator' ? 'Operator' : 'Audit'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
