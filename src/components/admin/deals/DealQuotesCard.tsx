import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus } from 'lucide-react';
import { useQuotesByDeal } from '@/hooks/useQuotesByDeal';
import { CreateQuoteDialog } from '@/components/admin/quotes/CreateQuoteDialog';
import type { QuoteStatus } from '@/hooks/useQuotes';

interface Props {
  dealId: string;
  leadId: string | null;
}

const STATUS_VARIANT: Record<QuoteStatus, 'secondary' | 'default' | 'outline' | 'destructive'> = {
  draft: 'outline',
  sent: 'secondary',
  accepted: 'default',
  rejected: 'destructive',
  expired: 'destructive',
};

export function DealQuotesCard({ dealId, leadId }: Props) {
  const { data: quotes = [], isLoading } = useQuotesByDeal(dealId);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Quotes
            {quotes.length > 0 && (
              <span className="text-muted-foreground font-normal">({quotes.length})</span>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            disabled={!leadId}
            title={!leadId ? 'Link a lead to this deal first' : 'Create a quote for this deal'}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Quote
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quotes yet. {leadId ? 'Create one to send the customer a formal proposal.' : 'Link a lead to enable quotes.'}
            </p>
          ) : (
            quotes.map((q) => {
              const total = new Intl.NumberFormat('sv-SE', {
                style: 'currency',
                currency: q.currency || 'SEK',
                minimumFractionDigits: 0,
              }).format((q.total_cents || 0) / 100);
              return (
                <Link
                  key={q.id}
                  to={`/admin/quotes?id=${q.id}`}
                  className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{q.quote_number}</span>
                    <Badge variant={STATUS_VARIANT[q.status] ?? 'outline'} className="capitalize">
                      {q.status}
                    </Badge>
                  </div>
                  <span className="font-medium">{total}</span>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      {leadId && (
        <CreateQuoteDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialLeadId={leadId}
          initialDealId={dealId}
          lockLead
        />
      )}
    </>
  );
}
