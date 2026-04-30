import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  UserSearch,
  Building2,
  Mail,
  Phone,
  Sparkles,
  TrendingUp,
  Wallet,
  AlertCircle,
  Receipt,
  ShoppingCart,
  Briefcase,
  FileText as FileQuote,
  Ticket,
  CalendarDays,
  RefreshCw,
  MessageCircle,
  Video,
  CheckSquare,
  Activity,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCustomer360, type Customer360TimelineEvent } from '@/hooks/useCustomer360';
import { RecordDiscussPanel } from '@/components/admin/crm/RecordDiscussPanel';

const KIND_ICON: Record<Customer360TimelineEvent['kind'], typeof Activity> = {
  lead_created: Sparkles,
  lead_activity: Activity,
  deal: Briefcase,
  order: ShoppingCart,
  invoice: Receipt,
  quote: FileQuote,
  ticket: Ticket,
  booking: CalendarDays,
  subscription: RefreshCw,
  chat: MessageCircle,
  webinar: Video,
  task: CheckSquare,
};

const KIND_COLOR: Record<Customer360TimelineEvent['kind'], string> = {
  lead_created: 'text-primary bg-primary/10',
  lead_activity: 'text-muted-foreground bg-muted',
  deal: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  order: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
  invoice: 'text-blue-600 bg-blue-500/10 dark:text-blue-400',
  quote: 'text-purple-600 bg-purple-500/10 dark:text-purple-400',
  ticket: 'text-rose-600 bg-rose-500/10 dark:text-rose-400',
  booking: 'text-cyan-600 bg-cyan-500/10 dark:text-cyan-400',
  subscription: 'text-indigo-600 bg-indigo-500/10 dark:text-indigo-400',
  chat: 'text-muted-foreground bg-muted',
  webinar: 'text-pink-600 bg-pink-500/10 dark:text-pink-400',
  task: 'text-muted-foreground bg-muted',
};

function formatMoney(n: number | undefined | null) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Customer360Page() {
  const { identifier } = useParams<{ identifier?: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [emailInput, setEmailInput] = useState('');

  // Identifier can be lead UUID or an email address (URL-encoded).
  const param = useMemo(() => {
    if (!identifier) return null;
    const decoded = decodeURIComponent(identifier);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) {
      return { leadId: decoded };
    }
    if (decoded.includes('@')) return { email: decoded };
    return null;
  }, [identifier]);

  // Fallback: ?email= or ?lead_id= query params.
  const queryParam = useMemo(() => {
    const q: { leadId?: string; email?: string } = {};
    const e = search.get('email');
    const l = search.get('lead_id');
    if (e) q.email = e;
    if (l) q.leadId = l;
    return Object.keys(q).length ? q : null;
  }, [search]);

  const params = param ?? queryParam ?? {};
  const { data, isLoading, error } = useCustomer360(params);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const v = emailInput.trim().toLowerCase();
    if (!v) return;
    navigate(`/admin/customer/${encodeURIComponent(v)}`);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <UserSearch className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customer 360</h1>
            <p className="text-sm text-muted-foreground">
              Every signal, deal, order, invoice, ticket, booking and conversation in one place.
            </p>
          </div>
        </div>

        <form onSubmit={handleLookup} className="flex gap-2 max-w-xl">
          <Input
            type="email"
            placeholder="Look up by email — e.g. anna@example.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
          />
          <Button type="submit">Open</Button>
        </form>

        {!params.leadId && !params.email && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Enter an email above, or open Customer 360 from a lead, order or contact.
            </CardContent>
          </Card>
        )}

        {(params.leadId || params.email) && isLoading && (
          <Card>
            <CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading 360° view…
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="py-6 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {(error as Error).message}
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            {/* Identity card */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">
                      {data.identity.name || data.identity.email || 'Unknown contact'}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                      {data.identity.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          {data.identity.email}
                        </span>
                      )}
                      {data.identity.phone && (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" />
                          {data.identity.phone}
                        </span>
                      )}
                      {data.identity.company && (
                        <span className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          {data.identity.company.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {data.identity.status && (
                      <Badge variant="secondary" className="capitalize">
                        {data.identity.status}
                      </Badge>
                    )}
                    {typeof data.identity.score === 'number' && (
                      <Badge variant="outline">Score {data.identity.score}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              {data.identity.ai_summary && (
                <CardContent className="text-sm text-muted-foreground border-t pt-4">
                  <span className="font-medium text-foreground">AI summary: </span>
                  {data.identity.ai_summary}
                </CardContent>
              )}
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={TrendingUp}
                label="Lifetime value"
                value={formatMoney(data.kpis.lifetime_value)}
                tone="text-emerald-600 dark:text-emerald-400"
              />
              <KpiCard
                icon={Briefcase}
                label="Open deals"
                value={formatMoney(data.kpis.open_deals_value)}
                tone="text-amber-600 dark:text-amber-400"
              />
              <KpiCard
                icon={Wallet}
                label="Open invoices"
                value={formatMoney(data.kpis.open_invoices_value)}
                tone="text-blue-600 dark:text-blue-400"
              />
              <KpiCard
                icon={Ticket}
                label="Open tickets"
                value={String(data.kpis.open_tickets)}
                tone="text-rose-600 dark:text-rose-400"
              />
            </div>

            {/* Counts row */}
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.counts)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => (
                      <Badge key={k} variant="secondary" className="gap-1.5 capitalize">
                        {k}
                        <span className="text-muted-foreground">·</span>
                        <span>{n}</span>
                      </Badge>
                    ))}
                  {Object.values(data.counts).every((n) => n === 0) && (
                    <span className="text-sm text-muted-foreground">No related records yet.</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Discuss composer — log notes/calls/emails/meetings inline */}
            <RecordDiscussPanel
              leadId={data.identity.lead_id ?? undefined}
              email={data.identity.email ?? undefined}
              hideTimeline
            />

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Timeline
                  <span className="text-sm font-normal text-muted-foreground">
                    ({data.timeline.length} events)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.timeline.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    No activity recorded yet.
                  </div>
                ) : (
                  <ol className="relative border-l border-border/60 ml-3 space-y-4">
                    {data.timeline.map((ev) => {
                      const Icon = KIND_ICON[ev.kind];
                      return (
                        <li key={ev.id} className="ml-6">
                          <span
                            className={`absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background ${
                              KIND_COLOR[ev.kind]
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{ev.title}</span>
                                {ev.status && (
                                  <Badge variant="outline" className="capitalize text-xs">
                                    {ev.status}
                                  </Badge>
                                )}
                                {typeof ev.amount === 'number' && (
                                  <span className="text-sm text-muted-foreground">
                                    {formatMoney(ev.amount)}
                                  </span>
                                )}
                              </div>
                              {ev.subtitle && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {ev.subtitle}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(ev.ts)}
                              </p>
                            </div>
                            {ev.href && (
                              <Button asChild variant="ghost" size="sm">
                                <a href={ev.href} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${tone}`} />
          {label}
        </div>
        <div className="text-xl font-semibold mt-1.5">{value}</div>
      </CardContent>
    </Card>
  );
}
