import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { CheckCircle2, XCircle, Clock, Activity, TrendingUp, Zap } from 'lucide-react';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { sv } from 'date-fns/locale';
import { WEBHOOK_EVENT_LABELS } from '@/hooks/useWebhooks';
import type { WebhookEvent } from '@/hooks/useWebhooks';

const COLORS = {
  success: 'hsl(var(--chart-2))',
  failure: 'hsl(var(--chart-1))',
  primary: 'hsl(var(--primary))',
};

export function WebhookStats() {
  // Fetch all webhook logs for the last 7 days
  const { data: logs, isLoading } = useQuery({
    queryKey: ['webhook-stats'],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch webhook counts
  const { data: webhooks } = useQuery({
    queryKey: ['webhooks-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhooks')
        .select('id, name, is_active, failure_count');
      
      if (error) throw error;
      return data;
    },
  });

  const stats = useMemo(() => {
    if (!logs) return null;

    const total = logs.length;
    const successful = logs.filter(l => l.success).length;
    const failed = total - successful;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
    
    const avgDuration = logs.length > 0
      ? Math.round(logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / logs.length)
      : 0;

    // Group by day
    const days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date()
    });

    const dailyData = days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      
      const dayLogs = logs.filter(l => {
        const logDate = new Date(l.created_at);
        return logDate >= dayStart && logDate < dayEnd;
      });

      return {
        date: format(day, 'EEE', { locale: sv }),
        fullDate: format(day, 'd MMM', { locale: sv }),
        success: dayLogs.filter(l => l.success).length,
        failed: dayLogs.filter(l => !l.success).length,
        total: dayLogs.length,
      };
    });

    // Group by event type
    const eventCounts: Record<string, { success: number; failed: number }> = {};
    logs.forEach(log => {
      if (!eventCounts[log.event]) {
        eventCounts[log.event] = { success: 0, failed: 0 };
      }
      if (log.success) {
        eventCounts[log.event].success++;
      } else {
        eventCounts[log.event].failed++;
      }
    });

    const eventData = Object.entries(eventCounts).map(([event, counts]) => ({
      name: WEBHOOK_EVENT_LABELS[event as WebhookEvent] || event,
      event,
      success: counts.success,
      failed: counts.failed,
      total: counts.success + counts.failed,
    })).sort((a, b) => b.total - a.total);

    // Pie chart data
    const pieData = [
      { name: 'Lyckade', value: successful, color: COLORS.success },
      { name: 'Misslyckade', value: failed, color: COLORS.failure },
    ].filter(d => d.value > 0);

    return {
      total,
      successful,
      failed,
      successRate,
      avgDuration,
      dailyData,
      eventData,
      pieData,
    };
  }, [logs]);

  const webhookSummary = useMemo(() => {
    if (!webhooks) return { total: 0, active: 0, disabled: 0, autoDisabled: 0 };
    
    return {
      total: webhooks.length,
      active: webhooks.filter(w => w.is_active).length,
      disabled: webhooks.filter(w => !w.is_active).length,
      autoDisabled: webhooks.filter(w => !w.is_active && (w.failure_count || 0) >= 5).length,
    };
  }, [webhooks]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Totalt leveranser</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Senaste 7 dagarna</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Lyckade</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.successful || 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.successRate || 0}% framgång</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Misslyckade</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.failed || 0}</div>
            <p className="text-xs text-muted-foreground">
              {webhookSummary.autoDisabled > 0 && `${webhookSummary.autoDisabled} auto-inaktiverade`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Svarstid</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.avgDuration || 0}ms</div>
            <p className="text-xs text-muted-foreground">Genomsnitt</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily Deliveries Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leveranser per dag</CardTitle>
            <CardDescription>Senaste 7 dagarna</CardDescription>
          </CardHeader>
          <CardContent>
            {stats && stats.dailyData.some(d => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        return payload[0].payload.fullDate;
                      }
                      return label;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="success" name="Lyckade" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Misslyckade" fill={COLORS.failure} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Ingen data att visa
              </div>
            )}
          </CardContent>
        </Card>

        {/* Success Rate Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Framgångsgrad</CardTitle>
            <CardDescription>Fördelning lyckade/misslyckade</CardDescription>
          </CardHeader>
          <CardContent>
            {stats && stats.pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stats.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Ingen data att visa
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Events Breakdown */}
      {stats && stats.eventData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leveranser per event-typ</CardTitle>
            <CardDescription>Fördelning av webhook-händelser</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, stats.eventData.length * 40)}>
              <BarChart data={stats.eventData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" allowDecimals={false} />
                <YAxis dataKey="name" type="category" className="text-xs" width={150} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="success" name="Lyckade" fill={COLORS.success} radius={[0, 4, 4, 0]} />
                <Bar dataKey="failed" name="Misslyckade" fill={COLORS.failure} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Webhook Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Webhook-översikt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{webhookSummary.total}</div>
              <div className="text-xs text-muted-foreground">Totalt</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{webhookSummary.active}</div>
              <div className="text-xs text-muted-foreground">Aktiva</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-muted-foreground">{webhookSummary.disabled}</div>
              <div className="text-xs text-muted-foreground">Inaktiva</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{webhookSummary.autoDisabled}</div>
              <div className="text-xs text-muted-foreground">Auto-inaktiverade</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}