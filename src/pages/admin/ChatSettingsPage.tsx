import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useChatSettings, useUpdateChatSettings, ChatSettings, ChatAiProvider } from '@/hooks/useSiteSettings';
import { usePages } from '@/hooks/usePages';
import { useKbArticles, useKbStats } from '@/hooks/useKnowledgeBase';
import { useChatFeedbackStats, useChatFeedbackList, useKbArticlesNeedingImprovement, exportFeedbackForFineTuning } from '@/hooks/useChatFeedback';
import { useChatAnalytics, useChatAnalyticsTrend } from '@/hooks/useChatAnalytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, Cloud, Server, Webhook, Shield, Database, BookOpen, FileText, HelpCircle, ExternalLink, ThumbsUp, ThumbsDown, Download, CheckCircle2, XCircle, AlertTriangle, Wrench, Globe, Headphones, Brain, Gauge, BarChart3, TrendingUp, Bot, Users, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useUnsavedChanges, UnsavedChangesDialog } from '@/hooks/useUnsavedChanges';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsOpenAIConfigured, useIsGeminiConfigured } from '@/hooks/useIntegrationStatus';
import { useIntegrations } from '@/hooks/useIntegrations';
import { IntegrationWarning } from '@/components/admin/IntegrationWarning';
import { toast } from 'sonner';
import { IntegrationsSettings } from '@/hooks/useIntegrations';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// Component to show which AI provider is currently active
function ActiveProviderIndicator({ 
  selectedProvider, 
  isOpenAIConfigured, 
  isGeminiConfigured,
  integrationSettings 
}: { 
  selectedProvider: ChatAiProvider;
  isOpenAIConfigured: boolean | null;
  isGeminiConfigured: boolean | null;
  integrationSettings: IntegrationsSettings | undefined;
}) {
  const getProviderStatus = () => {
    switch (selectedProvider) {
      case 'openai':
        return {
          name: 'OpenAI',
          model: integrationSettings?.openai?.config?.model || 'gpt-4o-mini',
          isConfigured: isOpenAIConfigured === true,
          icon: <Cloud className="h-4 w-4" />,
        };
      case 'gemini':
        return {
          name: 'Google Gemini',
          model: integrationSettings?.gemini?.config?.model || 'gemini-2.0-flash-exp',
          isConfigured: isGeminiConfigured === true,
          icon: <Cloud className="h-4 w-4" />,
        };
      case 'local':
        return {
          name: 'Local LLM',
          model: integrationSettings?.local_llm?.config?.model || 'Custom model',
          isConfigured: integrationSettings?.local_llm?.enabled === true && !!integrationSettings?.local_llm?.config?.endpoint,
          icon: <Server className="h-4 w-4" />,
        };
      case 'n8n':
        return {
          name: 'N8N Webhook',
          model: integrationSettings?.n8n?.config?.webhookType || 'chat',
          isConfigured: integrationSettings?.n8n?.enabled === true && !!integrationSettings?.n8n?.config?.webhookUrl,
          icon: <Webhook className="h-4 w-4" />,
        };
      default:
        return {
          name: 'Unknown',
          model: '',
          isConfigured: false,
          icon: <AlertTriangle className="h-4 w-4" />,
        };
    }
  };

  const status = getProviderStatus();

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      status.isConfigured 
        ? 'bg-green-50 border-green-200 dark:bg-green-950/50 dark:border-green-900' 
        : 'bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-900'
    }`}>
      <div className={`p-2 rounded-full ${
        status.isConfigured 
          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
      }`}>
        {status.isConfigured ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${
            status.isConfigured 
              ? 'text-green-800 dark:text-green-200' 
              : 'text-amber-800 dark:text-amber-200'
          }`}>
            Active Provider: {status.name}
          </span>
          <Badge variant={status.isConfigured ? 'default' : 'secondary'} className="text-xs">
            {status.isConfigured ? 'Ready' : 'Not configured'}
          </Badge>
        </div>
        <p className={`text-xs mt-0.5 ${
          status.isConfigured 
            ? 'text-green-600 dark:text-green-400' 
            : 'text-amber-600 dark:text-amber-400'
        }`}>
          {status.isConfigured 
            ? `Using ${status.model}` 
            : 'Configure in Integrations to enable chat'}
        </p>
      </div>
      <Link to="/admin/integrations#ai">
        <Button variant="ghost" size="sm" className="text-xs">
          {status.icon}
          <span className="ml-1.5">Settings</span>
        </Button>
      </Link>
    </div>
  );
}

export default function ChatSettingsPage() {
  const { data: settings, isLoading } = useChatSettings();
  const updateSettings = useUpdateChatSettings();
  const [formData, setFormData] = useState<ChatSettings | null>(null);
  const isOpenAIConfigured = useIsOpenAIConfigured();
  const isGeminiConfigured = useIsGeminiConfigured();
  const { data: integrationSettings } = useIntegrations();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'general';

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

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
          {formData.enabled && (
            <CardContent className="pt-0">
              <ActiveProviderIndicator
                selectedProvider={formData.aiProvider}
                isOpenAIConfigured={isOpenAIConfigured}
                isGeminiConfigured={isGeminiConfigured}
                integrationSettings={integrationSettings}
              />
            </CardContent>
          )}
        </Card>

        {formData.enabled && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-8 w-full">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="provider">Provider</TabsTrigger>
              <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
              <TabsTrigger value="display">Display</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
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

                  {/* Live Agent Banner setting */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Show Live Agent Banner</h4>
                      <p className="text-sm text-muted-foreground">
                        Display "You are now chatting with a live agent" banner
                      </p>
                    </div>
                    <Switch
                      checked={formData.showLiveAgentBanner ?? true}
                      onCheckedChange={(showLiveAgentBanner) => 
                        setFormData({ ...formData, showLiveAgentBanner })
                      }
                    />
                  </div>

                  {/* Chat Icons setting */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Show Chat Icons</h4>
                      <p className="text-sm text-muted-foreground">
                        Display avatars/icons in chat messages (Grok-style when disabled)
                      </p>
                    </div>
                    <Switch
                      checked={formData.showChatIcons ?? true}
                      onCheckedChange={(showChatIcons) => 
                        setFormData({ ...formData, showChatIcons })
                      }
                    />
                  </div>

                  {/* Live Agent Icon Style setting */}
                  <div className="space-y-2 p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">Live Agent Icon Style</h4>
                      <p className="text-sm text-muted-foreground">
                        What to display instead of the robot icon when chatting with a live agent
                      </p>
                    </div>
                    <Select
                      value={formData.liveAgentIconStyle ?? 'avatar'}
                      onValueChange={(liveAgentIconStyle: 'avatar' | 'person' | 'headphones') => 
                        setFormData({ ...formData, liveAgentIconStyle })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="avatar">Profile Avatar</SelectItem>
                        <SelectItem value="person">Person Icon</SelectItem>
                        <SelectItem value="headphones">Headphones Icon</SelectItem>
                      </SelectContent>
                    </Select>
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

            {/* Advanced / Tool Calling settings */}
            <TabsContent value="advanced">
              <div className="space-y-6">
                {/* General Knowledge Toggle */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                          <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <CardTitle>Allow General Knowledge</CardTitle>
                          <CardDescription>
                            Let the AI use its own knowledge beyond page content. When disabled, AI only answers based on your website content.
                          </CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={formData.allowGeneralKnowledge ?? false}
                        onCheckedChange={(allowGeneralKnowledge) => 
                          setFormData({ ...formData, allowGeneralKnowledge })
                        }
                      />
                    </div>
                  </CardHeader>
                </Card>

                {/* Tool Calling Master Toggle */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Wrench className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle>Tool Calling</CardTitle>
                          <CardDescription>
                            Enable AI to use external tools and take actions
                          </CardDescription>
                        </div>
                      </div>
                      <Switch
                        checked={formData.toolCallingEnabled ?? false}
                        onCheckedChange={(toolCallingEnabled) => 
                          setFormData({ ...formData, toolCallingEnabled })
                        }
                      />
                    </div>
                  </CardHeader>
                </Card>

                {formData.toolCallingEnabled && (
                  <>
                    {/* Firecrawl Web Search */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                              <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <CardTitle className="text-base">Firecrawl Web Search</CardTitle>
                              <CardDescription>
                                AI can search the web for current information
                              </CardDescription>
                            </div>
                          </div>
                          <Switch
                            checked={formData.firecrawlSearchEnabled ?? false}
                            onCheckedChange={(firecrawlSearchEnabled) => 
                              setFormData({ ...formData, firecrawlSearchEnabled })
                            }
                          />
                        </div>
                      </CardHeader>
                      {formData.firecrawlSearchEnabled && (
                        <CardContent className="pt-0">
                          <Alert>
                            <Globe className="h-4 w-4" />
                            <AlertDescription>
                              Requires Firecrawl API key configured in{' '}
                              <Link to="/admin/integrations" className="text-primary underline">
                                Integrations
                              </Link>
                            </AlertDescription>
                          </Alert>
                        </CardContent>
                      )}
                    </Card>

                    {/* Human Handoff */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                              <Headphones className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <CardTitle className="text-base">Human Handoff</CardTitle>
                              <CardDescription>
                                AI can transfer conversations to live support agents
                              </CardDescription>
                            </div>
                          </div>
                          <Switch
                            checked={formData.humanHandoffEnabled ?? false}
                            onCheckedChange={(humanHandoffEnabled) => 
                              setFormData({ ...formData, humanHandoffEnabled })
                            }
                          />
                        </div>
                      </CardHeader>
                      {formData.humanHandoffEnabled && (
                        <CardContent className="pt-0">
                          <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900">
                            <Headphones className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-700 dark:text-green-300">
                              When enabled, AI will route conversations to available agents when users need human support.
                              If no agents are online, an escalation ticket will be created.
                            </AlertDescription>
                          </Alert>
                        </CardContent>
                      )}
                    </Card>

                    {/* Sentiment Detection */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <CardTitle className="text-base">Sentiment Detection</CardTitle>
                              <CardDescription>
                                AI analyzes user sentiment to detect frustration
                              </CardDescription>
                            </div>
                          </div>
                          <Switch
                            checked={formData.sentimentDetectionEnabled ?? false}
                            onCheckedChange={(sentimentDetectionEnabled) => 
                              setFormData({ ...formData, sentimentDetectionEnabled })
                            }
                          />
                        </div>
                      </CardHeader>
                      {formData.sentimentDetectionEnabled && (
                        <CardContent className="pt-0 space-y-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="sentimentThreshold">Handoff Threshold</Label>
                              <span className="text-sm text-muted-foreground">
                                {formData.sentimentThreshold ?? 7}/10 frustration
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <Gauge className="h-4 w-4 text-muted-foreground" />
                              <input
                                type="range"
                                id="sentimentThreshold"
                                min={1}
                                max={10}
                                value={formData.sentimentThreshold ?? 7}
                                onChange={(e) => setFormData({ 
                                  ...formData, 
                                  sentimentThreshold: parseInt(e.target.value) 
                                })}
                                className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              When user frustration exceeds this level, AI will automatically suggest human support
                            </p>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  </>
                )}

                {/* Local AI Tool Calling Support Toggle */}
                {formData.toolCallingEnabled && formData.aiProvider === 'local' && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                            <Server className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Local AI Tool Calling</CardTitle>
                            <CardDescription>
                              Enable if your local model supports OpenAI-compatible function calling
                            </CardDescription>
                          </div>
                        </div>
                        <Switch
                          checked={formData.localSupportsToolCalling ?? false}
                          onCheckedChange={(localSupportsToolCalling) => 
                            setFormData({ ...formData, localSupportsToolCalling })
                          }
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Alert className="bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-900">
                        <Server className="h-4 w-4 text-orange-600" />
                        <AlertDescription className="text-orange-700 dark:text-orange-300">
                          Compatible models include Qwen3, Mistral, and other models that support OpenAI function calling format.
                          If disabled, keyword-based handoff detection will be used as fallback.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                )}

                {!formData.toolCallingEnabled && (
                  <Alert>
                    <Wrench className="h-4 w-4" />
                    <AlertTitle>Tool Calling Disabled</AlertTitle>
                    <AlertDescription>
                      Enable tool calling above to configure web search, human handoff, and sentiment detection features.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>

            {/* Analytics */}
            <TabsContent value="analytics">
              <AnalyticsTab saveConversations={formData.saveConversations} />
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

// Analytics Tab component
const COLORS = ['#10b981', '#f59e0b', '#6b7280'];

function AnalyticsTab({ saveConversations }: { saveConversations?: boolean }) {
  const { data: analytics, isLoading: analyticsLoading } = useChatAnalytics(30);
  const { data: trend, isLoading: trendLoading } = useChatAnalyticsTrend(14);

  if (saveConversations === false) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Analytics Disabled</AlertTitle>
        <AlertDescription>
          Enable "Save Conversations" in the Privacy tab to track chat analytics.
        </AlertDescription>
      </Alert>
    );
  }

  const pieData = analytics ? [
    { name: 'AI Resolved', value: analytics.aiResolvedCount, color: '#10b981' },
    { name: 'Escalated', value: analytics.escalatedCount, color: '#f59e0b' },
    { name: 'Other', value: Math.max(0, analytics.totalConversations - analytics.aiResolvedCount - analytics.escalatedCount), color: '#6b7280' },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                {analyticsLoading ? (
                  <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold">{analytics?.totalConversations || 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Total conversations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                {analyticsLoading ? (
                  <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold">{analytics?.totalMessages || 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Total messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/50">
                <Bot className="h-5 w-5 text-green-600" />
              </div>
              <div>
                {analyticsLoading ? (
                  <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">{analytics?.aiResolutionRate || 0}%</p>
                )}
                <p className="text-xs text-muted-foreground">AI resolution rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                {analyticsLoading ? (
                  <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold text-amber-600">{analytics?.escalatedCount || 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Escalated to agent</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Conversation Trend (14 days)
          </CardTitle>
          <CardDescription>Daily conversation volume and outcomes</CardDescription>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="conversations" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                  name="Conversations"
                />
                <Line 
                  type="monotone" 
                  dataKey="resolved" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ fill: '#10b981' }}
                  name="AI Resolved"
                />
                <Line 
                  type="monotone" 
                  dataKey="escalated" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={{ fill: '#f59e0b' }}
                  name="Escalated"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No data available yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolution Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Resolution Breakdown</CardTitle>
            <CardDescription>How conversations are being handled</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                No data available yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversation Stats</CardTitle>
            <CardDescription>Additional metrics from the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Conversations today</span>
                  <span className="text-lg font-semibold">{analytics?.conversationsToday || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Conversations this week</span>
                  <span className="text-lg font-semibold">{analytics?.conversationsThisWeek || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Avg. messages per conversation</span>
                  <span className="text-lg font-semibold">{analytics?.averageMessagesPerConversation || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">AI resolved count</span>
                  <span className="text-lg font-semibold text-green-600">{analytics?.aiResolvedCount || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
