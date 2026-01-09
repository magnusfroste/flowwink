import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";

interface SecretsStatus {
  core: {
    supabase_url: boolean;
    supabase_anon_key: boolean;
    supabase_service_role_key: boolean;
  };
  integrations: {
    resend: boolean;
    stripe: boolean;
    stripe_webhook: boolean;
    unsplash: boolean;
    firecrawl: boolean;
    openai: boolean;
    gemini: boolean;
  };
}

interface IntegrationConfig {
  key: keyof SecretsStatus["integrations"];
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  features: string[];
  secretName: string;
  docsUrl?: string;
}

const integrations: IntegrationConfig[] = [
  {
    key: "resend",
    name: "Resend",
    description: "Email delivery service",
    icon: Mail,
    features: ["Newsletter", "Order confirmations", "Booking confirmations"],
    secretName: "RESEND_API_KEY",
    docsUrl: "https://resend.com/docs/introduction",
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Payment processing",
    icon: CreditCard,
    features: ["E-commerce", "Checkout", "Subscriptions"],
    secretName: "STRIPE_SECRET_KEY",
    docsUrl: "https://stripe.com/docs/keys",
  },
  {
    key: "stripe_webhook",
    name: "Stripe Webhook",
    description: "Payment event notifications",
    icon: CreditCard,
    features: ["Order status updates", "Payment confirmations"],
    secretName: "STRIPE_WEBHOOK_SECRET",
    docsUrl: "https://stripe.com/docs/webhooks",
  },
  {
    key: "unsplash",
    name: "Unsplash",
    description: "Stock photo integration",
    icon: Image,
    features: ["Image picker in editor"],
    secretName: "UNSPLASH_ACCESS_KEY",
    docsUrl: "https://unsplash.com/developers",
  },
  {
    key: "firecrawl",
    name: "Firecrawl",
    description: "Web scraping and analysis",
    icon: Flame,
    features: ["Brand analyzer", "Company enrichment"],
    secretName: "FIRECRAWL_API_KEY",
    docsUrl: "https://firecrawl.dev/docs",
  },
  {
    key: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o-mini",
    icon: Bot,
    features: ["AI Chat", "Text generation", "Content migration", "Company enrichment"],
    secretName: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    key: "gemini",
    name: "Google Gemini",
    description: "Gemini 2.0, 1.5 Pro",
    icon: Bot,
    features: ["AI Chat", "Text generation", "Content migration", "Company enrichment"],
    secretName: "GEMINI_API_KEY",
    docsUrl: "https://aistudio.google.com/apikey",
  },
];

export default function IntegrationsStatusPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: status, isLoading, error, refetch } = useQuery({
    queryKey: ["secrets-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<SecretsStatus>("check-secrets");
      if (error) throw error;
      return data;
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success("Status updated");
  };

  const copyCommand = (secretName: string) => {
    const command = `supabase secrets set ${secretName}=your_api_key_here`;
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  const coreSecretsConfigured = status?.core
    ? Object.values(status.core).every(Boolean)
    : false;

  const configuredCount = status?.integrations
    ? Object.values(status.integrations).filter(Boolean).length
    : 0;

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Integrations"
        description="Status and configuration for external services"
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
                  <CardDescription>Core Supabase configuration</CardDescription>
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
                <Skeleton className="h-6 w-24" />
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Failed to check status</span>
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
                      Missing core secrets - check your Supabase configuration
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrations Overview */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Integrations</h2>
            <p className="text-sm text-muted-foreground">
              {configuredCount} of {integrations.length} configured
            </p>
          </div>
        </div>

        {/* Integration Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map((integration) => {
            const isConfigured = status?.integrations?.[integration.key] ?? false;
            const Icon = integration.icon;

            return (
              <Card key={integration.key} className={!isConfigured ? "border-dashed" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isConfigured ? "bg-primary/10" : "bg-muted"}`}>
                        <Icon className={`h-5 w-5 ${isConfigured ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {integration.name}
                          {isLoading ? (
                            <Skeleton className="h-5 w-20" />
                          ) : (
                            <Badge variant={isConfigured ? "default" : "secondary"}>
                              {isConfigured ? "Configured" : "Not configured"}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>{integration.description}</CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
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

                  {!isConfigured && (
                    <div className="pt-2 border-t space-y-2">
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
                      {integration.docsUrl && (
                        <a
                          href={integration.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Get API key
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

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
                  href="https://github.com/your-repo/flowwink/blob/main/docs/SETUP.md"
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
