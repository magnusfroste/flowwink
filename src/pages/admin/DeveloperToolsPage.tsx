import { useState } from 'react';
import { Code2, Webhook, LayoutTemplate, Database, Terminal, PlayCircle, AlertTriangle, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface WebhookLog {
  id: string;
  event: string;
  timestamp: string;
  payload: Record<string, unknown>;
  status: 'logged' | 'error';
}

export default function DeveloperToolsPage() {
  const [mockWebhooks, setMockWebhooks] = useState(true);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('page.published');
  const [testPayload, setTestPayload] = useState('{\n  "id": "test-123",\n  "title": "Test Page"\n}');

  const availableEvents = [
    'page.published',
    'page.updated',
    'page.deleted',
    'blog_post.published',
    'blog_post.updated',
    'form.submitted',
    'booking.submitted',
    'newsletter.subscribed',
  ];

  const triggerTestWebhook = () => {
    const newLog: WebhookLog = {
      id: crypto.randomUUID(),
      event: selectedEvent,
      timestamp: new Date().toISOString(),
      payload: JSON.parse(testPayload),
      status: 'logged',
    };

    setWebhookLogs(prev => [newLog, ...prev]);
    toast.success('Webhook logged (mock mode)');
  };

  const copyPayload = (payload: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success('Payload copied to clipboard');
  };

  const clearLogs = () => {
    setWebhookLogs([]);
    toast.success('Logs cleared');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Developer Tools"
          description="Hidden tools for testing and debugging. Access via URL or #developer-tools"
        />

        <div className="flex items-center gap-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
              Developer Mode Active
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              These tools are for development only. Changes here do not affect production.
            </p>
          </div>
        </div>

        <Tabs defaultValue="webhook-logger" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="webhook-logger" className="gap-2">
              <Webhook className="h-4 w-4" />
              Webhook Logger
            </TabsTrigger>
            <TabsTrigger value="block-previewer" className="gap-2">
              <LayoutTemplate className="h-4 w-4" />
              Block Previewer
            </TabsTrigger>
            <TabsTrigger value="mock-data" className="gap-2">
              <Database className="h-4 w-4" />
              Mock Data
            </TabsTrigger>
          </TabsList>

          {/* Webhook Logger */}
          <TabsContent value="webhook-logger" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  Webhook Logger
                </CardTitle>
                <CardDescription>
                  Test webhooks without sending to external endpoints
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <Terminal className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Mock Webhook Mode</p>
                      <p className="text-xs text-muted-foreground">
                        Log webhooks instead of sending to external URLs
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={mockWebhooks}
                    onCheckedChange={setMockWebhooks}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Test Webhook Event</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedEvent}
                      onChange={(e) => setSelectedEvent(e.target.value)}
                      className="flex-1 h-10 px-3 rounded-md border bg-background"
                    >
                      {availableEvents.map(event => (
                        <option key={event} value={event}>{event}</option>
                      ))}
                    </select>
                    <Button onClick={triggerTestWebhook}>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Trigger
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Test Payload</label>
                  <Textarea
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    rows={6}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <Badge variant={mockWebhooks ? 'default' : 'secondary'}>
                    {mockWebhooks ? 'Mock Mode Active' : 'Live Mode'}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={clearLogs}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Clear Logs
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Webhook Logs</label>
                  <ScrollArea className="h-64 rounded-md border p-3">
                    {webhookLogs.length === 0 ? (
                      <div className="text-center text-muted-foreground text-sm py-8">
                        No logs yet. Trigger a webhook to see logs here.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {webhookLogs.map(log => (
                          <div
                            key={log.id}
                            className="p-2 bg-muted/50 rounded border text-xs"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-medium">{log.event}</span>
                              <span className="text-muted-foreground">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <pre className="text-[10px] overflow-x-auto">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs mt-1"
                              onClick={() => copyPayload(log.payload)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Block Previewer */}
          <TabsContent value="block-previewer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutTemplate className="h-5 w-5" />
                  Block Previewer
                </CardTitle>
                <CardDescription>
                  Preview custom blocks without creating pages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-8 border-2 border-dashed rounded-lg bg-muted/30 text-center">
                  <Code2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Block Previewer</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select a block type to preview it in isolation
                  </p>
                  <Badge variant="secondary">Coming Soon</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mock Data Generator */}
          <TabsContent value="mock-data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Mock Data Generator
                </CardTitle>
                <CardDescription>
                  Generate test data for development
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-8 border-2 border-dashed rounded-lg bg-muted/30 text-center">
                  <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Mock Data Generator</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate test pages, blocks, and webhooks
                  </p>
                  <Badge variant="secondary">Coming Soon</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
