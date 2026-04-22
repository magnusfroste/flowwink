import { Code2, Webhook, Terminal, KeyRound, Cpu, Activity } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { ContentApiContent } from '@/pages/admin/ContentApiPage';
import { WebhooksContent } from '@/pages/admin/WebhooksPage';
import { DevToolsContent } from '@/pages/admin/DeveloperToolsPage';
import { ApiKeysContent } from '@/pages/admin/ApiKeysPage';
import { McpSkillsPanel } from '@/components/admin/developer/McpSkillsPanel';
import { McpActivityPanel } from '@/components/admin/developer/McpActivityPanel';

export default function DeveloperPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'mcp-skills';

  return (
    <AdminLayout>
      <AdminPageContainer>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Developer</h1>
              <p className="text-sm text-muted-foreground mt-1">
                MCP, APIs, webhooks and integration tools — the platform's machine-readable surface.
              </p>
            </div>
            <TabsList>
              <TabsTrigger value="mcp-skills" className="gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                MCP Skills
              </TabsTrigger>
              <TabsTrigger value="mcp-activity" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                MCP Activity
              </TabsTrigger>
              <TabsTrigger value="mcp-keys" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                MCP Keys
              </TabsTrigger>
              <TabsTrigger value="api" className="gap-1.5">
                <Code2 className="h-3.5 w-3.5" />
                API Explorer
              </TabsTrigger>
              <TabsTrigger value="webhooks" className="gap-1.5">
                <Webhook className="h-3.5 w-3.5" />
                Webhooks
              </TabsTrigger>
              <TabsTrigger value="devtools" className="gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                Dev Tools
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="mcp-skills" className="mt-0">
            <McpSkillsPanel />
          </TabsContent>

          <TabsContent value="mcp-activity" className="mt-0">
            <McpActivityPanel />
          </TabsContent>

          <TabsContent value="mcp-keys" className="mt-0">
            <ApiKeysContent />
          </TabsContent>

          <TabsContent value="api" className="mt-0">
            <ContentApiContent />
          </TabsContent>

          <TabsContent value="webhooks" className="mt-0">
            <WebhooksContent />
          </TabsContent>

          <TabsContent value="devtools" className="mt-0">
            <DevToolsContent />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
