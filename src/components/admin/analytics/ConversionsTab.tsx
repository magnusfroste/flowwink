import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

type GoalKind = 'lead' | 'booking' | 'order' | 'quote_accepted' | 'subscription' | 'page_reached';

const KIND_LABEL: Record<GoalKind, string> = {
  lead: 'A new lead',
  booking: 'A booking',
  order: 'A paid order',
  quote_accepted: 'An accepted quote',
  subscription: 'A subscription',
  page_reached: 'A page is reached',
};

interface Goal {
  goal_id: string;
  name: string;
  kind: GoalKind;
  page_slug: string | null;
  completions: number;
  value_cents: number | null;
  value_source: string | null;
  conversion_rate_pct: number | null;
  by_source: Array<{ source: string; medium: string; campaign: string; completions: number }>;
  by_landing_page: Array<{ page: string; completions: number }>;
}

interface PageRow {
  page: string;
  views: number;
  unique_visitors: number;
  leads: number;
  customers: number;
  revenue_cents: number;
}

/**
 * Conversions: what counts as one, how many there were, and which page brought
 * them. An assumed value is labelled as assumed — it is not revenue. With no
 * traffic in the window the rates are absent rather than zero: nothing was
 * measured, because the tracker runs in the visitor's browser.
 */
export function ConversionsTab({ days }: { days: number }) {
  const qc = useQueryClient();
  const { formatCurrency, formatNumber } = usePlatformFormat();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GoalKind>('lead');
  const [pageSlug, setPageSlug] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const reportKey = ['conversion-report', days];
  const { data: report, isLoading } = useQuery({
    queryKey: reportKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('conversion_report' as never, { p_days: days } as never);
      if (error) throw error;
      return data as unknown as { goals: Goal[]; unique_visitors: number; note: string | null };
    },
  });

  const { data: pages } = useQuery({
    queryKey: ['page-conversion-report', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('page_conversion_report' as never, { p_days: days } as never);
      if (error) throw error;
      return (data as unknown as { pages: PageRow[] }).pages ?? [];
    },
  });

  const call = async (args: Record<string, unknown>, done: string) => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('manage_conversion_goal' as never, args as never);
      if (error) throw error;
      const answer = data as { success?: boolean; error?: string } | null;
      if (!answer?.success) throw new Error(answer?.error ?? 'The goal could not be saved');
      toast.success(done);
      await qc.invalidateQueries({ queryKey: reportKey });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addGoal = async () => {
    const ok = await call({
      p_action: 'create', p_name: name, p_kind: kind,
      p_page_slug: kind === 'page_reached' ? pageSlug : null,
      p_value_cents: value ? Math.round(Number(value) * 100) : null,
    }, 'Goal added');
    if (ok) { setName(''); setPageSlug(''); setValue(''); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Goals</CardTitle>
          <CardDescription>
            What counts as a conversion here, and how often it happened. A rate is completions per unique visitor in the period.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (report?.goals.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No goals yet — add one below.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Goal</TableHead>
                  <TableHead>Counts</TableHead>
                  <TableHead className="text-right">Completions</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Top campaign</TableHead>
                  <TableHead>Top page</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {report!.goals.map((g) => (
                  <TableRow key={g.goal_id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {KIND_LABEL[g.kind]}{g.page_slug ? `: /${g.page_slug}` : ''}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(g.completions)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.conversion_rate_pct != null ? `${g.conversion_rate_pct} %` : <span className="text-muted-foreground">not measured</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.value_cents != null ? (
                        <>
                          {formatCurrency(g.value_cents)}
                          {g.value_source?.startsWith('assumed') && (
                            <Badge variant="outline" className="ml-2 text-[10px]">assumed</Badge>
                          )}
                        </>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.by_source[0] ? `${g.by_source[0].source} · ${g.by_source[0].completions}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.by_landing_page[0] ? `${g.by_landing_page[0].page} · ${g.by_landing_page[0].completions}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={saving}
                        onClick={() => call({ p_action: 'update', p_goal_id: g.goal_id, p_is_active: false }, 'Goal retired')}>
                        Retire
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-2 border-t border-border pt-4 md:grid-cols-[1.4fr_1.2fr_1fr_0.8fr_auto]">
            <div>
              <Label htmlFor="goal-name" className="text-xs">New goal</Label>
              <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Demo requests" />
            </div>
            <div>
              <Label htmlFor="goal-kind" className="text-xs">Counts</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as GoalKind)}>
                <SelectTrigger id="goal-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as GoalKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="goal-page" className="text-xs">Page</Label>
              <Input id="goal-page" value={pageSlug} disabled={kind !== 'page_reached'}
                onChange={(e) => setPageSlug(e.target.value)} placeholder="tack" />
            </div>
            <div>
              <Label htmlFor="goal-value" className="text-xs">Worth</Label>
              <Input id="goal-value" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="5000" />
            </div>
            <Button className="self-end" onClick={addGoal}
              disabled={saving || !name.trim() || (kind === 'page_reached' && !pageSlug.trim())}>
              Add goal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Orders, accepted quotes and subscriptions report the real amount. For the others, "worth" is what you say one is worth — it is shown as assumed, never as revenue.
            {report?.note ? ` ${report.note}` : ''}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Which page gave the lead</CardTitle>
          <CardDescription>
            A page is credited with a lead when that lead browsed it. A lead that read several pages counts for each of them, so the revenue column does not add up to total revenue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pages ? (
            <Skeleton className="h-32 w-full" />
          ) : pages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No page views in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Visitors</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Revenue of those leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((p) => (
                  <TableRow key={p.page}>
                    <TableCell className="font-medium">/{p.page}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.views)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.unique_visitors)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.customers)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.revenue_cents ? formatCurrency(p.revenue_cents) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
