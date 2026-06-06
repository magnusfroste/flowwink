import { useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { GmailIntegrationCard } from "@/components/admin/integrations/GmailIntegrationCard";
import { useIntegrationModuleMap } from "@/hooks/useModuleReadiness";

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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Key,
  Zap,
  Loader2,
  Server,
  Webhook,
  Save,
  BarChart3,
  Target,
  MessageSquare,
  Search,
  Megaphone,
  AlertTriangle,
} from "lucide-react";
import {
  useIntegrations,
  useUpdateIntegrations,
  INTEGRATION_CATEGORIES,
  defaultIntegrationsSettings,
  resolveIntegrationStatus,
  CONFIG_BASED_KEYS,
  configHasCredential,
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
  Search,
  Megaphone,
};

// Local alias for the page — pure delegate to the shared switch in useIntegrations.tsx.
// Kept so existing call sites (badge rendering) read naturally.
function hasRealCredential(
  key: keyof IntegrationsSettings,
  config: IntegrationProviderConfig | undefined,
): boolean {
  return configHasCredential(key, config);
}

function getCredentialBadge(hasCredential: boolean, requiresSecret: boolean) {
  if (hasCredential) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
        <Key className="h-3 w-3" />
        Ready
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <XCircle className="h-3 w-3" />
      {requiresSecret ? 'No API key' : 'Setup needed'}
    </Badge>
  );
}

function getUnavailableBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
      <AlertTriangle className="h-3 w-3" />
      Status unavailable
    </Badge>
  );
}

// Test AI Connection Button Component
function TestAIConnectionButton({
  provider,
  hasKey,
  isEnabled
}: {
  provider: 'openai' | 'gemini' | 'anthropic';
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
        const name = provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'Anthropic';
        toast.success(`${name} connection verified! Model: ${data.model}`);
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

// Hunter.io live credit indicator — calls hunter-account edge function
function HunterCreditsBadge({ hasKey }: { hasKey: boolean }) {
  const [info, setInfo] = useState<{ remaining: number; available: number; plan: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasKey) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('hunter-account');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to read account');
      setInfo({
        remaining: data.searches?.remaining ?? 0,
        available: data.searches?.available ?? 0,
        plan: data.plan_name ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [hasKey]);

  if (!hasKey) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">Hunter credits</span>
      {info ? (
        <span className="font-medium">
          {info.remaining.toLocaleString()} / {info.available.toLocaleString()}
          {info.plan && <span className="text-muted-foreground ml-1">({info.plan})</span>}
        </span>
      ) : error ? (
        <span className="text-destructive">{error}</span>
      ) : (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={loading} onClick={load}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Check'}
        </Button>
      )}
    </div>
  );
}

// Firecrawl live credit indicator — calls firecrawl-account edge function
function FirecrawlCreditsBadge({ hasKey }: { hasKey: boolean }) {
  const [info, setInfo] = useState<{ remaining: number; plan: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasKey) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('firecrawl-account');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to read credits');
      setInfo({
        remaining: data.remaining_credits ?? 0,
        plan: data.plan_credits ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [hasKey]);

  if (!hasKey) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">Firecrawl credits</span>
      {info ? (
        <span className="font-medium tabular-nums">
          {info.remaining.toLocaleString()}
          {info.plan != null && (
            <span className="text-muted-foreground"> / {info.plan.toLocaleString()}</span>
          )}
        </span>
      ) : error ? (
        <span className="text-destructive">{error}</span>
      ) : (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={loading} onClick={load}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Check'}
        </Button>
      )}
    </div>
  );
}

// OpenAI live usage indicator — calls openai-account edge function.
// OpenAI has no remaining-credits endpoint for sk- keys, so we surface
// month-to-date estimated spend + optional admin-key org cost.
function OpenAIUsageBadge({ hasKey, budgetUsd, warnAtPct }: { hasKey: boolean; budgetUsd?: number; warnAtPct?: number }) {
  const [info, setInfo] = useState<{
    valid: boolean;
    keyType: string;
    requests: number;
    totalTokens: number;
    estCostUsd: number;
    orgCostUsd: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasKey) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('openai-account');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to read usage');
      setInfo({
        valid: data.valid,
        keyType: data.key_type,
        requests: data.month_to_date?.requests ?? 0,
        totalTokens: data.month_to_date?.total_tokens ?? 0,
        estCostUsd: data.month_to_date?.estimated_cost_usd ?? 0,
        orgCostUsd: data.month_to_date?.org_cost_usd ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [hasKey]);

  if (!hasKey) return null;

  const effectiveCost = info?.orgCostUsd ?? info?.estCostUsd ?? 0;
  const budget = budgetUsd ?? 0;
  const pct = budget > 0 ? (effectiveCost / budget) * 100 : 0;
  const warnAt = warnAtPct ?? 80;
  const overWarn = budget > 0 && pct >= warnAt;
  const overBudget = budget > 0 && pct >= 100;

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${overBudget ? 'border-destructive/40 bg-destructive/5' : overWarn ? 'border-orange-400/40 bg-orange-50 dark:bg-orange-950/20' : 'bg-muted/30'}`}>
        <span className="text-muted-foreground">
          OpenAI usage (this month)
        </span>
        {info ? (
          <span className="font-medium tabular-nums">
            ${effectiveCost.toFixed(2)}
            {budget > 0 && <span className="text-muted-foreground"> / ${budget.toFixed(0)}</span>}
            <span className="text-muted-foreground ml-1">· {info.totalTokens.toLocaleString()} tok</span>
          </span>
        ) : error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={loading} onClick={load}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Check'}
          </Button>
        )}
      </div>
      {info && budget > 0 && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${overBudget ? 'bg-destructive' : overWarn ? 'bg-orange-500' : 'bg-primary'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
      {info && info.keyType === 'project' && (
        <p className="text-[10px] text-muted-foreground">
          Estimate from local logs. Add an admin key (sk-admin-…) to read real org spend.
        </p>
      )}
    </div>
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
            value={config?.model || 'gpt-4.1-mini'}
            onValueChange={(value) => handleChange({ model: value })}
          >
            <SelectTrigger id="openai-model" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4.1">GPT-4.1 (Best quality)</SelectItem>
              <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini (Recommended)</SelectItem>
              <SelectItem value="gpt-4.1-nano">GPT-4.1 Nano (Fast & cheap)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="openai-budget" className="text-xs">Monthly budget (USD)</Label>
            <Input
              id="openai-budget"
              type="number"
              min={0}
              step={5}
              value={config?.monthlyBudgetUsd ?? 50}
              onChange={(e) => handleChange({ monthlyBudgetUsd: Number(e.target.value) || 0 })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai-warn" className="text-xs">Warn at (%)</Label>
            <Input
              id="openai-warn"
              type="number"
              min={1}
              max={100}
              step={5}
              value={config?.warnAtPct ?? 80}
              onChange={(e) => handleChange({ warnAtPct: Number(e.target.value) || 80 })}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Soft guardrail. Shows a warning on the integration card when month-to-date spend
          passes the threshold. Does not block API calls.
        </p>
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
            value={config?.model || ''}
            onChange={(e) => handleChange({ model: e.target.value })}
            placeholder="e.g. llama3, mistral, qwen2.5"
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

  if (integrationKey === 'jina') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Prefer free tier</p>
            <p className="text-xs text-muted-foreground">
              Use keyless Jina first, fall back to API key on rate limits. Disable to always use your API key.
            </p>
          </div>
          <Switch
            checked={config?.preferFreeTier ?? true}
            onCheckedChange={(checked) => handleChange({ preferFreeTier: checked })}
          />
        </div>
      </div>
    );
  }

  if (integrationKey === 'hunter') {
    const maxContacts = config?.maxContacts ?? 2;
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="hunter-max" className="text-xs">Decision-makers per prospect</Label>
          <Select
            value={String(maxContacts)}
            onValueChange={(v) => handleChange({ maxContacts: parseInt(v, 10) })}
          >
            <SelectTrigger id="hunter-max" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 — minimum spend</SelectItem>
              <SelectItem value="2">2 — recommended (top decision-makers)</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10 — full domain dump</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Lower values save Hunter.io credits. Each contact returned counts as one search request.
          </p>
        </div>
      </div>
    );
  }

  if (integrationKey === 'searxng') {
    return (
      <div className="space-y-3 pt-3 border-t">
        <div className="space-y-2">
          <Label htmlFor="searxng-url" className="text-xs">Instance URL *</Label>
          <Input
            id="searxng-url"
            value={config?.url || ''}
            onChange={(e) => handleChange({ url: e.target.value })}
            placeholder="https://searx.example.com"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Base URL of your self-hosted SearXNG instance. Used as a free fallback (or primary) for web search.
            Make sure your instance has the JSON output format enabled in <code>settings.yml</code>.
          </p>
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
  const [openDrawerKey, setOpenDrawerKey] = useState<keyof IntegrationsSettings | null>(null);
  const [drawerConfig, setDrawerConfig] = useState<IntegrationProviderConfig | undefined>(undefined);

  const {
    data: secretsStatus,
    isLoading: secretsLoading,
    refetch: refetchSecrets,
    error: secretsError,
    isError: hasSecretsError,
  } = useIntegrationStatus();
  const { data: integrationSettings, isLoading: settingsLoading } = useIntegrations();
  const updateIntegrations = useUpdateIntegrations();
  const integrationModuleMap = useIntegrationModuleMap();

  const isLoading = secretsLoading || settingsLoading;
  const secretsErrorMessage = secretsError instanceof Error ? secretsError.message : 'Unknown backend error';

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

  const [search, setSearch] = useState("");

  const handleBulkToggle = (keys: (keyof IntegrationsSettings)[], enabled: boolean) => {
    if (keys.length === 0) return;
    const patch: Partial<IntegrationsSettings> = {};
    for (const k of keys) {
      patch[k] = { ...(integrationSettings?.[k] || defaultIntegrationsSettings[k]), enabled } as any;
    }
    updateIntegrations.mutate(patch);
  };

  const openDrawer = (key: keyof IntegrationsSettings, currentConfig: IntegrationProviderConfig | undefined) => {
    setOpenDrawerKey(key);
    setDrawerConfig(currentConfig);
  };

  const closeDrawer = () => {
    setOpenDrawerKey(null);
    setDrawerConfig(undefined);
  };

  const handleDrawerSave = async () => {
    if (!openDrawerKey) return;
    try {
      await updateIntegrations.mutateAsync({
        [openDrawerKey]: {
          ...(integrationSettings?.[openDrawerKey] || {}),
          config: drawerConfig,
        },
      });
      toast.success("Settings saved");
      closeDrawer();
    } catch {
      toast.error("Failed to save settings");
    }
  };

  const coreSecretsConfigured = secretsStatus?.core
    ? Object.values(secretsStatus.core).every(Boolean)
    : false;

  // Calculate active count — use shared resolver so we never drift from the hook logic
  const integrationKeys = Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[];
  let activeCount = 0;
  let configuredCount = 0;

  for (const key of integrationKeys) {
    const { hasKey, isActive } = resolveIntegrationStatus(
      key,
      secretsStatus?.integrations,
      integrationSettings,
    );
    if (hasKey) configuredCount++;
    if (isActive) activeCount++;
  }

  const getDisplayConfig = (key: keyof IntegrationsSettings) => {
    return integrationSettings?.[key]?.config;
  };

  // Group integrations by category (apply search filter)
  const sq = search.trim().toLowerCase();
  const groupedIntegrations = integrationKeys.reduce((acc, key) => {
    const integration = integrationSettings?.[key] || defaultIntegrationsSettings[key];
    if (sq) {
      const hay = `${key} ${integration.name ?? ''} ${integration.description ?? ''}`.toLowerCase();
      if (!hay.includes(sq)) return acc;
    }
    const category = integration.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push({ key, ...integration });
    return acc;
  }, {} as Record<string, Array<{ key: keyof IntegrationsSettings } & typeof defaultIntegrationsSettings[keyof typeof defaultIntegrationsSettings]>>);

  // Sort each category alphabetically by name
  Object.keys(groupedIntegrations).forEach((cat) => {
    groupedIntegrations[cat].sort((a, b) => a.name.localeCompare(b.name));
  });

  const visibleIntegrationKeys = Object.values(groupedIntegrations).flat().map(i => i.key);

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
        />
        {hasSecretsError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not verify backend secrets</AlertTitle>
            <AlertDescription>
              The secret check failed, so "No API key" can be misleading here. This points more to an auth/admin-role/JWT problem than a missing provider key.
              <span className="mt-2 block font-mono text-xs">{secretsErrorMessage}</span>
            </AlertDescription>
          </Alert>
        )}
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

        {/* Search + bulk actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search integrations by name, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkToggle(visibleIntegrationKeys, true)}
            disabled={updateIntegrations.isPending || visibleIntegrationKeys.length === 0}
          >
            Enable {search ? 'matching' : 'all'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkToggle(visibleIntegrationKeys, false)}
            disabled={updateIntegrations.isPending || visibleIntegrationKeys.length === 0}
          >
            Disable {search ? 'matching' : 'all'}
          </Button>
        </div>

        {/* Company Profile moved to Sales Intelligence module */}

        {/* Gmail Signal Integration (standalone card) */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Email Signals
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <GmailIntegrationCard />
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categoryIntegrations.map((integration) => {
                    const key = integration.key;
                    const requiresSecret = !CONFIG_BASED_KEYS.includes(key);
                    const IconComponent = iconMap[integration.icon as keyof typeof iconMap] || Bot;
                    const currentConfig = getDisplayConfig(key) || integration.config;
                    const hasConfigSection = ['openai', 'gemini', 'local_llm', 'n8n', 'resend', 'google_analytics', 'meta_pixel', 'slack', 'jina', 'hunter', 'searxng'].includes(key);
                    // Single source of truth — same resolver used by hooks + count loop
                    const { hasKey, isActive: isEnabled } = resolveIntegrationStatus(
                      key,
                      secretsStatus?.integrations,
                      integrationSettings,
                    );
                    const hasCredential = hasKey;
                    const statusUnavailable = hasSecretsError && requiresSecret;

                    return (
                      <Card
                        key={key}
                        className={`transition-all ${
                          isEnabled
                            ? "border-primary/30 bg-primary/5 shadow-sm"
                            : !hasKey
                            ? "border-dashed opacity-60"
                            : "border-border/50 bg-muted/20"
                        } ${hasConfigSection && hasKey && isEnabled ? "cursor-pointer hover:shadow-sm" : ""}`}
                        onClick={() => {
                          if (hasConfigSection && hasKey && isEnabled) openDrawer(key, currentConfig);
                        }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isEnabled ? "bg-primary/10" : "bg-muted"}`}>
                                <IconComponent className={`h-5 w-5 ${isEnabled ? "text-primary" : "text-muted-foreground"}`} />
                              </div>
                              <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                  {integration.name}
                                  {isLoading ? (
                                    <Skeleton className="h-5 w-20" />
                                  ) : (
                                    statusUnavailable
                                      ? getUnavailableBadge()
                                      : getCredentialBadge(hasCredential, requiresSecret)
                                  )}
                                </CardTitle>
                                <CardDescription>{integration.description}</CardDescription>
                              </div>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Switch
                                    checked={isEnabled}
                                    onCheckedChange={(checked) => handleToggle(key, checked)}
                                    disabled={!hasKey || updateIntegrations.isPending}
                                  />
                                </div>
                              </TooltipTrigger>
                              {(!hasKey || statusUnavailable) && (
                                <TooltipContent>
                                  <p>{statusUnavailable ? 'Could not verify secret status' : 'API key must be configured first'}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          {key === 'hunter' && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <HunterCreditsBadge hasKey={hasKey} />
                            </div>
                          )}
                          {key === 'firecrawl' && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <FirecrawlCreditsBadge hasKey={hasKey} />
                            </div>
                          )}
                          {key === 'openai' && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <OpenAIUsageBadge
                                hasKey={hasKey}
                                budgetUsd={currentConfig?.monthlyBudgetUsd}
                                warnAtPct={currentConfig?.warnAtPct}
                              />
                            </div>
                          )}
                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                            {(key === 'openai' || key === 'gemini' || key === 'anthropic') && (
                              <TestAIConnectionButton provider={key} hasKey={hasKey} isEnabled={isEnabled} />
                            )}
                            {(key === 'local_llm' || key === 'n8n') && (
                              <TestConfigConnectionButton provider={key} config={currentConfig} isEnabled={isEnabled} />
                            )}
                            <a
                              href={integration.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-auto"
                            >
                              {integration.docsLabel || 'Get API key'}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>

                          {/* CLI Command — only if not yet configured */}
                          {!hasKey && requiresSecret && !statusUnavailable && (
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono truncate">
                                supabase secrets set {integration.secretName}=...
                              </code>
                              <Button variant="ghost" size="sm" onClick={() => copyCommand(integration.secretName)}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
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

      {/* Integration Config Drawer */}
      {openDrawerKey && (() => {
        const integration = integrationSettings?.[openDrawerKey] || defaultIntegrationsSettings[openDrawerKey];
        const noSecretNeeded = ['local_llm', 'n8n', 'google_analytics', 'meta_pixel', 'slack'];
        const requiresSecret = !noSecretNeeded.includes(openDrawerKey);
        const drawerConfig = getDisplayConfig(openDrawerKey) || integration.config;
        const hasKey = requiresSecret
          ? (secretsStatus?.integrations?.[openDrawerKey] ?? false)
          : hasRealCredential(openDrawerKey, drawerConfig);
        const explicitlyDisabled = integrationSettings?.[openDrawerKey]?.enabled === false;
        const isEnabled = hasKey && !explicitlyDisabled;
        return (
          <Sheet open onOpenChange={(open) => { if (!open) closeDrawer(); }}>
            <SheetContent className="sm:max-w-md flex flex-col overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{integration.name}</SheetTitle>
                <SheetDescription>{integration.description}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 py-4">
                <IntegrationConfigPanel
                  integrationKey={openDrawerKey}
                  config={drawerConfig}
                  onConfigChange={setDrawerConfig}
                  hasKey={hasKey}
                  isEnabled={isEnabled}
                />
              </div>
              <SheetFooter className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={closeDrawer} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleDrawerSave}
                  disabled={updateIntegrations.isPending}
                  className="flex-1 gap-2"
                >
                  {updateIntegrations.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        );
      })()}
    </AdminLayout>
  );
}
