import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useChatSettings, useUpdateChatSettings, ChatSettings, ChatAiProvider } from '@/hooks/useSiteSettings';
import { usePages } from '@/hooks/usePages';
import { useKbArticles, useKbStats } from '@/hooks/useKnowledgeBase';
import { useChatFeedbackStats, useChatFeedbackList, useKbArticlesNeedingImprovement, exportFeedbackForFineTuning } from '@/hooks/useChatFeedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, Cloud, Server, Webhook, Shield, Database, BookOpen, FileText, HelpCircle, ExternalLink, ThumbsUp, ThumbsDown, Download, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useUnsavedChanges, UnsavedChangesDialog } from '@/hooks/useUnsavedChanges';
import { Link } from 'react-router-dom';
import { useIsOpenAIConfigured, useIsGeminiConfigured } from '@/hooks/useIntegrationStatus';
import { useIntegrations } from '@/hooks/useIntegrations';
import { IntegrationWarning } from '@/components/admin/IntegrationWarning';
import { toast } from 'sonner';

export default function ChatSettingsPage() {
  const { data: settings, isLoading } = useChatSettings();
  const updateSettings = useUpdateChatSettings();
  const [formData, setFormData] = useState<ChatSettings | null>(null);
  const isOpenAIConfigured = useIsOpenAIConfigured();
  const isGeminiConfigured = useIsGeminiConfigured();
  const { data: integrationSettings } = useIntegrations();

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

        {formData.aiProvider === 'openai' && isOpenAIConfigured === false && (
          <IntegrationWarning integration="openai" />
        )}
        {formData.aiProvider === 'gemini' && isGeminiConfigured === false && (
          <IntegrationWarning integration="gemini" />
        )}

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
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="provider">AI Provider</TabsTrigger>
              <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
              <TabsTrigger value="display">Display</TabsTrigger>
              <TabsTrigger value="feedback">Feedback</TabsTrigger>
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
                    Choose which AI provider powers your chat. Configure API keys and settings in{' '}
                    <Link to="/admin/integrations" className="text-primary hover:underline">
                      Integrations
                    </Link>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4">
                    {/* Provider selection */}
                    <div className="grid grid-cols-2 gap-4">
                      <ProviderCard
                        provider="openai"
                        title="OpenAI"
                        description="GPT-4o, GPT-4o-mini"
                        icon={<Cloud className="h-5 w-5" />}
                        badge={isOpenAIConfigured ? undefined : "Setup required"}
                        badgeVariant="secondary"
                        selected={formData.aiProvider === 'openai'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'openai' })}
                      />
                      <ProviderCard
                        provider="gemini"
                        title="Google Gemini"
                        description="Gemini 2.0, 1.5 Pro"
                        icon={<Cloud className="h-5 w-5" />}
                        badge={isGeminiConfigured ? undefined : "Setup required"}
                        badgeVariant="secondary"
                        selected={formData.aiProvider === 'gemini'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'gemini' })}
                      />
                      <ProviderCard
                        provider="local"
                        title="Local LLM"
                        description="HIPAA-compliant"
                        icon={<Server className="h-5 w-5" />}
                        badge={integrationSettings?.local_llm?.enabled ? undefined : "Setup required"}
                        badgeVariant="secondary"
                        selected={formData.aiProvider === 'local'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'local' })}
                      />
                      <ProviderCard
                        provider="n8n"
                        title="N8N Webhook"
                        description="Agentic workflows"
                        icon={<Webhook className="h-5 w-5" />}
                        badge={integrationSettings?.n8n?.enabled ? undefined : "Setup required"}
                        badgeVariant="secondary"
                        selected={formData.aiProvider === 'n8n'}
                        onClick={() => setFormData({ ...formData, aiProvider: 'n8n' })}
                      />
                    </div>

                    {/* Configuration status */}
                    <div className="pt-4 border-t space-y-4">
                      {formData.aiProvider === 'openai' && (
                        isOpenAIConfigured ? (
                          <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800 dark:text-green-200">OpenAI Ready</AlertTitle>
                            <AlertDescription className="text-green-700 dark:text-green-300">
                              Model: {integrationSettings?.openai?.config?.model || 'gpt-4o-mini'}.{' '}
                              <Link to="/admin/integrations#ai" className="underline">
                                Change settings
                              </Link>
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Alert>
                            <XCircle className="h-4 w-4" />
                            <AlertTitle>OpenAI Not Configured</AlertTitle>
                            <AlertDescription>
                              Add your API key in{' '}
                              <Link to="/admin/integrations#ai" className="text-primary underline">
                                Integrations → OpenAI
                              </Link>
                            </AlertDescription>
                          </Alert>
                        )
                      )}
                      
                      {formData.aiProvider === 'gemini' && (
                        isGeminiConfigured ? (
                          <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800 dark:text-green-200">Gemini Ready</AlertTitle>
                            <AlertDescription className="text-green-700 dark:text-green-300">
                              Model: {integrationSettings?.gemini?.config?.model || 'gemini-2.0-flash-exp'}.{' '}
                              <Link to="/admin/integrations#ai" className="underline">
                                Change settings
                              </Link>
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Alert>
                            <XCircle className="h-4 w-4" />
                            <AlertTitle>Gemini Not Configured</AlertTitle>
                            <AlertDescription>
                              Add your API key in{' '}
                              <Link to="/admin/integrations#ai" className="text-primary underline">
                                Integrations → Gemini
                              </Link>
                            </AlertDescription>
                          </Alert>
                        )
                      )}
                      
                      {formData.aiProvider === 'local' && (
                        integrationSettings?.local_llm?.enabled ? (
                          <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900">
                            <Shield className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800 dark:text-green-200">Local LLM Ready (HIPAA-compliant)</AlertTitle>
                            <AlertDescription className="text-green-700 dark:text-green-300">
                              Endpoint: {integrationSettings?.local_llm?.config?.endpoint || 'Not set'}.{' '}
                              <Link to="/admin/integrations#ai" className="underline">
                                Change settings
                              </Link>
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Alert>
                            <XCircle className="h-4 w-4" />
                            <AlertTitle>Local LLM Not Configured</AlertTitle>
                            <AlertDescription>
                              Configure your endpoint in{' '}
                              <Link to="/admin/integrations#ai" className="text-primary underline">
                                Integrations → Local LLM
                              </Link>
                            </AlertDescription>
                          </Alert>
                        )
                      )}
                      
                      {formData.aiProvider === 'n8n' && (
                        integrationSettings?.n8n?.enabled ? (
                          <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900">
                            <Webhook className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800 dark:text-green-200">N8N Ready</AlertTitle>
                            <AlertDescription className="text-green-700 dark:text-green-300">
                              Mode: {integrationSettings?.n8n?.config?.webhookType || 'chat'}.{' '}
                              <Link to="/admin/integrations#automation" className="underline">
                                Change settings
                              </Link>
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Alert>
                            <XCircle className="h-4 w-4" />
                            <AlertTitle>N8N Not Configured</AlertTitle>
                            <AlertDescription>
                              Configure your webhook in{' '}
                              <Link to="/admin/integrations#automation" className="text-primary underline">
                                Integrations → N8N
                              </Link>
                            </AlertDescription>
                          </Alert>
                        )
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Knowledge Base settings */}
            <TabsContent value="knowledge">
              <div className="space-y-6">
                {/* CMS Pages Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      CMS Pages
                    </CardTitle>
                    <CardDescription>
                      Include website page content as context for the AI
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
                      <PageSelector 
                        selectedSlugs={formData.includedPageSlugs || []}
                        onSelectionChange={(slugs) => setFormData({ ...formData, includedPageSlugs: slugs })}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* KB Articles Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HelpCircle className="h-5 w-5" />
                      Knowledge Base Articles
                    </CardTitle>
                    <CardDescription>
                      Include FAQ articles from Knowledge Base in AI context
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <h4 className="font-medium">Include KB Articles</h4>
                        <p className="text-sm text-muted-foreground">
                          AI gets access to KB articles marked for chat context
                        </p>
                      </div>
                      <Switch
                        checked={formData.includeKbArticles ?? false}
                        onCheckedChange={(includeKbArticles) => 
                          setFormData({ ...formData, includeKbArticles })
                        }
                      />
                    </div>

                    {formData.includeKbArticles && (
                      <KbArticlesInfo />
                    )}
                  </CardContent>
                </Card>

                {/* Token settings */}
                {(formData.includeContentAsContext || formData.includeKbArticles) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Context Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900">
                        <Database className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-blue-800 dark:text-blue-200">Context Augmented Generation</AlertTitle>
                        <AlertDescription className="text-blue-700 dark:text-blue-300">
                          Selected content is sent as context to the AI with each message.
                        </AlertDescription>
                      </Alert>

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
                    </CardContent>
                  </Card>
                )}
              </div>
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
                        <div className="grid grid-cols-2 gap-4">
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
                            <Label>Style</Label>
                            <Select
                              value={formData.widgetStyle || 'floating'}
                              onValueChange={(value) => setFormData({ 
                                ...formData, 
                                widgetStyle: value as ChatSettings['widgetStyle']
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="floating">Floating button</SelectItem>
                                <SelectItem value="pill">Pill (expands on hover)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Size</Label>
                            <Select
                              value={formData.widgetSize || 'md'}
                              onValueChange={(value) => setFormData({ 
                                ...formData, 
                                widgetSize: value as ChatSettings['widgetSize']
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sm">Small</SelectItem>
                                <SelectItem value="md">Medium</SelectItem>
                                <SelectItem value="lg">Large</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Max Quick Prompts</Label>
                            <Select
                              value={String(formData.widgetMaxPrompts ?? 3)}
                              onValueChange={(value) => setFormData({ 
                                ...formData, 
                                widgetMaxPrompts: parseInt(value)
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">2 prompts</SelectItem>
                                <SelectItem value="3">3 prompts</SelectItem>
                                <SelectItem value="4">4 prompts</SelectItem>
                                <SelectItem value="5">5 prompts</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="widgetButtonText">Button Text (for pill style)</Label>
                          <Input
                            id="widgetButtonText"
                            value={formData.widgetButtonText}
                            onChange={(e) => setFormData({ ...formData, widgetButtonText: e.target.value })}
                            placeholder="Chat with us"
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div>
                            <h5 className="text-sm font-medium">Show on mobile</h5>
                            <p className="text-xs text-muted-foreground">
                              Display widget on small screens
                            </p>
                          </div>
                          <Switch
                            checked={formData.widgetShowOnMobile ?? true}
                            onCheckedChange={(widgetShowOnMobile) => 
                              setFormData({ ...formData, widgetShowOnMobile })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Context indicator setting */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Show Context Indicator</h4>
                      <p className="text-sm text-muted-foreground">
                        Display "X pages • Y articles" badge in chat
                      </p>
                    </div>
                    <Switch
                      checked={formData.showContextIndicator ?? true}
                      onCheckedChange={(showContextIndicator) => 
                        setFormData({ ...formData, showContextIndicator })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Feedback settings */}
            <TabsContent value="feedback">
              <FeedbackTab formData={formData} setFormData={setFormData} />
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

// KB Articles info component
function KbArticlesInfo() {
  const { data: stats, isLoading } = useKbStats();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 border rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const includedCount = stats?.chatArticles ?? 0;
  const totalPublished = stats?.articles ?? 0;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-semibold">{includedCount}</span>
            <span className="text-muted-foreground ml-1">of {totalPublished} articles</span>
          </div>
          <Badge variant={includedCount > 0 ? "default" : "secondary"}>
            {includedCount > 0 ? "Active" : "None selected"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Articles marked with "Include in AI Chat" will be used as context
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Toggle individual articles in the Knowledge Base editor
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/knowledge-base">
            Manage Articles
            <ExternalLink className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// Feedback Tab component
function FeedbackTab({ 
  formData, 
  setFormData 
}: { 
  formData: ChatSettings; 
  setFormData: (data: ChatSettings) => void;
}) {
  const { data: stats, isLoading: statsLoading } = useChatFeedbackStats();
  const { data: recentFeedback, isLoading: feedbackLoading } = useChatFeedbackList(10);
  const { data: articlesNeedingImprovement } = useKbArticlesNeedingImprovement();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const count = await exportFeedbackForFineTuning();
      toast.success(`Exported ${count} conversations for fine-tuning`);
    } catch (error) {
      toast.error('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Feedback</CardTitle>
              <CardDescription>
                Allow users to rate AI responses with thumbs up/down
              </CardDescription>
            </div>
            <Switch
              checked={formData.feedbackEnabled ?? true}
              onCheckedChange={(feedbackEnabled) => setFormData({ ...formData, feedbackEnabled })}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Feedback Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950">
                <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
                  <ThumbsUp className="h-5 w-5" />
                  {stats.positive}
                </div>
                <div className="text-sm text-green-600/70">Positive</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-950">
                <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                  <ThumbsDown className="h-5 w-5" />
                  {stats.negative}
                </div>
                <div className="text-sm text-red-600/70">Negative</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-primary/10">
                <div className="text-2xl font-bold text-primary">{stats.positiveRate}%</div>
                <div className="text-sm text-muted-foreground">Satisfaction</div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No feedback data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Articles needing improvement */}
      {articlesNeedingImprovement && articlesNeedingImprovement.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Articles Needing Improvement
            </CardTitle>
            <CardDescription>
              These KB articles have received negative feedback and may need updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {articlesNeedingImprovement.map(article => (
                <Link
                  key={article.id}
                  to={`/admin/knowledge-base/${article.slug}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{article.title}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-green-600 flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" /> {article.positive_feedback_count || 0}
                    </span>
                    <span className="text-red-600 flex items-center gap-1">
                      <ThumbsDown className="h-3 w-3" /> {article.negative_feedback_count || 0}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent feedback */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          {feedbackLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentFeedback && recentFeedback.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recentFeedback.map(feedback => (
                <div 
                  key={feedback.id} 
                  className="flex items-start gap-3 p-3 rounded-lg border"
                >
                  <div className={feedback.rating === 'positive' 
                    ? 'text-green-500' 
                    : 'text-red-500'
                  }>
                    {feedback.rating === 'positive' 
                      ? <ThumbsUp className="h-4 w-4" /> 
                      : <ThumbsDown className="h-4 w-4" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    {feedback.user_question && (
                      <p className="text-sm font-medium truncate">
                        Q: {feedback.user_question}
                      </p>
                    )}
                    {feedback.ai_response && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        A: {feedback.ai_response}
                      </p>
                    )}
                    <time className="text-xs text-muted-foreground mt-1 block">
                      {new Date(feedback.created_at).toLocaleDateString()}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No feedback yet</p>
          )}
        </CardContent>
      </Card>

      {/* Export for fine-tuning */}
      <Card>
        <CardHeader>
          <CardTitle>Export for Fine-tuning</CardTitle>
          <CardDescription>
            Download positive-rated Q&A pairs in JSONL format for model fine-tuning
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            onClick={handleExport}
            disabled={isExporting || !stats?.positive}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export {stats?.positive || 0} positive conversations
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
