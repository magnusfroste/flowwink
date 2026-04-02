import { useState, useEffect } from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Code2, 
  ArrowRightLeft, 
  Webhook, 
  Database, 
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  Bot,
  Settings2,
  Eye,
  Monitor,
  Download,
  Chrome,
  Copy,
  RefreshCw,
  Plug,
  Globe,
  Mail,
} from "lucide-react";
import { moduleRegistry } from "@/lib/module-registry";
import type { ModuleCapability } from "@/types/module-contracts";
import type { ModuleStats } from "@/hooks/useModuleStats";
import type { ModuleAutonomy, ModuleConfig, ModulesSettings, BookingEmailProvider } from "@/hooks/useModules";
import { useModules, useUpdateModules } from "@/hooks/useModules";
import { formatDistanceToNow } from "date-fns";
import { useExtensionRelay } from "@/hooks/useExtensionRelay";
import { toast } from "sonner";
import JSZip from "jszip";
import { FlowPilotDetails } from "./FlowPilotDetails";
import { ComposioPanel } from "./ComposioPanel";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface ModuleDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  moduleName: string;
  moduleDescription: string;
  moduleConfig?: ModuleConfig;
  stats?: ModuleStats;
  isEnabled: boolean;
  autonomy: ModuleAutonomy;
  adminUI: boolean;
}

const CAPABILITY_INFO: Record<ModuleCapability, { label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  'content:receive': {
    label: 'Receives Content',
    description: 'Can receive content from other modules',
    icon: ArrowRightLeft,
  },
  'content:produce': {
    label: 'Produces Content',
    description: 'Generates content for other modules',
    icon: FileText,
  },
  'webhook:trigger': {
    label: 'Triggers Webhooks',
    description: 'Sends events to external systems',
    icon: Webhook,
  },
  'webhook:receive': {
    label: 'Receives Webhooks',
    description: 'Accepts incoming webhook calls',
    icon: Webhook,
  },
  'data:read': {
    label: 'Reads Data',
    description: 'Reads from the database',
    icon: Database,
  },
  'data:write': {
    label: 'Writes Data',
    description: 'Writes to the database',
    icon: Database,
  },
};

// API documentation snippets per module
const API_EXAMPLES: Record<string, { input: string; output: string }> = {
  blog: {
    input: `{
  title: "My Blog Post",
  content: "Content or TiptapDoc...",
  excerpt: "A brief summary",
  meta: {
    source_module: "content-campaign",
    keywords: ["seo", "marketing"]
  },
  options: {
    status: "published",
    author_id: "uuid"
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  slug: "my-blog-post-abc123",
  url: "/blog/my-blog-post-abc123",
  status: "published",
  published_at: "2025-01-20T..."
}`,
  },
  newsletter: {
    input: `{
  subject: "Weekly Update",
  content_html: "<p>Newsletter...</p>",
  preview_text: "This week...",
  meta: {
    source_module: "content-campaign"
  },
  options: {
    status: "draft"
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  status: "draft",
  subscriber_count: 150
}`,
  },
  crm: {
    input: `{
  email: "lead@example.com",
  name: "John Doe",
  phone: "+46701234567",
  source: "website",
  initial_score: 10,
  meta: {
    source_module: "form"
  }
}`,
    output: `{
  success: true,
  lead_id: "uuid",
  is_new: true,
  score: 10,
  status: "lead"
}`,
  },
  pages: {
    input: `{
  title: "About Us",
  content: [/* ContentBlock[] */],
  meta: {
    seo_title: "About - Company",
    seo_description: "Learn more..."
  },
  options: {
    status: "published",
    show_in_menu: true,
    menu_order: 2
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  slug: "about-us-xyz789",
  url: "/about-us-xyz789",
  status: "published"
}`,
  },
  kb: {
    input: `{
  title: "How to reset password",
  question: "How do I reset my password?",
  category_id: "uuid",
  answer: "TiptapDocument or string",
  options: {
    is_published: true,
    is_featured: false,
    include_in_chat: true
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  slug: "how-to-reset-password-abc",
  url: "/kb/how-to-reset-password-abc"
}`,
  },
  products: {
    input: `{
  name: "Premium Widget",
  price_cents: 9900,
  description: "High-quality widget",
  currency: "USD",
  type: "one_time",
  is_active: true,
  meta: {
    source_module: "ai-generator"
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  name: "Premium Widget",
  price_cents: 9900
}`,
  },
  booking: {
    input: `{
  customer_name: "Jane Doe",
  customer_email: "jane@example.com",
  start_time: "2025-01-25T10:00:00Z",
  end_time: "2025-01-25T11:00:00Z",
  service_id: "uuid",
  notes: "First consultation",
  status: "confirmed"
}`,
    output: `{
  success: true,
  id: "uuid",
  status: "confirmed",
  confirmation_sent: true
}`,
  },
  'global-blocks': {
    input: `{
  slot: "footer",
  type: "footer",
  data: {
    companyName: "Acme Inc",
    links: [...]
  },
  is_active: true
}`,
    output: `{
  success: true,
  id: "uuid",
  slot: "footer",
  type: "footer"
}`,
  },
  media: {
    input: `{
  file_name: "hero-image.jpg",
  file_path: "pages/hero-image.jpg",
  alt_text: "Hero banner",
  folder: "pages"
}`,
    output: `{
  success: true,
  path: "pages/hero-image.jpg",
  public_url: "https://..."
}`,
  },
  deals: {
    input: `{
  lead_id: "uuid",
  value_cents: 500000,
  currency: "USD",
  stage: "proposal",
  product_id: "uuid",
  expected_close: "2025-02-15T00:00:00Z",
  notes: "Enterprise license"
}`,
    output: `{
  success: true,
  id: "uuid",
  stage: "proposal",
  value_cents: 500000
}`,
  },
  companies: {
    input: `{
  name: "Acme Corporation",
  domain: "acme.com",
  website: "https://acme.com",
  industry: "Technology",
  size: "100-500",
  options: {
    auto_enrich: true
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  name: "Acme Corporation",
  domain: "acme.com",
  enriched: true
}`,
  },
};

const EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'extractors.js',
  'content-global.js',
  'popup.html',
  'popup.js',
];

function BrowserControlSetup() {
  const relay = useExtensionRelay();
  const [extensionId, setExtensionId] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('flowwink_extension_id');
    if (saved) setExtensionId(saved);
  }, []);

  const handleConnect = async () => {
    if (!extensionId.trim()) {
      toast.error('Enter a valid Extension ID');
      return;
    }
    setIsChecking(true);
    localStorage.setItem('flowwink_extension_id', extensionId.trim());
    const found = await relay.detectExtension(extensionId.trim());
    setIsChecking(false);
    if (found) {
      toast.success('Extension connected!');
    } else {
      toast.error('Extension not detected. Make sure it\'s installed and the ID is correct.');
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      for (const file of EXTENSION_FILES) {
        const resp = await fetch(`/chrome-extension/${file}`);
        if (!resp.ok) throw new Error(`Failed to fetch ${file}`);
        const text = await resp.text();
        zip.file(file, text);
      }
      for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
        try {
          const resp = await fetch(`/chrome-extension/icons/${icon}`);
          if (resp.ok) {
            const blob = await resp.blob();
            zip.file(`icons/${icon}`, blob);
          }
        } catch { /* optional */ }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signal-capture-extension.zip';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Extension downloaded! Unzip and install in Chrome.');
    } catch (err) {
      toast.error('Failed to create download');
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyId = () => {
    if (relay.extensionStatus.extensionId) {
      navigator.clipboard.writeText(relay.extensionStatus.extensionId);
      toast.success('Extension ID copied');
    }
  };

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="rounded-lg border p-3 bg-muted/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4" />
            Connection
          </div>
          <Badge variant={relay.extensionStatus.installed ? 'default' : 'secondary'} className="text-[10px]">
            {relay.extensionStatus.installed ? (
              <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
            ) : (
              <><XCircle className="h-3 w-3 mr-1" /> Not detected</>
            )}
          </Badge>
        </div>
        {relay.extensionStatus.installed ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Version</span>
              <span className="font-mono text-xs">{relay.extensionStatus.version}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Extension ID</span>
              <button onClick={handleCopyId} className="font-mono text-[10px] flex items-center gap-1 hover:text-primary transition-colors">
                {relay.extensionStatus.extensionId?.slice(0, 16)}…
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Paste Extension ID"
                value={extensionId}
                onChange={e => setExtensionId(e.target.value)}
                className="font-mono text-xs h-8"
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
              />
              <Button onClick={handleConnect} disabled={isChecking} size="sm" className="h-8 px-3">
                {isChecking ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Connect'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Find your Extension ID at <code className="px-1 py-0.5 bg-muted rounded">chrome://extensions</code>
            </p>
          </div>
        )}
      </div>

      {/* Download */}
      <div>
        <Button onClick={handleDownload} disabled={isDownloading} variant="outline" size="sm" className="w-full h-8 text-xs">
          <Chrome className="h-3.5 w-3.5 mr-1.5" />
          {isDownloading ? 'Preparing…' : 'Download Extension (.zip)'}
        </Button>
      </div>

      {/* Install Steps */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium">Installation</h4>
        <ol className="space-y-1.5 text-[11px] text-muted-foreground">
          {[
            'Download & unzip the file',
            'Open chrome://extensions',
            'Enable Developer mode (top-right)',
            'Click Load unpacked → select folder',
            'Copy the Extension ID shown',
            'Paste it above to connect',
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] flex items-center justify-center font-medium">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* How it works */}
      <div className="rounded-lg border p-3 bg-muted/20">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium">
          <Globe className="h-3.5 w-3.5" />
          How it works
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          FlowPilot uses your Chrome Extension to read login-walled sites (LinkedIn, X) through your 
          real browser session — no server-side scraping needed. Press ⌘⇧S on any page to capture content directly.
        </p>
      </div>
    </div>
  );
}

export function ModuleDetailSheet({
  open,
  onOpenChange,
  moduleId,
  moduleName,
  moduleDescription,
  moduleConfig,
  stats,
  isEnabled,
  autonomy,
  adminUI,
}: ModuleDetailSheetProps) {
  // Get module info from registry
  const registryModule = moduleRegistry.list().find(m => m.id === moduleId);
  const apiExample = API_EXAMPLES[moduleId];
  const { data: modules } = useModules();
  const updateModules = useUpdateModules();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <SheetTitle className="text-xl">{moduleName}</SheetTitle>
            {registryModule && (
              <Badge variant="outline" className="font-mono text-xs">
                v{registryModule.version}
              </Badge>
            )}
          </div>
          <SheetDescription>{moduleDescription}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-10rem)] mt-6 pr-4">
          <div className="space-y-6">
            {/* Status */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${isEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">
                {isEnabled ? 'Module Active' : 'Module Disabled'}
              </span>
            </div>

            {/* Browser Control Setup */}
            {moduleId === 'browserControl' && (
              <>
                <Separator />
                <BrowserControlSetup />
              </>
            )}

            {/* FlowPilot Details */}
            {moduleId === 'flowpilot' && (
              <>
                <Separator />
                <FlowPilotDetails />
              </>
            )}

            {/* Composio Details */}
            {moduleId === 'composio' && (
              <>
                <Separator />
                <ComposioPanel />
              </>
            )}

            {/* E-commerce Sandbox Settings */}
            {moduleId === 'ecommerce' && moduleConfig && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Payment Settings</h4>
                  <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">Payment Mode</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {moduleConfig.optionalIntegrations?.includes('stripe')
                            ? 'Stripe is optional — sandbox mode activates automatically when Stripe is inactive.'
                            : 'Configure Stripe in Integrations to enable real payments.'}
                        </p>
                      </div>
                      <Badge variant={isEnabled ? 'default' : 'secondary'} className="text-xs">
                        Sandbox
                      </Badge>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sandbox-days" className="text-sm">
                          Auto-pay delay
                        </Label>
                        <span className="text-sm font-mono text-muted-foreground">
                          {(moduleConfig.sandboxAutoPayDays ?? 0) === 0
                            ? 'Instant'
                            : `${moduleConfig.sandboxAutoPayDays} days`}
                        </span>
                      </div>
                      <Slider
                        id="sandbox-days"
                        min={0}
                        max={30}
                        step={1}
                        value={[moduleConfig.sandboxAutoPayDays ?? 0]}
                        onValueChange={([val]) => {
                          if (!modules) return;
                          const updated = {
                            ...modules,
                            ecommerce: {
                              ...modules.ecommerce,
                              sandboxAutoPayDays: val,
                            },
                          };
                          updateModules.mutate(updated);
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {(moduleConfig.sandboxAutoPayDays ?? 0) === 0
                          ? 'Orders are marked as paid immediately — ideal for quick testing.'
                          : `Orders stay "pending" for ${moduleConfig.sandboxAutoPayDays} days before auto-payment — simulates real payment delays for FlowPilot and OpenClaw testing.`}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}


            <div className="rounded-lg border p-3 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                {autonomy === 'agent-capable' && <Bot className="h-4 w-4 text-primary" />}
                {autonomy === 'config-required' && <Settings2 className="h-4 w-4 text-muted-foreground" />}
                {autonomy === 'view-required' && <Eye className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-medium capitalize">{autonomy.replace('-', ' ')}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {autonomy === 'agent-capable' && 'This module can be fully managed by FlowPilot without an admin interface. The admin UI is optional.'}
                {autonomy === 'config-required' && 'This module requires visual configuration. The admin interface is always available when the module is enabled.'}
                {autonomy === 'view-required' && 'Data flows into this module passively. The admin interface is required to review and manage entries.'}
              </p>
              {autonomy === 'agent-capable' && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                  <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Admin UI: <span className="font-medium text-foreground">{adminUI ? 'Enabled' : 'Disabled (agent-only)'}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Statistics */}
            {stats && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Statistics</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Hash className="h-3.5 w-3.5" />
                        <span className="text-xs">Total Records</span>
                      </div>
                      <p className="text-2xl font-bold">{stats.count}</p>
                    </div>
                    {stats.lastUsed && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="text-xs">Last Updated</span>
                        </div>
                        <p className="text-sm font-medium">
                          {formatDistanceToNow(new Date(stats.lastUsed), { addSuffix: true })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Capabilities */}
            {registryModule && registryModule.capabilities.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Capabilities</h4>
                  <div className="space-y-2">
                    {registryModule.capabilities.map((cap) => {
                      const info = CAPABILITY_INFO[cap];
                      if (!info) return null;
                      const Icon = info.icon;
                      return (
                        <div
                          key={cap}
                          className="flex items-start gap-3 p-2 rounded-lg bg-muted/30"
                        >
                          <Icon className="h-4 w-4 text-primary mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* API Documentation */}
            {apiExample && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Code2 className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">API Contract</h4>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Input Schema</p>
                      <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto font-mono">
                        {apiExample.input}
                      </pre>
                    </div>
                    
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Output Schema</p>
                      <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto font-mono">
                        {apiExample.output}
                      </pre>
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Usage:</span>{' '}
                      <code className="bg-muted px-1 py-0.5 rounded">
                        moduleRegistry.publish('{moduleId}', input)
                      </code>
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Integration Note */}
            {registryModule && (
              <>
                <Separator />
                <div className="rounded-lg border p-4 bg-muted/20">
                  <h4 className="text-sm font-semibold mb-2">Integration</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This module is part of the FlowWink Module Registry. 
                    Content can be published to this module from Content Hub campaigns, 
                    external webhooks, or programmatically via the registry API.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    See <code className="bg-muted px-1 py-0.5 rounded">docs/MODULE-API.md</code> for full documentation.
                  </p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
