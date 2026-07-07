import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRenderReceipt } from '@/hooks/usePOS';
import { Printer } from 'lucide-react';

interface Props {
  saleId: string | null;
  onClose: () => void;
}

const fmt = (c: number, cur = 'SEK') =>
  `${(c / 100).toFixed(2)} ${cur}`;

export function ReceiptDialog({ saleId, onClose }: Props) {
  const { data, isLoading } = useRenderReceipt(saleId ?? undefined);
  const r: any = data ?? {};
  const site = r.site_branding ?? r.site_general ?? {};
  const currency = r.currency ?? 'SEK';

  return (
    <Dialog open={!!saleId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receipt {r.receipt_number ?? ''}</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading receipt…</div>
        ) : (
          <div id="pos-receipt-print" className="font-mono text-xs space-y-2 border rounded p-4 bg-background">
            <div className="text-center space-y-1">
              {site.logo_url && <img src={site.logo_url} alt="" className="h-10 mx-auto" />}
              <div className="text-sm font-semibold">{site.site_name ?? site.name ?? r.register_name ?? 'Receipt'}</div>
              {r.register_name && site.site_name && (
                <div className="text-[10px] text-muted-foreground">{r.register_name}</div>
              )}
              {r.header && <div className="whitespace-pre-wrap text-[11px] pt-1">{r.header}</div>}
            </div>

            <hr />
            <div className="text-[10px] text-muted-foreground">
              {r.created_at && new Date(r.created_at).toLocaleString()}
              {r.refund_of && <span className="ml-2 font-semibold">REFUND</span>}
            </div>

            <div className="space-y-1">
              {(r.lines ?? []).map((l: any, i: number) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{Number(l.quantity)} × {l.product_name}</span>
                  <span>{fmt(l.line_total_cents ?? 0, currency)}</span>
                </div>
              ))}
            </div>

            <hr />
            <div className="flex justify-between"><span>Subtotal</span><span>{fmt(r.subtotal_cents ?? 0, currency)}</span></div>
            {r.discount_cents ? <div className="flex justify-between"><span>Discount</span><span>-{fmt(r.discount_cents, currency)}</span></div> : null}
            <div className="flex justify-between"><span>Tax</span><span>{fmt(r.tax_cents ?? 0, currency)}</span></div>
            {r.tip_cents ? <div className="flex justify-between"><span>Tip</span><span>{fmt(r.tip_cents, currency)}</span></div> : null}
            <div className="flex justify-between font-bold text-sm border-t pt-1"><span>Total</span><span>{fmt((r.total_cents ?? 0) + (r.tip_cents ?? 0), currency)}</span></div>

            <hr />
            <div className="space-y-0.5">
              {(r.payments ?? []).map((p: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span className="capitalize">{p.method}</span>
                  <span>{fmt(p.amount_cents, currency)}</span>
                </div>
              ))}
            </div>

            {r.footer && <div className="whitespace-pre-wrap text-[11px] text-center pt-2 border-t">{r.footer}</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
