import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { BANK_FEED_PROVIDERS } from '@/lib/reconciliation/bank-feed-providers';
import { useBankFeedConnections } from '@/hooks/useReconciliationParity';

/**
 * Bank feed connections view. Live ingestion today is via CSV/CAMT/MT940/OFX/SIE
 * file import and Stripe payout sync. Aggregators (Plaid/Tink/GoCardless) are
 * scaffolded with a "Coming soon" button — the interface + table are in place
 * so an adapter can be dropped in when credentials are provisioned.
 */
export function BankFeedsPanel() {
  const { data: connections = [] } = useBankFeedConnections();

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank connectivity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {BANK_FEED_PROVIDERS.map((p) => {
              const conn = connections.find((c) => c.provider === p.id);
              return (
                <div key={p.id} className="rounded-lg border p-4 space-y-2 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{p.label}</div>
                      <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                    </div>
                    <Badge variant={p.status === 'live' ? 'secondary' : 'outline'} className="text-xs">
                      {p.status === 'live' ? 'Live' : 'Scaffold'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {conn?.last_sync_at
                        ? `Last sync ${format(new Date(conn.last_sync_at), 'yyyy-MM-dd HH:mm')}`
                        : 'No syncs yet'}
                    </span>
                    {p.status === 'scaffold' ? (
                      <Button size="sm" variant="outline" disabled>
                        Connect (coming soon)
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-xs">Managed above</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Live aggregator feeds (Plaid, Tink, GoCardless) require paid provider credentials.
            The adapter interface in <span className="font-mono">src/lib/reconciliation/bank-feed-providers.ts</span>{' '}
            documents how to plug one in when you're ready to enable it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
