import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useChatSettings, useUpdateChatSettings, ChatSettings, ChatAiProvider } from '@/hooks/useSiteSettings';
import { usePages } from '@/hooks/usePages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, AlertTriangle, Cloud, Server, Webhook, Shield, Database, BookOpen, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useUnsavedChanges, UnsavedChangesDialog } from '@/hooks/useUnsavedChanges';

export default function ChatSettingsPage() {
  const { data: settings, isLoading } = useChatSettings();
  const updateSettings = useUpdateChatSettings();
  const [formData, setFormData] = useState<ChatSettings | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Track unsaved changes
  const hasChanges = useMemo(() => {
    if (!settings || !formData) return false;
    return JSON.stringify(formData) !== JSON.stringify(settings);
  }, [formData, settings]);

  const { blocker } = useUnsavedChanges({ hasChanges });

  const handleSave = () => {
    if (formData) {
      updateSettings.mutate(formData);
    }
  };

  if (isLoading || !formData) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader 
          title="Chat Settings"
          description="Configure the AI chat for your website"
        >
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="relative">
            {hasChanges && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive" />}
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save changes
          </Button>
        </AdminPageHeader>
        <div className="max-w-4xl space-y-6">
        {/* Master toggle */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Chat System</CardTitle>
                <CardDescription>
                  Enable AI-powered chat for your website
                </CardDescription>
              </div>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
              />
            </div>
          </CardHeader>
        </Card>

        {formData.enabled && (
          <Tabs defaultValue="general" className="space-y-6">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="provider">AI Provider</TabsTrigger>
              <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
              <TabsTrigger value="display">Display</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
            </TabsList>

            {/* General settings */}
            <TabsContent value="general">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Chat Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="AI Assistant"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="welcomeMessage">Welcome Message</Label>
                    <Textarea
                      id="welcomeMessage"
                      value={formData.welcomeMessage}
                      onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                      placeholder="Hello! How can I help you today?"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="placeholder">Placeholder Text</Label>
                    <Input
                      id="placeholder"
                      value={formData.placeholder}
                      onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                      placeholder="Type your message..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="systemPrompt">System Prompt</Label>
                    <Textarea
                      id="systemPrompt"
                      value={formData.systemPrompt}
                      onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                      placeholder="You are a helpful AI assistant..."
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      Instructions for the AI on how to behave and respond.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label>Suggested Prompts</Label>
                      <p className="text-xs text-muted-foreground">
                        Quick questions shown to users before they start chatting (max 5)
                      </p>
                    </div>
                    {(formData.suggestedPrompts || []).map((prompt, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={prompt}
                          onChange={(e) => {
                            const newPrompts = [...(formData.suggestedPrompts || [])];
                            newPrompts[index] = e.target.value;
                            setFormData({ ...formData, suggestedPrompts: newPrompts });
                          }}
                          placeholder={`Suggested question ${index + 1}...`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newPrompts = (formData.suggestedPrompts || []).filter((_, i) => i !== index);
                            setFormData({ ...formData, suggestedPrompts: newPrompts });
                          }}
                        >
                          <span className="sr-only">Remove</span>
                          ×
                        </Button>
                      </div>
                    ))}
                    {(formData.suggestedPrompts || []).length < 5 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newPrompts = [...(formData.suggestedPrompts || []), ''];
                          setFormData({ ...formData, suggestedPrompts: newPrompts });
                        }}
                      >
                        + Add prompt
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Provider settings */}
            <TabsContent value="provider">
              <Card>
                <CardHeader>
                  <CardTitle>AI Provider</CardTitle>
                  <CardDescription>
                    Choose how AI responses should be generated
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4">
                    {/* Provider selection */}
                    <div className="grid grid-cols-3 gap-4">
                      <ProviderCard
                        provider="lovable"
                        title="Gemini 2.5 Flash AI"
                        description="Cloud-based AI"
                        icon={<Cloud className="h-5 w-5" />}
                        badge="Recommended"
                        selected={formData.aiProvider === 'lovable'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'lovable' })}
                      />
                      <ProviderCard
                        provider="local"
                        title="Local AI"
                        description="HIPAA-compliant"
                        icon={<Server className="h-5 w-5" />}
                        badge="Private"
                        badgeVariant="secondary"
                        selected={formData.aiProvider === 'local'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'local' })}
                      />
                      <ProviderCard
                        provider="n8n"
                        title="N8N Webhook"
                        description="Agentic workflows"
                        icon={<Webhook className="h-5 w-5" />}
                        selected={formData.aiProvider === 'n8n'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'n8n' })}
                      />
                    </div>

                    {/* Lovable AI settings */}
                    {formData.aiProvider === 'lovable' && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert>
                          <Cloud className="h-4 w-4" />
                          <AlertTitle>Cloud-based Solution</AlertTitle>
                          <AlertDescription>
                            Data is sent to external AI services. Not suitable for HIPAA or sensitive patient data.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                          <Label>AI Model</Label>
                          <Select
                            value={formData.lovableModel}
                            onValueChange={(value) => setFormData({ 
                              ...formData, 
                              lovableModel: value as ChatSettings['lovableModel']
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash (Fast)</SelectItem>
                              <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro (Powerful)</SelectItem>
                              <SelectItem value="openai/gpt-5-mini">GPT-5 Mini (Balanced)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Local AI settings */}
                    {formData.aiProvider === 'local' && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900">
                          <Shield className="h-4 w-4 text-green-600" />
                          <AlertTitle className="text-green-800 dark:text-green-200">HIPAA-compliant</AlertTitle>
                          <AlertDescription className="text-green-700 dark:text-green-300">
                            All data is processed locally. No data leaves your servers.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                          <Label htmlFor="localEndpoint">Endpoint URL</Label>
                          <Input
                            id="localEndpoint"
                            value={formData.localEndpoint}
                            onChange={(e) => setFormData({ ...formData, localEndpoint: e.target.value })}
                            placeholder="http://localhost:11434"
                          />
                          <p className="text-xs text-muted-foreground">
                            OpenAI-compatible API (e.g., Ollama, vLLM, LocalAI)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="localModel">Model Name</Label>
                          <Input
                            id="localModel"
                            value={formData.localModel}
                            onChange={(e) => setFormData({ ...formData, localModel: e.target.value })}
                            placeholder="llama3"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="localApiKey">API Key (optional)</Label>
                          <Input
                            id="localApiKey"
                            type="password"
                            value={formData.localApiKey}
                            onChange={(e) => setFormData({ ...formData, localApiKey: e.target.value })}
                            placeholder="If your local server requires authentication"
                          />
                        </div>
                      </div>
                    )}

                    {/* N8N settings */}
                    {formData.aiProvider === 'n8n' && (
                      <div className="space-y-4 pt-4 border-t">
                        <Alert>
                          <Webhook className="h-4 w-4" />
                          <AlertTitle>Agentic Workflows</AlertTitle>
                          <AlertDescription>
                            Connect the chat to N8N to perform actions such as bookings, data retrieval, etc.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                          <Label htmlFor="n8nWebhookUrl">Webhook URL</Label>
                          <Input
                            id="n8nWebhookUrl"
                            value={formData.n8nWebhookUrl}
                            onChange={(e) => setFormData({ ...formData, n8nWebhookUrl: e.target.value })}
                            placeholder="https://n8n.example.com/webhook/..."
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Webhook Type</Label>
                          <Select
                            value={formData.n8nWebhookType || 'chat'}
                            onValueChange={(value) => setFormData({ 
                              ...formData, 
                              n8nWebhookType: value as 'chat' | 'generic'
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chat">
                                Chat Webhook (with session memory)
                              </SelectItem>
                              <SelectItem value="generic">
                                Generic Webhook (OpenAI-compatible)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {formData.n8nWebhookType === 'generic' 
                              ? 'Sends full conversation history. Use for Ollama, LM Studio or custom AI logic.'
                              : 'N8N Chat node handles session memory. Perfect for AI Agent with Memory.'}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Trigger Mode</Label>
                          <Select
                            value={formData.n8nTriggerMode}
                            onValueChange={(value) => setFormData({ 
                              ...formData, 
                              n8nTriggerMode: value as ChatSettings['n8nTriggerMode']
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="always">All messages</SelectItem>
                              <SelectItem value="keywords">Only on keywords</SelectItem>
                              <SelectItem value="fallback">As fallback</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {formData.n8nTriggerMode === 'keywords' && (
                          <div className="space-y-2">
                            <Label htmlFor="n8nKeywords">Trigger Keywords</Label>
                            <Input
                              id="n8nKeywords"
                              value={formData.n8nTriggerKeywords.join(', ')}
                              onChange={(e) => setFormData({ 
                                ...formData, 
                                n8nTriggerKeywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                              })}
                              placeholder="book, price, contact"
                            />
                            <p className="text-xs text-muted-foreground">
                              Comma-separated keywords that trigger the N8N webhook
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Knowledge Base settings */}
            <TabsContent value="knowledge">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Knowledge Base (CAG)
                  </CardTitle>
                  <CardDescription>
                    Include website content as context for the AI
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Include CMS Content</h4>
                      <p className="text-sm text-muted-foreground">
                        AI gets access to all published content on the website
                      </p>
                    </div>
                    <Switch
                      checked={formData.includeContentAsContext ?? false}
                      onCheckedChange={(includeContentAsContext) => 
                        setFormData({ ...formData, includeContentAsContext })
                      }
                    />
                  </div>

                  {formData.includeContentAsContext && (
                    <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900">
                      <Database className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-800 dark:text-blue-200">Context Augmented Generation</AlertTitle>
                      <AlertDescription className="text-blue-700 dark:text-blue-300">
                        Selected pages are sent as context to the AI with each message. 
                        Choose which pages to include below.
                      </AlertDescription>
                    </Alert>
                  )}

                  {formData.includeContentAsContext && (
                    <PageSelector 
                      selectedSlugs={formData.includedPageSlugs || []}
                      onSelectionChange={(slugs) => setFormData({ ...formData, includedPageSlugs: slugs })}
                    />
                  )}

                  {formData.includeContentAsContext && (
                    <div className="space-y-2">
                      <Label htmlFor="maxTokens">Max Number of Tokens</Label>
                      <Select
                        value={String(formData.contentContextMaxTokens ?? 50000)}
                        onValueChange={(value) => setFormData({ 
                          ...formData, 
                          contentContextMaxTokens: parseInt(value)
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25000">25,000 (Small website)</SelectItem>
                          <SelectItem value="50000">50,000 (Medium)</SelectItem>
                          <SelectItem value="100000">100,000 (Large website)</SelectItem>
                          <SelectItem value="200000">200,000 (Very large)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Gemini 2.5 Flash supports up to 1 million tokens. A typical page is about 500-1000 tokens.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Display settings */}
            <TabsContent value="display">
              <Card>
                <CardHeader>
                  <CardTitle>Display Options</CardTitle>
                  <CardDescription>
                    Choose where and how the chat should be displayed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Landing page */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Landing Page</h4>
                      <p className="text-sm text-muted-foreground">
                        Fullscreen chat page at /chat
                      </p>
                    </div>
                    <Switch
                      checked={formData.landingPageEnabled}
                      onCheckedChange={(landingPageEnabled) => 
                        setFormData({ ...formData, landingPageEnabled })
                      }
                    />
                  </div>

                  {/* Block */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">CMS Block</h4>
                      <p className="text-sm text-muted-foreground">
                        Ability to add chat to any page
                      </p>
                    </div>
                    <Switch
                      checked={formData.blockEnabled}
                      onCheckedChange={(blockEnabled) => 
                        setFormData({ ...formData, blockEnabled })
                      }
                    />
                  </div>

                  {/* Widget */}
                  <div className="space-y-4 p-4 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Floating Widget</h4>
                        <p className="text-sm text-muted-foreground">
                          Chat button in the corner of all pages
                        </p>
                      </div>
                      <Switch
                        checked={formData.widgetEnabled}
                        onCheckedChange={(widgetEnabled) => 
                          setFormData({ ...formData, widgetEnabled })
                        }
                      />
                    </div>

                    {formData.widgetEnabled && (
                      <div className="space-y-4 pt-4 border-t">
                        <div className="space-y-2">
                          <Label>Position</Label>
                          <Select
                            value={formData.widgetPosition}
                            onValueChange={(value) => setFormData({ 
                              ...formData, 
                              widgetPosition: value as ChatSettings['widgetPosition']
                            })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bottom-right">Bottom right</SelectItem>
                              <SelectItem value="bottom-left">Bottom left</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="widgetButtonText">Button Text</Label>
                          <Input
                            id="widgetButtonText"
                            value={formData.widgetButtonText}
                            onChange={(e) => setFormData({ ...formData, widgetButtonText: e.target.value })}
                            placeholder="Chat with us"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Privacy settings */}
            <TabsContent value="privacy">
              <Card>
                <CardHeader>
                  <CardTitle>Privacy & Compliance</CardTitle>
                  <CardDescription>
                    Settings for data handling and GDPR
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Save Conversations</h4>
                      <p className="text-sm text-muted-foreground">
                        Store chat history in the database
                      </p>
                    </div>
                    <Switch
                      checked={formData.saveConversations}
                      onCheckedChange={(saveConversations) => 
                        setFormData({ ...formData, saveConversations })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Anonymize Data</h4>
                      <p className="text-sm text-muted-foreground">
                        Remove personal identification numbers and sensitive info
                      </p>
                    </div>
                    <Switch
                      checked={formData.anonymizeData}
                      onCheckedChange={(anonymizeData) => 
                        setFormData({ ...formData, anonymizeData })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Audit Logging</h4>
                      <p className="text-sm text-muted-foreground">
                        Log all chat activities
                      </p>
                    </div>
                    <Switch
                      checked={formData.auditLogging}
                      onCheckedChange={(auditLogging) => 
                        setFormData({ ...formData, auditLogging })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataRetention">Data Retention (days)</Label>
                    <Input
                      id="dataRetention"
                      type="number"
                      min={1}
                      max={365}
                      value={formData.dataRetentionDays}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        dataRetentionDays: parseInt(e.target.value) || 90
                      })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Conversations are automatically deleted after this period
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

        <UnsavedChangesDialog blocker={blocker} />
      </div>
    </AdminLayout>
  );
}

// Provider selection card component
function ProviderCard({
  provider,
  title,
  description,
  icon,
  badge,
  badgeVariant = 'default',
  selected,
  onClick,
}: {
  provider: ChatAiProvider;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: 'default' | 'secondary';
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50 ${
        selected ? 'border-primary bg-primary/5' : 'border-muted'
      }`}
    >
      {badge && (
        <Badge variant={badgeVariant} className="absolute top-2 right-2 text-xs">
          {badge}
        </Badge>
      )}
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          {icon}
        </div>
      </div>
      <h4 className="font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

// Page selector for knowledge base
function PageSelector({
  selectedSlugs,
  onSelectionChange,
}: {
  selectedSlugs: string[];
  onSelectionChange: (slugs: string[]) => void;
}) {
  const { data: pages, isLoading } = usePages('published');
  
  const allSelected = useMemo(() => {
    if (!pages || pages.length === 0) return false;
    return pages.every(p => selectedSlugs.includes(p.slug));
  }, [pages, selectedSlugs]);

  const togglePage = (slug: string) => {
    if (selectedSlugs.includes(slug)) {
      onSelectionChange(selectedSlugs.filter(s => s !== slug));
    } else {
      onSelectionChange([...selectedSlugs, slug]);
    }
  };

  const toggleAll = () => {
    if (!pages) return;
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(pages.map(p => p.slug));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 border rounded-lg">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <div className="p-4 border rounded-lg text-center text-muted-foreground">
        No published pages found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Pages to include in knowledge base</Label>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={toggleAll}
          className="text-xs"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
      </div>
      
      <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
        {pages.map(page => (
          <label 
            key={page.slug} 
            className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <Checkbox
              checked={selectedSlugs.includes(page.slug)}
              onCheckedChange={() => togglePage(page.slug)}
            />
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium truncate block">{page.title}</span>
              <span className="text-xs text-muted-foreground">/{page.slug}</span>
            </div>
          </label>
        ))}
      </div>
      
      <p className="text-xs text-muted-foreground">
        {selectedSlugs.length} of {pages.length} pages selected
      </p>
    </div>
  );
}
