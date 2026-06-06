import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Activity, LogIn, LogOut, UserPlus, ShieldAlert, KeyRound, Monitor, Smartphone, Tablet, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AdminLayout } from '@/components/admin/AdminLayout';

interface AuthEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  country: string | null;
  city: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const EVENT_META: Record<string, { label: string; icon: any; color: string }> = {
  sign_in:        { label: 'Sign in',        icon: LogIn,       color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  sign_out:       { label: 'Sign out',       icon: LogOut,      color: 'text-slate-600 dark:text-slate-400 bg-slate-500/10' },
  sign_up:        { label: 'Sign up',        icon: UserPlus,    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  failed_login:   { label: 'Failed login',   icon: ShieldAlert, color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10' },
  password_reset: { label: 'Password reset', icon: KeyRound,    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  token_refreshed:{ label: 'Token refresh',  icon: Activity,    color: 'text-muted-foreground bg-muted' },
};

function DeviceIcon({ type }: { type: string | null }) {
  if (type === 'mobile') return <Smartphone className="h-3 w-3" />;
  if (type === 'tablet') return <Tablet className="h-3 w-3" />;
  return <Monitor className="h-3 w-3" />;
}

export default function LoginActivityPage() {
  const { data: events, isLoading } = useQuery({
    queryKey: ['auth-events'],
    queryFn: async (): Promise<AuthEvent[]> => {
      const { data, error } = await (supabase as any)
        .from('auth_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuthEvent[];
    },
    refetchInterval: 15_000,
  });

  const stats = (() => {
    if (!events) return { last24h: 0, failed24h: 0, uniqueUsers24h: 0, countries24h: 0 };
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = events.filter(e => new Date(e.created_at).getTime() >= cutoff);
    const signIns = recent.filter(e => e.event_type === 'sign_in');
    return {
      last24h: signIns.length,
      failed24h: recent.filter(e => e.event_type === 'failed_login').length,
      uniqueUsers24h: new Set(signIns.map(e => e.user_id).filter(Boolean)).size,
      countries24h: new Set(recent.map(e => e.country).filter(Boolean)).size,
    };
  })();

  return (
    <AdminLayout>
      <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Login activity</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Who logged in when, from where, and on what device.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Sign-ins (24h)" value={stats.last24h} />
        <StatCard label="Unique users (24h)" value={stats.uniqueUsers24h} />
        <StatCard label="Failed logins (24h)" value={stats.failed24h} accent={stats.failed24h > 0 ? 'rose' : undefined} />
        <StatCard label="Countries (24h)" value={stats.countries24h} />
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All events</TabsTrigger>
          <TabsTrigger value="sign_in">Sign-ins</TabsTrigger>
          <TabsTrigger value="failed_login">Failed</TabsTrigger>
        </TabsList>

        {(['all', 'sign_in', 'failed_login'] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <Card className="p-0 overflow-hidden">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <EventList events={(events ?? []).filter(e => tab === 'all' ? true : e.event_type === tab)} />
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      </div>
    </AdminLayout>
  );
}


function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'rose' }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent === 'rose' && value > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
        {value}
      </div>
    </Card>
  );
}

function EventList({ events }: { events: AuthEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-12 text-center">No events yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {events.map((e) => {
        const meta = EVENT_META[e.event_type] ?? { label: e.event_type, icon: Activity, color: 'text-muted-foreground bg-muted' };
        const Icon = meta.icon;
        const location = [e.city, e.country].filter(Boolean).join(', ');
        return (
          <li key={e.id} className="px-4 py-3 flex items-start gap-3 text-sm hover:bg-muted/40">
            <div className={`rounded-md p-1.5 ${meta.color}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{meta.label}</span>
                <span className="text-muted-foreground">·</span>
                <span className="truncate">{e.email ?? <span className="text-muted-foreground italic">unknown</span>}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1"><DeviceIcon type={e.device_type} />{e.browser ?? '?'}</span>
                {location && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{location}</span>}
                {e.ip_address && <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{e.ip_address}</code>}
                {e.event_type === 'failed_login' && e.metadata?.reason && (
                  <Badge variant="destructive" className="text-[10px]">{String(e.metadata.reason)}</Badge>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
