import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Webhook, 
  Trash2, 
  Edit, 
  History, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Copy,
  Eye,
  EyeOff,
  Play,
  Loader2,
  ChevronDown,
  Code,
  Zap,
  AlertTriangle,
  RotateCcw,
  TrendingUp
} from 'lucide-react';
import { N8NTemplates } from '@/components/admin/N8NTemplates';
import { 
  useWebhooks, 
  useWebhookLogs, 
  CreateWebhookInput, 
  WebhookEvent,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENT_CATEGORIES
} from '@/hooks/useWebhooks';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { WebhookStats } from '@/components/admin/WebhookStats';

export default function WebhooksPage() {
  const { webhooks, isLoading, createWebhook, updateWebhook, deleteWebhook, toggleWebhook, testWebhook, resendWebhook } = useWebhooks();
  const { toast } = useToast();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null);
  const [viewingLogsFor, setViewingLogsFor] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<CreateWebhookInput>({
    name: '',
    url: '',
    events: [],
    secret: '',
  });

  const { data: logs, isLoading: logsLoading } = useWebhookLogs(viewingLogsFor);

  const resetForm = () => {
    setFormData({ name: '', url: '', events: [], secret: '' });
    setEditingWebhook(null);
    setShowSecret(false);
  };

  const openEditDialog = (webhook: typeof webhooks[0]) => {
    setFormData({
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      secret: webhook.secret || '',
    });
    setEditingWebhook(webhook.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.events.length === 0) {
      toast({ 
        title: 'Select at least one event', 
        variant: 'destructive' 
      });
      return;
    }

    if (editingWebhook) {
      await updateWebhook.mutateAsync({ id: editingWebhook, ...formData });
    } else {
      await createWebhook.mutateAsync(formData);
    }
    
    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this webhook?')) {
      await deleteWebhook.mutateAsync(id);
    }
  };

  const toggleEvent = (event: WebhookEvent) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event]
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Webhooks"
          description="Automate with webhooks that trigger on various events"
        >
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            New Webhook
          </Button>
        </AdminPageHeader>

        <Tabs defaultValue="webhooks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="stats">
            <TrendingUp className="h-4 w-4 mr-1" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Zap className="h-4 w-4 mr-1" />
            N8N Templates
          </TabsTrigger>
          <TabsTrigger value="logs" disabled={!viewingLogsFor}>
            Logs {viewingLogsFor && '(selected)'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading webhooks...
              </CardContent>
            </Card>
          ) : webhooks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Webhook className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No webhooks yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first webhook to automate events
                </p>
                <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Webhook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {webhooks.map(webhook => {
                const isAutoDisabled = !webhook.is_active && webhook.failure_count >= 5;
                
                return (
                <Card key={webhook.id} className={!webhook.is_active ? 'opacity-60' : ''}>
                  {isAutoDisabled && (
                    <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <span>
                        <strong>Auto-disabled</strong> after {webhook.failure_count} failed deliveries. 
                        Re-enable when the issue is fixed.
                      </span>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Webhook className="h-5 w-5 text-primary" />
                        <div>
                          <CardTitle className="text-base">{webhook.name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <code className="text-xs bg-muted px-2 py-0.5 rounded">
                              {webhook.url.length > 50 ? webhook.url.substring(0, 50) + '...' : webhook.url}
                            </code>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5"
                              onClick={() => copyToClipboard(webhook.url)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={webhook.is_active}
                          onCheckedChange={(checked) => 
                            toggleWebhook.mutate({ id: webhook.id, is_active: checked })
                          }
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {webhook.events.map(event => (
                        <Badge key={event} variant="secondary" className="text-xs">
                          {WEBHOOK_EVENT_LABELS[event]}
                        </Badge>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-4">
                        {webhook.last_triggered_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last: {format(new Date(webhook.last_triggered_at), 'dd MMM HH:mm')}
                          </span>
                        )}
                        {webhook.failure_count > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {webhook.failure_count} errors
                          </Badge>
                        )}
                        {webhook.secret && (
                          <Badge variant="outline" className="text-xs">
                            Signerad
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => testWebhook.mutate(webhook)}
                          disabled={testWebhook.isPending || !webhook.is_active}
                        >
                          {testWebhook.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          Test
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setViewingLogsFor(webhook.id)}
                        >
                          <History className="h-4 w-4 mr-1" />
                          Logs
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditDialog(webhook)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(webhook.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats">
          <WebhookStats />
        </TabsContent>

        <TabsContent value="templates">
          <N8NTemplates />
        </TabsContent>

        <TabsContent value="logs">
          {viewingLogsFor && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Delivery Logs</CardTitle>
                    <CardDescription>
                      Last 50 deliveries for this webhook
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => setViewingLogsFor(null)}>
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <p className="text-muted-foreground">Loading logs...</p>
                ) : !logs || logs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No deliveries logged yet
                  </p>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {logs.map(log => (
                        <Collapsible key={log.id}>
                          <div className="border rounded-lg text-sm">
                            <CollapsibleTrigger className="w-full">
                              <div className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                                {log.success ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0 text-left">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {WEBHOOK_EVENT_LABELS[log.event]}
                                    </Badge>
                                    {log.response_status && (
                                      <span className={log.success ? 'text-green-600' : 'text-red-600'}>
                                        HTTP {log.response_status}
                                      </span>
                                    )}
                                    {log.duration_ms && (
                                      <span className="text-muted-foreground">
                                        {log.duration_ms}ms
                                      </span>
                                    )}
                                  </div>
                                  {log.error_message && (
                                    <p className="text-red-500 text-xs mt-1 truncate">
                                      {log.error_message}
                                    </p>
                                  )}
                                </div>
                                <span className="text-muted-foreground text-xs flex-shrink-0">
                                  {format(new Date(log.created_at), 'dd MMM HH:mm:ss')}
                                </span>
                                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="px-3 pb-3 pt-1 border-t bg-muted/30">
                                <div className="flex items-center gap-2 mb-2">
                                  <Code className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs font-medium text-muted-foreground">Payload</span>
                                </div>
                                <pre className="text-xs bg-background p-3 rounded border overflow-x-auto max-h-48">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                                {log.response_body && (
                                  <>
                                    <div className="flex items-center gap-2 mt-3 mb-2">
                                      <Code className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-xs font-medium text-muted-foreground">Response</span>
                                    </div>
                                    <pre className="text-xs bg-background p-3 rounded border overflow-x-auto max-h-32">
                                      {log.response_body}
                                    </pre>
                                  </>
                                )}
                                
                                {!log.success && (
                                  <div className="mt-3 pt-3 border-t">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        resendWebhook.mutate({ 
                                          webhookId: log.webhook_id, 
                                          payload: log.payload as Record<string, unknown>
                                        });
                                      }}
                                      disabled={resendWebhook.isPending}
                                    >
                                      {resendWebhook.isPending ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                      )}
                                      Resend
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? 'Edit Webhook' : 'New Webhook'}
            </DialogTitle>
            <DialogDescription>
              Configure webhook endpoint and the events it should listen to
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My webhook"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://example.com/webhook"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="secret">
                Secret (optional)
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 px-2"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </Label>
              <Input
                id="secret"
                type={showSecret ? 'text' : 'password'}
                value={formData.secret}
                onChange={(e) => setFormData(prev => ({ ...prev, secret: e.target.value }))}
                placeholder="Used for HMAC signing"
              />
              <p className="text-xs text-muted-foreground">
                If provided, each request is signed with X-Webhook-Signature header
              </p>
            </div>
            
            <div className="space-y-3">
              <Label>Events</Label>
              <ScrollArea className="h-[200px] border rounded-lg p-3">
                {Object.entries(WEBHOOK_EVENT_CATEGORIES).map(([category, events]) => (
                  <div key={category} className="mb-4 last:mb-0">
                    <h4 className="text-sm font-medium mb-2">{category}</h4>
                    <div className="space-y-2">
                      {events.map(event => (
                        <div key={event} className="flex items-center gap-2">
                          <Checkbox
                            id={event}
                            checked={formData.events.includes(event)}
                            onCheckedChange={() => toggleEvent(event)}
                          />
                          <label 
                            htmlFor={event}
                            className="text-sm cursor-pointer"
                          >
                            {WEBHOOK_EVENT_LABELS[event]}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createWebhook.isPending || updateWebhook.isPending}
              >
                {editingWebhook ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}
