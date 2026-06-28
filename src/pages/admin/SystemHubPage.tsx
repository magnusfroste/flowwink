import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useSystemAiSettings,
  useUpdateSystemAiSettings,
  SystemAiSettings,
} from '@/hooks/useSiteSettings';
import { useIntegrationStatus } from '@/hooks/useIntegrationStatus';
import { SystemAiSettingsTab } from '@/components/admin/SystemAiSettingsTab';
import { DemoModeCard } from '@/components/admin/DemoModeCard';
import { ResetSiteDialog } from '@/components/admin/ResetSiteDialog';
import {
  Loader2, Save, Server, Copy, Check, Sparkles, AlertTriangle, Trash2,
  Database, FlaskConical, Activity, FlaskRound, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react';
import { ObservabilityTab } from '@/components/admin/system/ObservabilityTab';
import { toast } from 'sonner';


function CoreBackendStatusCard() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    data: secretsStatus,
    isLoading,
    refetch,
    error: secretsError,
    isError: hasSecretsError,
  } = useIntegrationStatus();
  const secretsErrorMessage = secretsError instanceof Error ? secretsError.message : 'Unknown backend error';
  const coreSecretsConfigured = secretsStatus?.core
    ? Object.values(secretsStatus.core).every(Boolean)
    : false;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success('Status updated');
  };

  return (
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
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasSecretsError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not verify backend secrets</AlertTitle>
            <AlertDescription>
              The secret check failed, so status values here can be misleading. This points more to an auth/admin-role/JWT problem than a missing provider key.
              <span className="mt-2 block font-mono text-xs">{secretsErrorMessage}</span>
            </AlertDescription>
          </Alert>
        )}
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
                <span className="text-sm text-muted-foreground">All core secrets configured</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive">Missing core secrets</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnvironmentInfoCard() {
  const [copied, setCopied] = useState<string | null>(null);

  const envVars = [
    { key: 'VITE_SUPABASE_URL', value: import.meta.env.VITE_SUPABASE_URL || '—' },
    { key: 'VITE_SUPABASE_PROJECT_ID', value: import.meta.env.VITE_SUPABASE_PROJECT_ID || '—' },
    {
      key: 'VITE_SUPABASE_PUBLISHABLE_KEY',
      value: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
        ? `${(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string).slice(0, 20)}…`
        : '—',
    },
  ];

  const handleCopy = (key: string, value: string) => {
    const fullValue =
      key === 'VITE_SUPABASE_PUBLISHABLE_KEY'
        ? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string)
        : value;
    navigator.clipboard.writeText(fullValue || '');
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <Server className="h-5 w-5" />
          Environment
        </CardTitle>
        <CardDescription>Configured environment variables for this instance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {envVars.map(({ key, value }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50 border"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{key}</p>
                <p className="text-sm font-mono truncate">{value}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => handleCopy(key, value)}
              >
                {copied === key ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLinksCard() {
  const links = [
    { name: 'Migration Audit', href: '/admin/migration-audit', icon: Database, desc: 'Schema migrations history & checksums' },
    { name: 'Platform Tests', href: '/admin/platform-tests', icon: FlaskConical, desc: 'End-to-end autonomy & regression tests' },
    { name: 'Integrations', href: '/admin/integrations', icon: Activity, desc: 'Third-party services & API keys' },
    { name: 'Developer Tools', href: '/admin/developer', icon: FlaskRound, desc: 'Skills, MCP, edge function registry' },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">System tools</CardTitle>
        <CardDescription>Related platform-level pages</CardDescription>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        {links.map((l) => (
          <Link
            key={l.href}
            to={l.href}
            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <l.icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.desc}</p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export default function SystemHubPage() {
  const { data: systemAiSettings, isLoading } = useSystemAiSettings();
  const updateSystemAi = useUpdateSystemAiSettings();
  const [systemAiData, setSystemAiData] = useState<SystemAiSettings | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    if (systemAiSettings) setSystemAiData(systemAiSettings);
  }, [systemAiSettings]);

  const hasChanges =
    systemAiData && systemAiSettings &&
    JSON.stringify(systemAiData) !== JSON.stringify(systemAiSettings);

  const handleSaveAi = async () => {
    if (!systemAiData) return;
    try {
      await updateSystemAi.mutateAsync(systemAiData);
      toast.success('AI configuration saved');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save');
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="System"
          description="Platform-level configuration, health and operations"
        />

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="observability">Observability</TabsTrigger>
            <TabsTrigger value="ai">AI Configuration</TabsTrigger>
            <TabsTrigger value="demo">Demo &amp; Seeding</TabsTrigger>
            <TabsTrigger value="danger">Danger Zone</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <CoreBackendStatusCard />
            <EnvironmentInfoCard />
            <QuickLinksCard />
          </TabsContent>

          <TabsContent value="observability" className="space-y-6">
            <ObservabilityTab />
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={handleSaveAi} disabled={!hasChanges || updateSystemAi.isPending}>
                {updateSystemAi.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save AI configuration
              </Button>
            </div>
            {isLoading || !systemAiData ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <SystemAiSettingsTab data={systemAiData} onChange={setSystemAiData} />
            )}
          </TabsContent>

          <TabsContent value="demo" className="space-y-6">
            <DemoModeCard />
          </TabsContent>

          <TabsContent value="danger" className="space-y-6">
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="font-serif text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>Irreversible actions that affect this instance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div>
                    <h4 className="font-medium">Reset Site</h4>
                    <p className="text-sm text-muted-foreground">
                      Delete all content, CRM data, media files, and reset settings to defaults.
                    </p>
                  </div>
                  <Button variant="destructive" onClick={() => setShowResetDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Reset Site
                  </Button>
                </div>
              </CardContent>
            </Card>
            <ResetSiteDialog open={showResetDialog} onOpenChange={setShowResetDialog} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
