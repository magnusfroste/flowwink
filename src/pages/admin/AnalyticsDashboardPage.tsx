import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useAnalyticsSummary,
  useLeadsBySource,
  useLeadsByStatus,
  useDealsByStage,
  useNewsletterPerformance,
  useTimeSeriesData,
  useMonthlyComparison,
} from '@/hooks/useAnalytics';
import { useBookingStats } from '@/hooks/useBookings';
import { useIsModuleEnabled } from '@/hooks/useModules';
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

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-16 text-center">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">Inga aktiva datakällor</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          Aktivera moduler som Leads, Deals eller Newsletter för att se statistik och insikter här.
        </p>
        <Button asChild>
          <Link to="/admin/settings/modules">
            <Settings className="h-4 w-4 mr-2" />
            Hantera moduler
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ModulePrompt({ 
  icon: Icon, 
  title, 
  description 
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
  // Module states
  const leadsEnabled = useIsModuleEnabled('leads');
  const dealsEnabled = useIsModuleEnabled('deals');
  const newsletterEnabled = useIsModuleEnabled('newsletter');
  const formsEnabled = useIsModuleEnabled('forms');
  const blogEnabled = useIsModuleEnabled('blog');
  const bookingsEnabled = useIsModuleEnabled('bookings');
  
  // Check if any data modules are enabled
  const hasActiveModules = leadsEnabled || dealsEnabled || newsletterEnabled || formsEnabled || bookingsEnabled;

  // Data hooks - only fetch if module is enabled
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: leadsBySource, isLoading: sourceLoading } = useLeadsBySource();
  const { data: leadsByStatus } = useLeadsByStatus();
  const { data: dealsByStage, isLoading: stageLoading } = useDealsByStage();
  const { data: newsletters, isLoading: newsletterLoading } = useNewsletterPerformance();
  const { data: timeSeries, isLoading: timeSeriesLoading } = useTimeSeriesData(30);
  const { data: comparison } = useMonthlyComparison();
  const { data: bookingStats, isLoading: bookingsLoading } = useBookingStats();

  // Build dynamic summary cards
  const summaryCards = [
    leadsEnabled && {
      title: 'Totalt Leads',
      value: summary?.totalLeads || 0,
      icon: Users,
      change: comparison?.leads.change,
    },
    dealsEnabled && {
      title: 'Pipeline-värde',
      value: formatCurrency(summary?.dealsPipelineValue || 0),
      icon: Briefcase,
      description: `${summary?.totalDeals || 0} aktiva deals`,
      change: comparison?.dealValue.change,
    },
    newsletterEnabled && {
      title: 'Newsletter-prenumeranter',
      value: summary?.newsletterSubscribers || 0,
      icon: Mail,
    },
    formsEnabled && {
      title: 'Formulärinskick',
      value: summary?.formSubmissions || 0,
      icon: Inbox,
    },
    bookingsEnabled && {
      title: 'Bokningar denna månad',
      value: bookingStats?.total || 0,
      icon: CalendarDays,
      description: `${bookingStats?.upcoming || 0} kommande`,
    },
  ].filter(Boolean) as Array<{
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    description?: string;
    change?: number;
  }>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Analytics"
          description="Översikt över leads, deals, newsletter och innehåll"
        />

        {/* Empty State if no modules */}
        {!hasActiveModules && <EmptyState />}

        {/* Summary Cards - Dynamic based on enabled modules */}
        {summaryCards.length > 0 && (
          <div className={`grid gap-4 md:grid-cols-2 ${summaryCards.length >= 4 ? 'lg:grid-cols-4' : summaryCards.length === 3 ? 'lg:grid-cols-3' : ''}`}>
            {summaryCards.map((card) => (
              <SummaryCard
                key={card.title}
                title={card.title}
                value={card.value}
                icon={card.icon}
                description={card.description}
                change={card.change}
                isLoading={summaryLoading || bookingsLoading}
              />
            ))}
          </div>
        )}

        {/* Content Stats - always show if pages module is enabled */}
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCard
            title="Publicerade sidor"
            value={summary?.publishedPages || 0}
            icon={FileText}
            isLoading={summaryLoading}
          />
          {blogEnabled && (
            <SummaryCard
              title="Publicerade inlägg"
              value={summary?.publishedPosts || 0}
              icon={BookOpen}
              isLoading={summaryLoading}
            />
          )}
        </div>

        {/* Charts Row - Only show if leads or forms enabled */}
        {(leadsEnabled || formsEnabled) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Time Series Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>
                  {leadsEnabled && formsEnabled 
                    ? 'Leads & Formulär (30 dagar)' 
                    : leadsEnabled 
                      ? 'Leads (30 dagar)' 
                      : 'Formulär (30 dagar)'}
                </CardTitle>
                <CardDescription>Daglig utveckling</CardDescription>
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
                          name="Formulär"
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

            {/* Leads by Source */}
            {leadsEnabled ? (
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
            ) : (
              <ModulePrompt 
                icon={Users} 
                title="Aktivera Leads" 
                description="Aktivera Leads-modulen för att se fördelning per källa" 
              />
            )}

            {/* Deals by Stage */}
            {dealsEnabled ? (
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
            ) : (
              <ModulePrompt 
                icon={Briefcase} 
                title="Aktivera Deals" 
                description="Aktivera Deals-modulen för att se pipeline-statistik" 
              />
            )}
          </div>
        )}

        {/* Bookings Stats - Only if bookings enabled */}
        {bookingsEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Bokningar</CardTitle>
              <CardDescription>Översikt för denna månad</CardDescription>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{bookingStats?.total || 0}</p>
                    <p className="text-xs text-muted-foreground">Totalt</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-yellow-500/10">
                    <p className="text-2xl font-bold text-yellow-600">{bookingStats?.pending || 0}</p>
                    <p className="text-xs text-muted-foreground">Väntande</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-green-500/10">
                    <p className="text-2xl font-bold text-green-600">{bookingStats?.confirmed || 0}</p>
                    <p className="text-xs text-muted-foreground">Bekräftade</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-blue-500/10">
                    <p className="text-2xl font-bold text-blue-600">{bookingStats?.completed || 0}</p>
                    <p className="text-xs text-muted-foreground">Slutförda</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-primary/10">
                    <p className="text-2xl font-bold text-primary">{bookingStats?.upcoming || 0}</p>
                    <p className="text-xs text-muted-foreground">Kommande</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Newsletter Performance - Only if newsletter enabled */}
        {newsletterEnabled ? (
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
        ) : null}

        {/* Lead Status Distribution - Only if leads enabled */}
        {leadsEnabled && leadsByStatus && leadsByStatus.length > 0 && (
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
