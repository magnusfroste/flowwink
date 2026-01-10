import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  AlertCircle,
  PauseCircle,
  Settings,
} from "lucide-react";
import {
  useIntegrations,
  useUpdateIntegrations,
  INTEGRATION_CATEGORIES,
  defaultIntegrationsSettings,
  type IntegrationsSettings,
} from "@/hooks/useIntegrations";
import { useIntegrationStatus } from "@/hooks/useIntegrationStatus";

// Icon mapping
const iconMap = {
  CreditCard,
  Mail,
  Bot,
  Image,
  Flame,
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

export default function IntegrationsStatusPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: secretsStatus, isLoading: secretsLoading, refetch: refetchSecrets } = useIntegrationStatus();
  const { data: integrationSettings, isLoading: settingsLoading } = useIntegrations();
  const updateIntegrations = useUpdateIntegrations();

  const isLoading = secretsLoading || settingsLoading;

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

  const handleToggle = (key: keyof IntegrationsSettings, enabled: boolean) => {
    updateIntegrations.mutate({
      [key]: { enabled },
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
      <AdminPageHeader
        title="Integrations"
        description="Manage external service integrations"
      />

      <div className="space-y-6">
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
                    const hasKey = secretsStatus?.integrations?.[key] ?? false;
                    const isEnabled = integrationSettings?.[key]?.enabled ?? false;
                    const status: IntegrationStatus = !hasKey ? 'not_configured' : isEnabled ? 'active' : 'disabled';
                    const IconComponent = iconMap[integration.icon as keyof typeof iconMap] || Bot;

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
                              <a
                                href={integration.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                {integration.docsLabel || 'Get API key'}
                                <ExternalLink className="h-3 w-3" />
                              </a>

                              {integration.settingsUrl && hasKey && (
                                <>
                                  <span className="text-muted-foreground">•</span>
                                  <Link
                                    to={integration.settingsUrl}
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <Settings className="h-3 w-3" />
                                    Settings
                                  </Link>
                                </>
                              )}
                            </div>

                            {/* CLI Command (only if not configured) */}
                            {!hasKey && (
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
                  href="https://github.com/your-repo/pezcms/blob/main/docs/SETUP.md"
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
      </div>
    </AdminLayout>
  );
}
