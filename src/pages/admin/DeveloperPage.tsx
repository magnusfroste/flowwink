import { Code2, Webhook, Terminal } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentApiContent } from '@/pages/admin/ContentApiPage';
import { WebhooksContent } from '@/pages/admin/WebhooksPage';
import { DevToolsContent } from '@/pages/admin/DeveloperToolsPage';

export default function DeveloperPage() {
  return (
    <AdminLayout>
      <AdminPageContainer>
        <Tabs defaultValue="api">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Developer</h1>
            <TabsList>
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
