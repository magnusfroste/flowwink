import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  useAnalyticsSummary,
  useLeadsBySource,
  useLeadsByStatus,
  useDealsByStage,
  useNewsletterPerformance,
  useTimeSeriesData,
  useMonthlyComparison,
} from '@/hooks/useAnalytics';
import {
  Users,
  Briefcase,
  Mail,
  FileText,
  TrendingUp,
  TrendingDown,
  Inbox,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

const SOURCE_LABELS: Record<string, string> = {
  form: 'Formulär',
  newsletter: 'Newsletter',
  chat: 'Chat',
  manual: 'Manuell',
  import: 'Import',
  unknown: 'Okänd',
};

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  opportunity: 'Möjlighet',
  customer: 'Kund',
  lost: 'Förlorad',
};

const STAGE_LABELS: Record<string, string> = {
  proposal: 'Offert',
  negotiation: 'Förhandling',
  closed_won: 'Vunnen',
  closed_lost: 'Förlorad',
};

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  description,
  change,
  isLoading,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  change?: number;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span>{Math.abs(change)}% från förra månaden</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: leadsBySource, isLoading: sourceLoading } = useLeadsBySource();
  const { data: leadsByStatus } = useLeadsByStatus();
  const { data: dealsByStage, isLoading: stageLoading } = useDealsByStage();
  const { data: newsletters, isLoading: newsletterLoading } = useNewsletterPerformance();
  const { data: timeSeries, isLoading: timeSeriesLoading } = useTimeSeriesData(30);
  const { data: comparison } = useMonthlyComparison();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Analytics"
          description="Översikt över leads, deals, newsletter och innehåll"
        />

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Totalt Leads"
            value={summary?.totalLeads || 0}
            icon={Users}
            change={comparison?.leads.change}
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="Pipeline-värde"
            value={formatCurrency(summary?.dealsPipelineValue || 0)}
            icon={Briefcase}
            description={`${summary?.totalDeals || 0} aktiva deals`}
            change={comparison?.dealValue.change}
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="Newsletter-prenumeranter"
            value={summary?.newsletterSubscribers || 0}
            icon={Mail}
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="Formulärinskick"
            value={summary?.formSubmissions || 0}
            icon={Inbox}
            isLoading={summaryLoading}
          />
        </div>

        {/* Content Stats */}
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCard
            title="Publicerade sidor"
            value={summary?.publishedPages || 0}
            icon={FileText}
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="Publicerade inlägg"
            value={summary?.publishedPosts || 0}
            icon={BookOpen}
            isLoading={summaryLoading}
          />
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Time Series Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Leads & Formulär (30 dagar)</CardTitle>
              <CardDescription>Daglig utveckling av nya leads och formulärinskick</CardDescription>
            </CardHeader>
            <CardContent>
              {timeSeriesLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={timeSeries}>
                    <defs>
                      <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorForms" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="leads"
                      name="Leads"
                      stroke="hsl(var(--primary))"
                      fillOpacity={1}
                      fill="url(#colorLeads)"
                    />
                    <Area
                      type="monotone"
                      dataKey="formSubmissions"
                      name="Formulär"
                      stroke="hsl(var(--chart-2))"
                      fillOpacity={1}
                      fill="url(#colorForms)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Leads by Source */}
          <Card>
            <CardHeader>
              <CardTitle>Leads per källa</CardTitle>
              <CardDescription>Fördelning av leads efter ursprung</CardDescription>
            </CardHeader>
            <CardContent>
              {sourceLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : leadsBySource && leadsBySource.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={leadsBySource.map(item => ({
                        ...item,
                        name: SOURCE_LABELS[item.source] || item.source,
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {leadsBySource.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Ingen data tillgänglig
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deals by Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Deals per steg</CardTitle>
              <CardDescription>Pipeline-fördelning och värde</CardDescription>
            </CardHeader>
            <CardContent>
              {stageLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : dealsByStage && dealsByStage.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={dealsByStage.map(item => ({
                      ...item,
                      name: STAGE_LABELS[item.stage] || item.stage,
                      valueFormatted: item.value / 100,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === 'count' ? value : formatCurrency(value * 100),
                        name === 'count' ? 'Antal' : 'Värde',
                      ]}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="count" name="Antal" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Ingen data tillgänglig
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Newsletter Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Newsletter-prestanda</CardTitle>
            <CardDescription>Senaste utskick och deras resultat</CardDescription>
          </CardHeader>
          <CardContent>
            {newsletterLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : newsletters && newsletters.length > 0 ? (
              <div className="space-y-4">
                {newsletters.map(newsletter => {
                  const openRate = newsletter.sent_count > 0
                    ? ((newsletter.unique_opens / newsletter.sent_count) * 100).toFixed(1)
                    : '0';
                  const clickRate = newsletter.sent_count > 0
                    ? ((newsletter.unique_clicks / newsletter.sent_count) * 100).toFixed(1)
                    : '0';

                  return (
                    <div
                      key={newsletter.id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{newsletter.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {newsletter.sent_at
                            ? new Date(newsletter.sent_at).toLocaleDateString('sv-SE')
                            : 'Ej skickat'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {newsletter.sent_count} skickade
                        </Badge>
                        <Badge variant="outline" className="text-green-600 border-green-600/30">
                          {openRate}% öppnade
                        </Badge>
                        <Badge variant="outline" className="text-blue-600 border-blue-600/30">
                          {clickRate}% klickade
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Inga skickade nyhetsbrev ännu
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lead Status Distribution */}
        {leadsByStatus && leadsByStatus.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Lead-status</CardTitle>
              <CardDescription>Fördelning av leads i pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {leadsByStatus.map(item => (
                  <div key={item.status} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: COLORS[
                          ['lead', 'opportunity', 'customer', 'lost'].indexOf(item.status) % COLORS.length
                        ],
                      }}
                    />
                    <span className="text-sm">
                      {STATUS_LABELS[item.status] || item.status}: <strong>{item.count}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
