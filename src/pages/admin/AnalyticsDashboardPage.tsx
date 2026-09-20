import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTabParam } from '@/hooks/useTabParam';
import { ConversionsTab } from '@/components/admin/analytics/ConversionsTab';
import {
  useAnalyticsSummary,
  useLeadsBySource,
  useLeadsByStatus,
  useDealsByStage,
  useNewsletterPerformance,
  useTimeSeriesData,
  useMonthlyComparison,
  usePageViewsByPage,
  usePageViewsTimeSeries,
  useVisitorsByCountry,
} from '@/hooks/useAnalytics';
import { useBookingStats } from '@/hooks/useBookings';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import {
  Users,
  Briefcase,
  Mail,
  FileText,
  Inbox,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  Settings,
  BarChart3,
  Eye,
  TrendingUp,
  Globe,
  ExternalLink,
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
  form: 'Form',
  newsletter: 'Newsletter',
  chat: 'Chat',
  manual: 'Manual',
  import: 'Import',
  unknown: 'Unknown',
};

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  opportunity: 'Opportunity',
  customer: 'Customer',
  lost: 'Lost',
};

const STAGE_LABELS: Record<string, string> = {
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
} as const;

/**
 * Compact KPI tile — the analytics page shows many numbers at once, so each one
 * gets a hairline cell in a single strip rather than its own tall card.
 */
function KpiTile({
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
    <div className="p-4 border-b border-r last:border-r-0 sm:border-b-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{title}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-20 mt-2" />
      ) : (
        <>
          <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
          <div className="min-h-4">
            {change !== undefined ? (
              <span
                className={`inline-flex items-center gap-1 text-xs ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(change)}% vs last month
              </span>
            ) : (
              description && <span className="text-xs text-muted-foreground">{description}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ChartEmpty({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{title}</p>
        {hint && <p className="text-xs mt-1 max-w-xs">{hint}</p>}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-16 text-center">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">No active data sources</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          Enable modules like Leads, Deals or Newsletter to see statistics and insights here.
        </p>
        <Button asChild>
          <Link to="/admin/settings/modules">
            <Settings className="h-4 w-4 mr-2" />
            Manage modules
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ModulePrompt({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-8 text-center">
        <Icon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/settings/modules">{title}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboardPage() {
  const { formatCurrency, formatNumber, formatDateTime } = usePlatformFormat();
  const [tab, setTab] = useTabParam('overview');
  const [days, setDays] = useTabParam('30', 'days');
  const period = Number(days) || 30;

  // Module states
  const leadsEnabled = useIsModuleEnabled('leads');
  const dealsEnabled = useIsModuleEnabled('deals');
  const newsletterEnabled = useIsModuleEnabled('newsletter');
  const formsEnabled = useIsModuleEnabled('forms');
  const blogEnabled = useIsModuleEnabled('blog');
  const bookingsEnabled = useIsModuleEnabled('bookings');

  const hasActiveModules = leadsEnabled || dealsEnabled || newsletterEnabled || formsEnabled || bookingsEnabled;

  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: leadsBySource, isLoading: sourceLoading } = useLeadsBySource();
  const { data: leadsByStatus } = useLeadsByStatus();
  const { data: dealsByStage, isLoading: stageLoading } = useDealsByStage();
  const { data: newsletters, isLoading: newsletterLoading } = useNewsletterPerformance();
  const { data: timeSeries, isLoading: timeSeriesLoading } = useTimeSeriesData(period);
  const { data: comparison } = useMonthlyComparison();
  const { data: bookingStats, isLoading: bookingsLoading } = useBookingStats();
  const { data: topPages, isLoading: topPagesLoading } = usePageViewsByPage(10);
  const { data: pageViewsTimeSeries, isLoading: pageViewsTimeSeriesLoading } = usePageViewsTimeSeries(period);
  const { data: visitorsByCountry, isLoading: countryLoading } = useVisitorsByCountry(10);

  const kpis = [
    {
      title: 'Page views',
      value: formatNumber(summary?.totalPageViews || 0),
      icon: Eye,
      description: `${formatNumber(summary?.uniqueVisitors || 0)} unique visitors`,
    },
    leadsEnabled && {
      title: 'Leads',
      value: formatNumber(summary?.totalLeads || 0),
      icon: Users,
      change: comparison?.leads.change,
    },
    dealsEnabled && {
      title: 'Pipeline value',
      value: formatCurrency(summary?.dealsPipelineValue || 0, undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
      icon: Briefcase,
      description: `${summary?.totalDeals || 0} active deals`,
      change: comparison?.dealValue.change,
    },
    newsletterEnabled && {
      title: 'Subscribers',
      value: formatNumber(summary?.newsletterSubscribers || 0),
      icon: Mail,
    },
    formsEnabled && {
      title: 'Form submissions',
      value: formatNumber(summary?.formSubmissions || 0),
      icon: Inbox,
    },
    bookingsEnabled && {
      title: 'Bookings this month',
      value: formatNumber(bookingStats?.total || 0),
      icon: CalendarDays,
      description: `${bookingStats?.upcoming || 0} upcoming`,
    },
  ].filter(Boolean) as Array<{
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    description?: string;
    change?: number;
  }>;

  const trafficChart = pageViewsTimeSeriesLoading ? (
    <Skeleton className="h-[250px] w-full" />
  ) : pageViewsTimeSeries && pageViewsTimeSeries.some((d) => d.views > 0) ? (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={pageViewsTimeSeries}>
        <defs>
          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
        <Area
          type="monotone"
          dataKey="views"
          name="Views"
          stroke="hsl(var(--chart-3))"
          fillOpacity={1}
          fill="url(#colorViews)"
        />
        <Area
          type="monotone"
          dataKey="unique_visitors"
          name="Unique visitors"
          stroke="hsl(var(--chart-4))"
          fillOpacity={0.4}
          fill="hsl(var(--chart-4))"
        />
      </AreaChart>
    </ResponsiveContainer>
  ) : (
    <ChartEmpty
      icon={Eye}
      title="No traffic data yet"
      hint="Page views are recorded when visitors view your published pages."
    />
  );

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Analytics"
          description="Traffic, pipeline and marketing performance in one place"
        >
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to="/admin/growth/attribution">
              <ExternalLink className="h-4 w-4 mr-2" />
              Attribution
            </Link>
          </Button>
        </AdminPageHeader>

        {!hasActiveModules && <EmptyState />}

        {/* KPI strip */}
        <Card className="overflow-hidden">
          <div
            className={`grid grid-cols-2 ${kpis.length >= 5 ? 'lg:grid-cols-5' : kpis.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} divide-border`}
          >
            {kpis.map((k) => (
              <KpiTile
                key={k.title}
                title={k.title}
                value={k.value}
                icon={k.icon}
                description={k.description}
                change={k.change}
                isLoading={summaryLoading || bookingsLoading}
              />
            ))}
          </div>
        </Card>

        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="traffic">Traffic</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
            <TabsTrigger value="marketing">Marketing</TabsTrigger>
          </TabsList>

          {/* ---------- Overview ---------- */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  Traffic ({period} days)
                </CardTitle>
                <CardDescription>Daily views and unique visitors</CardDescription>
              </CardHeader>
              <CardContent>{trafficChart}</CardContent>
            </Card>

            {(leadsEnabled || formsEnabled) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {leadsEnabled && formsEnabled
                      ? `Leads & forms (${period} days)`
                      : leadsEnabled
                        ? `Leads (${period} days)`
                        : `Forms (${period} days)`}
                  </CardTitle>
                  <CardDescription>Daily conversion trend</CardDescription>
                </CardHeader>
                <CardContent>
                  {timeSeriesLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
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
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend />
                        {leadsEnabled && (
                          <Area
                            type="monotone"
                            dataKey="leads"
                            name="Leads"
                            stroke="hsl(var(--primary))"
                            fillOpacity={1}
                            fill="url(#colorLeads)"
                          />
                        )}
                        {formsEnabled && (
                          <Area
                            type="monotone"
                            dataKey="formSubmissions"
                            name="Forms"
                            stroke="hsl(var(--chart-2))"
                            fillOpacity={1}
                            fill="url(#colorForms)"
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <KpiCardLike title="Published pages" value={summary?.publishedPages || 0} icon={FileText} loading={summaryLoading} />
              {blogEnabled && (
                <KpiCardLike title="Published posts" value={summary?.publishedPosts || 0} icon={BookOpen} loading={summaryLoading} />
              )}
              <KpiCardLike
                title="Unique visitors"
                value={summary?.uniqueVisitors || 0}
                icon={Users}
                loading={summaryLoading}
              />
            </div>
          </TabsContent>

          {/* ---------- Traffic ---------- */}
          <TabsContent value="traffic" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  Page views ({period} days)
                </CardTitle>
                <CardDescription>Daily traffic and unique visitors</CardDescription>
              </CardHeader>
              <CardContent>{trafficChart}</CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Eye className="h-4 w-4" />
                    Most popular pages
                  </CardTitle>
                  <CardDescription>Top 10 most visited pages</CardDescription>
                </CardHeader>
                <CardContent>
                  {topPagesLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : topPages && topPages.length > 0 ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto">
                      {topPages.map((page, index) => (
                        <div key={page.page_slug} className="flex items-center gap-3">
                          <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{page.page_title || page.page_slug}</p>
                            <p className="text-xs text-muted-foreground truncate">/{page.page_slug}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium tabular-nums">{formatNumber(page.views)}</p>
                            <p className="text-xs text-muted-foreground">{page.unique_visitors} unique</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ChartEmpty icon={Eye} title="No page views yet" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4" />
                    Visitors by country
                  </CardTitle>
                  <CardDescription>Geographic distribution of traffic</CardDescription>
                </CardHeader>
                <CardContent>
                  {countryLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : visitorsByCountry &&
                    visitorsByCountry.length > 0 &&
                    visitorsByCountry.some((c) => c.country !== 'Unknown') ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto">
                      {visitorsByCountry.map((country, index) => (
                        <div key={country.country} className="flex items-center gap-3">
                          <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{country.country}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium tabular-nums">{formatNumber(country.views)}</p>
                            <p className="text-xs text-muted-foreground">{country.unique_visitors} unique</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ChartEmpty
                      icon={Globe}
                      title="No geographic data yet"
                      hint="Country data is collected from visitor IPs."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---------- Pipeline ---------- */}
          <TabsContent value="pipeline" className="space-y-6 mt-4">
            <div className="grid gap-6 lg:grid-cols-2">
              {leadsEnabled ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Leads by source</CardTitle>
                    <CardDescription>Distribution of leads by origin</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {sourceLoading ? (
                      <Skeleton className="h-[250px] w-full" />
                    ) : leadsBySource && leadsBySource.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={leadsBySource.map((item) => ({
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
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <ChartEmpty icon={Users} title="No lead data yet" />
                    )}
                  </CardContent>
                </Card>
              ) : (
                <ModulePrompt
                  icon={Users}
                  title="Enable Leads"
                  description="Enable the Leads module to see source distribution"
                />
              )}

              {dealsEnabled ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Deals by stage</CardTitle>
                    <CardDescription>Pipeline distribution and value</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {stageLoading ? (
                      <Skeleton className="h-[250px] w-full" />
                    ) : dealsByStage && dealsByStage.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart
                          data={dealsByStage.map((item) => ({
                            ...item,
                            name: STAGE_LABELS[item.stage] || item.stage,
                            valueFormatted: item.value / 100,
                          }))}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={100}
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              name === 'count'
                                ? value
                                : formatCurrency(value * 100, undefined, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  }),
                              name === 'count' ? 'Count' : 'Value',
                            ]}
                            contentStyle={TOOLTIP_STYLE}
                          />
                          <Bar dataKey="count" name="Count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ChartEmpty icon={Briefcase} title="No deal data yet" />
                    )}
                  </CardContent>
                </Card>
              ) : (
                <ModulePrompt
                  icon={Briefcase}
                  title="Enable Deals"
                  description="Enable the Deals module to see pipeline statistics"
                />
              )}
            </div>

            {leadsEnabled && leadsByStatus && leadsByStatus.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lead status</CardTitle>
                  <CardDescription>Distribution of leads in pipeline</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    {leadsByStatus.map((item) => (
                      <div key={item.status} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor:
                              COLORS[
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
          </TabsContent>

          {/* ---------- Marketing ---------- */}
          <TabsContent value="conversions" className="space-y-6 mt-4">
            <ConversionsTab days={period} />
          </TabsContent>

          <TabsContent value="marketing" className="space-y-6 mt-4">
            {newsletterEnabled ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Newsletter performance</CardTitle>
                  <CardDescription>Recent campaigns and their results</CardDescription>
                </CardHeader>
                <CardContent>
                  {newsletterLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : newsletters && newsletters.length > 0 ? (
                    <div className="space-y-3">
                      {newsletters.map((newsletter) => {
                        const openRate =
                          newsletter.sent_count > 0
                            ? ((newsletter.unique_opens / newsletter.sent_count) * 100).toFixed(1)
                            : '0';
                        const clickRate =
                          newsletter.sent_count > 0
                            ? ((newsletter.unique_clicks / newsletter.sent_count) * 100).toFixed(1)
                            : '0';

                        return (
                          <div
                            key={newsletter.id}
                            className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{newsletter.subject}</p>
                              <p className="text-sm text-muted-foreground">
                                {newsletter.sent_at ? formatDateTime(newsletter.sent_at) : 'Not sent'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary">{newsletter.sent_count} sent</Badge>
                              <Badge variant="outline" className="text-green-600 border-green-600/30">
                                {openRate}% opened
                              </Badge>
                              <Badge variant="outline" className="text-blue-600 border-blue-600/30">
                                {clickRate}% clicked
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">No newsletters sent yet</div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <ModulePrompt
                icon={Mail}
                title="Enable Newsletter"
                description="Enable the Newsletter module to track campaign performance"
              />
            )}

            {bookingsEnabled && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bookings</CardTitle>
                  <CardDescription>Overview for this month</CardDescription>
                </CardHeader>
                <CardContent>
                  {bookingsLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        { label: 'Total', value: bookingStats?.total || 0, cls: 'bg-muted/50' },
                        { label: 'Pending', value: bookingStats?.pending || 0, cls: 'bg-yellow-500/10 text-yellow-600' },
                        { label: 'Confirmed', value: bookingStats?.confirmed || 0, cls: 'bg-green-500/10 text-green-600' },
                        { label: 'Completed', value: bookingStats?.completed || 0, cls: 'bg-blue-500/10 text-blue-600' },
                        { label: 'Upcoming', value: bookingStats?.upcoming || 0, cls: 'bg-primary/10 text-primary' },
                      ].map((s) => (
                        <div key={s.label} className={`text-center p-4 rounded-lg ${s.cls}`}>
                          <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function KpiCardLike({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16 mt-2" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
