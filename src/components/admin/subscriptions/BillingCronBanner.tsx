import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Clock, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * Transparency banner explaining that the platform auto-generates invoices
 * for invoice-billed (manual) subscriptions every night at 06:00 UTC.
 * Shows the last actual run time (from agent_events) so admins can trust it.
 */
export function BillingCronBanner() {
  const { data: lastRun } = useQuery({
    queryKey: ['subscription-billing-last-run'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_events')
        .select('created_at, payload')
        .eq('event_name', 'subscription.invoiced')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { created_at: string; payload: any } | null;
    },
    refetchInterval: 60_000,
  });

  const { data: dueCount } = useQuery({
    queryKey: ['subscription-billing-due-count'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('provider', 'manual')
        .eq('status', 'active')
        .lte('next_invoice_date', today);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  // Next run = next 06:00 UTC
  const now = new Date();
  const nextRun = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 6 ? 1 : 0),
    6, 0, 0,
  ));

  return (
    <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
      <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1 text-sm">
        <p className="font-medium">Automated invoice billing</p>
        <p className="text-muted-foreground">
          Every day at <strong>06:00 UTC</strong> the platform scans active invoice-billed
          subscriptions whose next invoice date is due and generates invoices automatically.
          Stripe-billed subscriptions are charged by Stripe and synced via webhook — they are
          not touched by this job.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground pt-1">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Next run {formatDistanceToNow(nextRun, { addSuffix: true })}
          </span>
          <span>
            Last run:{' '}
            {lastRun
              ? `${formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true })}`
              : 'no invoices generated yet'}
          </span>
          <span>
            {dueCount ?? 0} subscription{dueCount === 1 ? '' : 's'} queued for next run
          </span>
        </div>
      </div>
    </div>
  );
}
