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
import { 
  Code2, 
  ArrowRightLeft, 
  Webhook, 
  Database, 
  FileText,
  CheckCircle2,
  Clock,
  Hash,
} from "lucide-react";
import { moduleRegistry } from "@/lib/module-registry";
import type { ModuleCapability } from "@/types/module-contracts";
import type { ModuleStats } from "@/hooks/useModuleStats";
import { formatDistanceToNow } from "date-fns";

interface ModuleDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  moduleName: string;
  moduleDescription: string;
  stats?: ModuleStats;
  isEnabled: boolean;
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
  content: "<p>Content here...</p>",
  excerpt: "A brief summary",
  options: {
    status: "published"
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  slug: "my-blog-post",
  url: "/blog/my-blog-post"
}`,
  },
  newsletter: {
    input: `{
  subject: "Weekly Update",
  content_html: "<p>Newsletter...</p>",
  options: {
    status: "draft"
  }
}`,
    output: `{
  success: true,
  id: "uuid",
  status: "draft"
}`,
  },
  crm: {
    input: `{
  email: "lead@example.com",
  name: "John Doe",
  source: "website",
  initial_score: 10
}`,
    output: `{
  success: true,
  lead_id: "uuid",
  is_new: true,
  score: 10
}`,
  },
};

export function ModuleDetailSheet({
  open,
  onOpenChange,
  moduleId,
  moduleName,
  moduleDescription,
  stats,
  isEnabled,
}: ModuleDetailSheetProps) {
  // Get module info from registry
  const registryModule = moduleRegistry.list().find(m => m.id === moduleId);
  const apiExample = API_EXAMPLES[moduleId];

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
