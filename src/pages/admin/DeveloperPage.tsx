import { Code2, Webhook, Terminal } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentApiContent } from '@/pages/admin/ContentApiPage';
import { WebhooksContent } from '@/pages/admin/WebhooksPage';
import { DevToolsContent } from '@/pages/admin/DeveloperToolsPage';

export default function DeveloperPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Developer"
          description="API explorer, webhooks, and developer tools for integrating FlowWink with external systems"
        />

        <Tabs defaultValue="api" className="space-y-4">
          <TabsList>
            <TabsTrigger value="api" className="gap-2">
              <Code2 className="h-4 w-4" />
              API Explorer
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2">
              <Webhook className="h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="devtools" className="gap-2">
              <Terminal className="h-4 w-4" />
              Dev Tools
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api">
            <ContentApiContent />
          </TabsContent>

          <TabsContent value="webhooks">
            <WebhooksContent />
          </TabsContent>

          <TabsContent value="devtools">
            <DevToolsContent />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
