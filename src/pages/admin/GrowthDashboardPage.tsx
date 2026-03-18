import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatCard } from '@/components/admin/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGrowthDashboard } from '@/hooks/useGrowthDashboard';
import { DollarSign, Eye, MousePointerClick, TrendingUp, Target, BarChart3 } from 'lucide-react';

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency, minimumFractionDigits: 0 }).format(cents / 100);
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('sv-SE').format(n);
}

const platformColors: Record<string, string> = {
  meta: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  google: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  linkedin: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  draft: 'secondary',
  paused: 'outline',
  completed: 'secondary',
};

export default function GrowthDashboardPage() {
  const { data, isLoading } = useGrowthDashboard();
  const m = data?.metrics;
  const campaigns = data?.campaigns ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Growth Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only overview of paid growth performance across all campaigns.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Spend"
            value={m ? formatCurrency(m.totalSpendCents, m.currency) : null}
            icon={DollarSign}
            variant="primary"
            isLoading={isLoading}
            subtext={m ? `of ${formatCurrency(m.totalBudgetCents, m.currency)} budget` : undefined}
          />
          <StatCard
            label="Impressions"
            value={m ? formatNumber(m.totalImpressions) : null}
            icon={Eye}
            variant="default"
            isLoading={isLoading}
          />
          <StatCard
            label="CTR"
            value={m ? `${m.ctr.toFixed(2)}%` : null}
            icon={MousePointerClick}
            variant={m && m.ctr > 2 ? 'success' : m && m.ctr > 0.5 ? 'warning' : 'muted'}
            isLoading={isLoading}
            subtext={m ? `${formatNumber(m.totalClicks)} clicks` : undefined}
          />
          <StatCard
            label="Conversions"
            value={m ? formatNumber(m.totalConversions) : null}
            icon={Target}
            variant="success"
            isLoading={isLoading}
            subtext={m && m.totalClicks > 0 ? `CPC: ${m.cpc.toFixed(2)} ${m.currency}` : undefined}
          />
        </div>

        {/* Campaign Overview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Campaign Overview
              </CardTitle>
              {m && (
                <span className="text-xs text-muted-foreground">
                  {m.activeCampaigns} active / {m.totalCampaigns} total
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading campaigns…</p>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use FlowPilot to create your first ad campaign.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-6 py-2 font-medium">Campaign</th>
                      <th className="px-4 py-2 font-medium">Platform</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium text-right">Spend</th>
                      <th className="px-4 py-2 font-medium text-right">Impressions</th>
                      <th className="px-4 py-2 font-medium text-right">Clicks</th>
                      <th className="px-4 py-2 font-medium text-right">CTR</th>
                      <th className="px-4 py-2 font-medium text-right">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${platformColors[c.platform] ?? 'bg-muted text-muted-foreground'}`}>
                            {c.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant[c.status] ?? 'secondary'} className="text-xs capitalize">
                            {c.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(c.spentCents, c.currency)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatNumber(c.impressions)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatNumber(c.clicks)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.ctr.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatNumber(c.conversions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
