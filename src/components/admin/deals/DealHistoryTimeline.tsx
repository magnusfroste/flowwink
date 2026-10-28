import { useDealHistory } from '@/hooks/useDealsParity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { History } from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { liveFormat } from '@/lib/live-format';

const FIELD_LABELS: Record<string, string> = {
  stage: 'Stage',
  stage_id: 'Stage',
  value_cents: 'Value',
  currency: 'Currency',
  lead_id: 'Contact',
  product_id: 'Product',
  team_id: 'Team',
  owner_id: 'Owner',
  expected_close: 'Expected close',
  notes: 'Notes',
  lost_reason: 'Lost reason',
};

function fmtValue(field: string, v: string | null): string {
  if (v == null) return '—';
  if (field === 'value_cents') {
    const cents = Number(v);
    if (Number.isFinite(cents)) return liveFormat().formatCurrency(cents);
  }
  if (v.length > 60) return v.slice(0, 60) + '…';
  return v;
}

export function DealHistoryTimeline({ dealId }: { dealId: string }) {
  const { formatDateTime } = usePlatformFormat();
  const { data: entries = [], isLoading } = useDealHistory(dealId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4" />
          Change history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ol className="relative border-l border-border pl-4 space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="absolute -left-1.5 h-3 w-3 rounded-full bg-primary/60" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {FIELD_LABELS[e.field] || e.field}
                  </Badge>
                  <span className="text-muted-foreground line-through">{fmtValue(e.field, e.old_value)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{fmtValue(e.field, e.new_value)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(e.changed_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
