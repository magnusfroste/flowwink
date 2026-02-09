import { useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Copy,
  Mail,
  CreditCard,
  Image,
  Flame,
  Bot,
  Database,
  RefreshCw,
  ExternalLink,
  PauseCircle,
  Settings,
  Zap,
  Loader2,
  Server,
  Webhook,
  ChevronDown,
  Save,
  BarChart3,
  Target,
  MessageSquare,
} from "lucide-react";
import { useUnsavedChanges, UnsavedChangesDialog } from "@/hooks/useUnsavedChanges";
import {
  useIntegrations,
  useUpdateIntegrations,
  INTEGRATION_CATEGORIES,
  defaultIntegrationsSettings,
  type IntegrationsSettings,
  type IntegrationProviderConfig,
  type EmailConfig,
} from "@/hooks/useIntegrations";
import { useIntegrationStatus } from "@/hooks/useIntegrationStatus";
import { supabase } from "@/integrations/supabase/client";

// Icon mapping
const iconMap = {
  CreditCard,
  Mail,
  Bot,
  Image,
  Flame,
  Server,
  Webhook,
  BarChart3,
  Target,
  MessageSquare,
};

type IntegrationStatus = 'active' | 'disabled' | 'not_configured';

function getStatusBadge(status: IntegrationStatus) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Active
        </Badge>
      );
    case 'disabled':
      return (
        <Badge variant="secondary" className="gap-1">
          <PauseCircle className="h-3 w-3" />
          Configured
        </Badge>
      );
    case 'not_configured':
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <XCircle className="h-3 w-3" />
          Not configured
        </Badge>
      );
  }
}

// Test AI Connection Button Component
function TestAIConnectionButton({ 
  provider, 
  hasKey, 
  isEnabled 
}: { 
  provider: 'openai' | 'gemini'; 
  hasKey: boolean; 
  isEnabled: boolean;
}) {
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async () => {
    if (!hasKey || !isEnabled) return;
    
    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: { provider }
      });

      if (error) {
        toast.error(`Test failed: ${error.message}`);
        return;
      }

      if (data?.success) {
        toast.success(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} connection verified! Model: ${data.model}`);
      } else {
        toast.error(`Test failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsTesting(false);
    }
  };

  if (!hasKey || !isEnabled) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleTest}
      disabled={isTesting}
      className="gap-1.5"
    >
      {isTesting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Zap className="h-3.5 w-3.5" />
      )}
      Test Connection
    </Button>
  );
}

// Test Config-based Connection Button (Local LLM, N8N)
function TestConfigConnectionButton({ 
  provider, 
  config,
  isEnabled 
}: { 
  provider: 'local_llm' | 'n8n'; 
  config?: IntegrationProviderConfig;
  isEnabled: boolean;
}) {
  const [isTesting, setIsTesting] = useState(false);

  const canTest = isEnabled && (
    (provider === 'local_llm' && config?.endpoint) ||
    (provider === 'n8n' && config?.webhookUrl)
  );

  const handleTest = async () => {
    if (!canTest) return;
    
    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: { provider, config }
      });

      if (error) {
        toast.error(`Test failed: ${error.message}`);
        return;
      }

      const providerName = provider === 'local_llm' ? 'Local LLM' : 'N8N';
      if (data?.success) {
        toast.success(`${providerName} connection verified! ${data.model ? `Model: ${data.model}` : ''}`);
      } else {
        toast.error(`Test failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsTesting(false);
    }
  };

  if (!canTest) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleTest}
      disabled={isTesting}
      className="gap-1.5"
    >
      {isTesting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Zap className="h-3.5 w-3.5" />
      )}
      Test Connection
    </Button>
  );
}

// Integration Configuration Component - no auto-save, uses parent callback directly
function IntegrationConfigPanel({ 
  integrationKey,
  config,
  onConfigChange,
  hasKey,
  isEnabled,
}: { 
  integrationKey: keyof IntegrationsSettings;
  config?: IntegrationProviderConfig;
  onConfigChange: (config: IntegrationProviderConfig) => void;
  hasKey: boolean;
  isEnabled: boolean;
}) {
  // Update parent state directly on change
  const handleChange = useCallback((updates: Partial<IntegrationProviderConfig>) => {
    onConfigChange({ ...config, ...updates });
  }, [config, onConfigChange]);

  if (!hasKey || !isEnabled) return null;

  if (integrationKey === 'openai') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="openai-baseurl" className="text-xs">Base URL (optional)</Label>
          <Input
            id="openai-baseurl"
            value={config?.baseUrl || 'https://api.openai.com/v1'}
            onChange={(e) => handleChange({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">For Azure OpenAI or compatible APIs</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="openai-model" className="text-xs">Default Model</Label>
          <Select
            value={config?.model || 'gpt-4o-mini'}
            onValueChange={(value) => handleChange({ model: value })}
          >
            <SelectTrigger id="openai-model" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4o-mini">GPT-4o Mini (Recommended)</SelectItem>
              <SelectItem value="gpt-4o">GPT-4o (Powerful)</SelectItem>
              <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (integrationKey === 'gemini') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="gemini-model" className="text-xs">Default Model</Label>
          <Select
            value={config?.model || 'gemini-2.0-flash-exp'}
            onValueChange={(value) => handleChange({ model: value })}
          >
            <SelectTrigger id="gemini-model" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Recommended)</SelectItem>
              <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Stable)</SelectItem>
              <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro (Powerful)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (integrationKey === 'local_llm') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="local-endpoint" className="text-xs">Endpoint URL *</Label>
          <Input
            id="local-endpoint"
            value={config?.endpoint || ''}
            onChange={(e) => handleChange({ endpoint: e.target.value })}
            placeholder="http://localhost:11434"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">OpenAI-compatible API (Ollama, vLLM, LocalAI)</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="local-model" className="text-xs">Model Name</Label>
          <Input
            id="local-model"
            value={config?.model || 'llama3'}
            onChange={(e) => handleChange({ model: e.target.value })}
            placeholder="llama3"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="local-apikey" className="text-xs">API Key (optional)</Label>
          <Input
            id="local-apikey"
            type="password"
            value={config?.apiKey || ''}
            onChange={(e) => handleChange({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">Required if your local LLM needs authentication</p>
        </div>
      </div>
    );
  }

  if (integrationKey === 'n8n') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="n8n-webhook" className="text-xs">Webhook URL *</Label>
          <Input
            id="n8n-webhook"
            value={config?.webhookUrl || ''}
            onChange={(e) => handleChange({ webhookUrl: e.target.value })}
            placeholder="https://n8n.example.com/webhook/..."
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="n8n-apikey" className="text-xs">API Key / Header Auth (optional)</Label>
          <Input
            id="n8n-apikey"
            type="password"
            value={config?.apiKey || ''}
            onChange={(e) => handleChange({ apiKey: e.target.value })}
            placeholder="Bearer token or API key"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">Sent as Authorization header if set</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="n8n-type" className="text-xs">Webhook Type</Label>
          <Select
            value={config?.webhookType || 'chat'}
            onValueChange={(value) => handleChange({ webhookType: value as 'chat' | 'generic' })}
          >
            <SelectTrigger id="n8n-type" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat">Chat Webhook (with session memory)</SelectItem>
              <SelectItem value="generic">Generic Webhook (OpenAI-compatible)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="n8n-trigger" className="text-xs">Trigger Mode</Label>
          <Select
            value={config?.triggerMode || 'always'}
            onValueChange={(value) => handleChange({ triggerMode: value as 'always' | 'keywords' | 'fallback' })}
          >
            <SelectTrigger id="n8n-trigger" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">All messages</SelectItem>
              <SelectItem value="keywords">Only on keywords</SelectItem>
              <SelectItem value="fallback">As fallback</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {config?.triggerMode === 'keywords' && (
          <div className="space-y-2">
            <Label htmlFor="n8n-keywords" className="text-xs">Trigger Keywords</Label>
            <Input
              id="n8n-keywords"
              value={(config?.triggerKeywords || []).join(', ')}
              onChange={(e) => handleChange({ 
                triggerKeywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) 
              })}
              placeholder="book, price, contact"
              className="h-8 text-sm"
            />
          </div>
        )}
      </div>
    );
  }

  if (integrationKey === 'google_analytics') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="ga4-id" className="text-xs">Measurement ID *</Label>
          <Input
            id="ga4-id"
            value={config?.measurementId || ''}
            onChange={(e) => handleChange({ measurementId: e.target.value })}
            placeholder="G-XXXXXXXXXX"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Found in Google Analytics → Admin → Data Streams → Web
          </p>
        </div>
      </div>
    );
  }

  if (integrationKey === 'meta_pixel') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="pixel-id" className="text-xs">Pixel ID *</Label>
          <Input
            id="pixel-id"
            value={config?.pixelId || ''}
            onChange={(e) => handleChange({ pixelId: e.target.value })}
            placeholder="123456789012345"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Found in Meta Events Manager → Data Sources → Your Pixel
          </p>
        </div>
      </div>
    );
  }

  if (integrationKey === 'slack') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="slack-webhook" className="text-xs">Webhook URL *</Label>
          <Input
            id="slack-webhook"
            value={config?.webhookUrl || ''}
            onChange={(e) => handleChange({ webhookUrl: e.target.value })}
            placeholder="https://hooks.slack.com/services/..."
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Also works with Microsoft Teams incoming webhooks
          </p>
        </div>
        <div className="space-y-2 pt-2">
          <Label className="text-xs font-medium">Notify on</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={config?.notifyOnNewLead ?? true}
                onCheckedChange={(checked) => handleChange({ notifyOnNewLead: checked })}
              />
              New contact created
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={config?.notifyOnDealWon ?? true}
                onCheckedChange={(checked) => handleChange({ notifyOnDealWon: checked })}
              />
              Deal won
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={config?.notifyOnFormSubmit ?? false}
                onCheckedChange={(checked) => handleChange({ notifyOnFormSubmit: checked })}
              />
              Form submission
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (integrationKey === 'resend') {
    const emailConfig = config?.emailConfig || { fromEmail: 'onboarding@resend.dev', fromName: 'Newsletter' };
    const newsletterTracking = config?.newsletterTracking || { enableOpenTracking: false, enableClickTracking: false };
    
    return (
      <div className="space-y-4 pt-3 border-t">
        {/* Email Config */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="resend-from-name" className="text-xs">From Name</Label>
            <Input
              id="resend-from-name"
              value={emailConfig.fromName}
              onChange={(e) => handleChange({ 
                emailConfig: { ...emailConfig, fromName: e.target.value },
                newsletterTracking
              })}
              placeholder="Newsletter"
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">Display name for sent emails</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="resend-from-email" className="text-xs">From Email *</Label>
            <Input
              id="resend-from-email"
              value={emailConfig.fromEmail}
              onChange={(e) => handleChange({ 
                emailConfig: { ...emailConfig, fromEmail: e.target.value },
                newsletterTracking
              })}
              placeholder="news@yourdomain.com"
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Must use a verified domain in Resend.{" "}
              <a 
                href="https://resend.com/domains" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary hover:underline"
              >
                Verify domain →
              </a>
            </p>
          </div>
        </div>

        {/* Newsletter Tracking */}
        <div className="space-y-3 pt-3 border-t">
          <Label className="text-xs font-medium">Newsletter Tracking</Label>
          <p className="text-xs text-muted-foreground">
            Tracking may affect email deliverability. Disable if emails go to spam.
          </p>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="open-tracking" className="text-xs">Open Tracking</Label>
                <p className="text-xs text-muted-foreground">Track when emails are opened (uses tracking pixel)</p>
              </div>
              <Switch
                id="open-tracking"
                checked={newsletterTracking.enableOpenTracking}
                onCheckedChange={(checked) => handleChange({ 
                  emailConfig,
                  newsletterTracking: { ...newsletterTracking, enableOpenTracking: checked }
                })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="click-tracking" className="text-xs">Click Tracking</Label>
                <p className="text-xs text-muted-foreground">Track link clicks (rewrites URLs)</p>
              </div>
              <Switch
                id="click-tracking"
                checked={newsletterTracking.enableClickTracking}
                onCheckedChange={(checked) => handleChange({ 
                  emailConfig,
                  newsletterTracking: { ...newsletterTracking, enableClickTracking: checked }
                })}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function IntegrationsStatusPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [pendingSettings, setPendingSettings] = useState<Partial<IntegrationsSettings> | null>(null);

  const { data: secretsStatus, isLoading: secretsLoading, refetch: refetchSecrets } = useIntegrationStatus();
  const { data: integrationSettings, isLoading: settingsLoading } = useIntegrations();
  const updateIntegrations = useUpdateIntegrations();

  const isLoading = secretsLoading || settingsLoading;
  const hasUnsavedChanges = pendingSettings !== null;

  // Unsaved changes protection
  const { blocker } = useUnsavedChanges({ hasChanges: hasUnsavedChanges });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchSecrets();
    setIsRefreshing(false);
    toast.success("Status updated");
  };

  const copyCommand = (secretName: string) => {
    const command = `supabase secrets set ${secretName}=your_api_key_here`;
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  // Toggle saves immediately (no pending state needed for switches)
  const handleToggle = (key: keyof IntegrationsSettings, enabled: boolean) => {
    updateIntegrations.mutate({
      [key]: { enabled },
    });
  };

  // Config changes are collected into pending state
  const handleConfigChange = (key: keyof IntegrationsSettings, config: IntegrationProviderConfig) => {
    setPendingSettings(prev => ({
      ...prev,
      [key]: { 
        ...(integrationSettings?.[key] || {}),
        config 
      },
    }));
  };

  // Save all pending changes
  const handleSave = async () => {
    if (!pendingSettings) return;
    
    try {
      await updateIntegrations.mutateAsync(pendingSettings);
      setPendingSettings(null);
      toast.success("Settings saved");
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  // Discard pending changes
  const handleDiscard = () => {
    setPendingSettings(null);
    toast.success("Changes discarded");
  };

  const toggleCardExpanded = (key: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const coreSecretsConfigured = secretsStatus?.core
    ? Object.values(secretsStatus.core).every(Boolean)
    : false;

  // Calculate active count
  const integrationKeys = Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[];
  let activeCount = 0;
  let configuredCount = 0;

  for (const key of integrationKeys) {
    const hasKey = secretsStatus?.integrations?.[key] ?? false;
    const isEnabled = integrationSettings?.[key]?.enabled ?? false;
    if (hasKey) configuredCount++;
    if (hasKey && isEnabled) activeCount++;
  }

  // Helper to get the display config (pending if available, otherwise current)
  const getDisplayConfig = (key: keyof IntegrationsSettings) => {
    return pendingSettings?.[key]?.config || integrationSettings?.[key]?.config;
  };

  // Group integrations by category
  const groupedIntegrations = integrationKeys.reduce((acc, key) => {
    const integration = integrationSettings?.[key] || defaultIntegrationsSettings[key];
    const category = integration.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push({ key, ...integration });
    return acc;
  }, {} as Record<string, Array<{ key: keyof IntegrationsSettings } & typeof defaultIntegrationsSettings[keyof typeof defaultIntegrationsSettings]>>);

  // Sort categories by order
  const sortedCategories = Object.entries(INTEGRATION_CATEGORIES)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key]) => key as keyof typeof INTEGRATION_CATEGORIES);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Integrations"
          description="Manage external service integrations"
        >
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleDiscard}
                disabled={updateIntegrations.isPending}
              >
                Discard
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={updateIntegrations.isPending}
                className="gap-2"
              >
                {updateIntegrations.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </AdminPageHeader>
        {/* System Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">System Status</CardTitle>
                  <CardDescription>Core backend configuration</CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-24" />
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {coreSecretsConfigured ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-muted-foreground">
                      All core secrets configured
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <span className="text-sm text-destructive">
                      Missing core secrets
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrations Summary */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Integrations</h2>
            <p className="text-sm text-muted-foreground">
              {activeCount} of {integrationKeys.length} active
              {configuredCount > activeCount && ` (${configuredCount} configured)`}
            </p>
          </div>
        </div>

        {/* Integration Cards by Category */}
        <TooltipProvider>
          {sortedCategories.map((categoryKey) => {
            const categoryIntegrations = groupedIntegrations[categoryKey];
            if (!categoryIntegrations || categoryIntegrations.length === 0) return null;

            const categoryLabel = INTEGRATION_CATEGORIES[categoryKey].label;

            return (
              <div key={categoryKey} className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {categoryLabel}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {categoryIntegrations.map((integration) => {
                    const key = integration.key;
                    // For these integrations, no vault secret required - just need config
                    const noSecretNeeded = ['local_llm', 'n8n', 'google_analytics', 'meta_pixel', 'slack'];
                    const requiresSecret = !noSecretNeeded.includes(key);
                    const hasKey = requiresSecret ? (secretsStatus?.integrations?.[key] ?? false) : true;
                    const isEnabled = integrationSettings?.[key]?.enabled ?? false;
                    const status: IntegrationStatus = !hasKey ? 'not_configured' : isEnabled ? 'active' : 'disabled';
                    const IconComponent = iconMap[integration.icon as keyof typeof iconMap] || Bot;
                    const currentConfig = getDisplayConfig(key) || integration.config;
                    const hasConfigSection = ['openai', 'gemini', 'local_llm', 'n8n', 'resend', 'google_analytics', 'meta_pixel', 'slack'].includes(key);
                    const isExpanded = expandedCards.has(key);

                    return (
                      <Card 
                        key={key} 
                        className={
                          status === 'active' 
                            ? "border-primary/50" 
                            : status === 'disabled' 
                            ? "border-dashed opacity-75" 
                            : "border-dashed opacity-60"
                        }
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${status === 'active' ? "bg-primary/10" : "bg-muted"}`}>
                                <IconComponent className={`h-5 w-5 ${status === 'active' ? "text-primary" : "text-muted-foreground"}`} />
                              </div>
                              <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                  {integration.name}
                                  {isLoading ? (
                                    <Skeleton className="h-5 w-20" />
                                  ) : (
                                    getStatusBadge(status)
                                  )}
                                </CardTitle>
                                <CardDescription>{integration.description}</CardDescription>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Features */}
                          <div>
                            <p className="text-xs text-muted-foreground mb-1.5">Enables</p>
                            <div className="flex flex-wrap gap-1.5">
                              {integration.features.map((feature) => (
                                <Badge key={feature} variant="outline" className="text-xs font-normal">
                                  {feature}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Toggle & Settings */}
                          <div className="pt-3 border-t space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">Enable integration</p>
                                <p className="text-xs text-muted-foreground">
                                  {hasKey ? "Allow this integration to be used" : "Configure API key first"}
                                </p>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <Switch
                                      checked={isEnabled}
                                      onCheckedChange={(checked) => handleToggle(key, checked)}
                                      disabled={!hasKey || updateIntegrations.isPending}
                                    />
                                  </div>
                                </TooltipTrigger>
                                {!hasKey && (
                                  <TooltipContent>
                                    <p>API key must be configured first</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Test Connection Button for AI integrations with secrets */}
                              {(key === 'openai' || key === 'gemini') && (
                                <TestAIConnectionButton 
                                  provider={key} 
                                  hasKey={hasKey} 
                                  isEnabled={isEnabled} 
                                />
                              )}

                              {/* Test Connection Button for config-based integrations */}
                              {(key === 'local_llm' || key === 'n8n') && (
                                <TestConfigConnectionButton 
                                  provider={key} 
                                  config={currentConfig}
                                  isEnabled={isEnabled} 
                                />
                              )}

                              {/* Configuration toggle for AI integrations */}
                              {hasConfigSection && hasKey && isEnabled && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleCardExpanded(key)}
                                  className="gap-1.5"
                                >
                                  <Settings className="h-3.5 w-3.5" />
                                  Configure
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </Button>
                              )}

                              <a
                                href={integration.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                {integration.docsLabel || 'Get API key'}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>

                            {/* Configuration Panel */}
                            {hasConfigSection && isExpanded && (
                              <IntegrationConfigPanel
                                integrationKey={key}
                                config={currentConfig}
                                onConfigChange={(config) => handleConfigChange(key, config)}
                                hasKey={hasKey}
                                isEnabled={isEnabled}
                              />
                            )}

                            {/* CLI Command (only if not configured and requires secret) */}
                            {!hasKey && requiresSecret && (
                              <div className="space-y-1.5 pt-2">
                                <p className="text-xs text-muted-foreground">CLI command:</p>
                                <div className="flex items-center gap-2">
                                  <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono truncate">
                                    supabase secrets set {integration.secretName}=...
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyCommand(integration.secretName)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TooltipProvider>

        {/* Documentation Link */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Need help?</h3>
                <p className="text-sm text-muted-foreground">
                  See the setup documentation for detailed instructions
                </p>
              </div>
              <Button variant="outline" asChild>
                <a
                  href="https://github.com/magnusfroste/flowwink/blob/main/docs/SETUP.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Setup Guide
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </AdminPageContainer>
      <UnsavedChangesDialog blocker={blocker} />
    </AdminLayout>
  );
}
