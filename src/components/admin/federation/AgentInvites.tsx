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
import { Copy, Check, UserPlus, Sparkles, Shield, Search, BarChart3, ShoppingCart } from 'lucide-react';
import { useCreateApiKey } from '@/hooks/useApiKeys';
import { toast } from 'sonner';

interface MissionTemplate {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  instructions: string;
  focusResources: string[];
  focusTools: string[];
}

const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'full-audit',
    name: 'Full Site Audit',
    icon: <Shield className="h-4 w-4" />,
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
    description: 'Write your own instructions for the agent',
    instructions: '',
    focusResources: ['flowwink://health', 'flowwink://skills', 'flowwink://activity'],
    focusTools: ['openclaw_report_finding'],
  },
];

const MCP_RESOURCES = [
  { uri: 'flowwink://health', description: 'Site statistics, active objectives, module status' },
  { uri: 'flowwink://skills', description: 'Full skill registry with metadata' },
  { uri: 'flowwink://activity', description: 'Recent FlowPilot actions and logs' },
  { uri: 'flowwink://modules', description: 'Module configuration and status' },
  { uri: 'flowwink://peers', description: 'Federation peer connections' },
  { uri: 'flowwink://identity', description: 'FlowPilot soul and configuration' },
];

export function AgentInvites() {
  const [selectedMission, setSelectedMission] = useState<string>('full-audit');
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

      const prompt = `You have been invited to inspect and audit a FlowWink site.

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

# Read a specific resource (health, skills, modules, activity, peers, identity)
GET ${mcpUrl}/rest/resources/health
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

1. Verify your connection: \`GET ${mcpUrl}/rest/resources/health\`
2. Discover tools: \`GET ${mcpUrl}/rest/tools\`
3. Read site context: \`GET ${mcpUrl}/rest/resources/skills\`

## Key Resources

${mission.focusResources.map(r => {
  const info = MCP_RESOURCES.find(mr => mr.uri === r);
  const key = r.replace('flowwink://', '');
  return '- `/rest/resources/' + key + '` — ' + (info?.description || '');
}).join('\n')}

## Key Tools

These tools are most relevant for your mission:
${mission.focusTools.map(t => '- `' + t + '`').join('\n')}

## Your Mission: ${mission.name}

${instructions}

## Reporting Protocol

Use the \`openclaw_report_finding\` tool to report issues:
\`\`\`
POST ${mcpUrl}/rest/execute
Authorization: Bearer ${rawKey}
Content-Type: application/json

{
  "tool": "openclaw_report_finding",
  "arguments": {
    "title": "Short description",
    "description": "Detailed explanation",
    "severity": "critical | high | medium | low",
    "type": "seo | content | structure | accessibility | commerce | security"
  }
}
\`\`\`

**Important**: Findings with severity "high" or "critical" automatically create objectives for FlowPilot, which will attempt to fix them autonomously.

## Verify Connection

\`GET ${mcpUrl}/rest/resources/health\` — should return site statistics and active objectives.`;

      setGeneratedPrompt(prompt);
      toast.success('Invite prompt generated with API key');
    } catch (err) {
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
            Generate a structured prompt to onboard an external agent (e.g. OpenClaw) as a MCP-connected collaborator.
            The agent gets read/write access to inspect your site and report findings that FlowPilot acts on.
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
                {MISSION_TEMPLATES.map(t => (
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
