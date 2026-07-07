import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Eye } from 'lucide-react';
import {
  useLoyaltyAccounts, useLoyaltyAccount, useLoyaltyMutation, type LoyaltyAccount,
} from '@/hooks/useLoyalty';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';

function tierVariant(tier: string) {
  if (tier === 'gold') return 'default';
  if (tier === 'silver') return 'secondary';
  return 'outline';
}

export function LoyaltyTab() {
  const { data: accounts, isLoading } = useLoyaltyAccounts();
  const mut = useLoyaltyMutation();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const [viewEmail, setViewEmail] = useState<string | null>(null);
  const { data: viewData } = useLoyaltyAccount(viewEmail);

  const [adjust, setAdjust] = useState<{ email: string; points: string; note: string } | null>(null);
  const [redeem, setRedeem] = useState<{ email: string; points: string; note: string } | null>(null);

  async function submitEnroll() {
    try {
      await mut.mutateAsync({ action: 'enroll', customer_email: email, customer_name: name || undefined });
      setEnrollOpen(false);
      setEmail(''); setName('');
    } catch (e) { logger.error('enroll', e); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Loyalty program</CardTitle>
          <Button size="sm" onClick={() => setEnrollOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Enroll customer
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Enrolled customers auto-earn 1 point per 10 kr on sales rung with their email.
          </p>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No loyalty accounts yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Lifetime</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a: LoyaltyAccount) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.customer_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{a.customer_email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tierVariant(a.tier) as any} className="capitalize">{a.tier}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{a.points_balance}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{a.lifetime_points}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewEmail(a.customer_email)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => setAdjust({ email: a.customer_email ?? '', points: '', note: '' })}>
                        Adjust
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => setRedeem({ email: a.customer_email ?? '', points: '', note: '' })}>
                        Redeem
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Enroll */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll customer</DialogTitle>
            <DialogDescription>New loyalty account starts at bronze tier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Name (optional)</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button onClick={submitEnroll} disabled={!email || mut.isPending}>Enroll</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View account + transactions */}
      <Dialog open={!!viewEmail} onOpenChange={(o) => { if (!o) setViewEmail(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{viewEmail}</DialogTitle></DialogHeader>
          {viewData ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">Balance</div>
                  <div className="text-xl font-bold">{(viewData as any).account?.points_balance ?? '—'}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">Lifetime</div>
                  <div className="text-xl font-bold">{(viewData as any).account?.lifetime_points ?? '—'}</div>
                </div>
                <div className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">Tier</div>
                  <div className="text-xl font-bold capitalize">{(viewData as any).account?.tier ?? '—'}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1">Recent transactions</div>
                <div className="border rounded max-h-60 overflow-y-auto divide-y">
                  {((viewData as any).transactions ?? []).map((t: any) => (
                    <div key={t.id} className="flex justify-between p-2 text-xs">
                      <div>
                        <div className="capitalize">{t.kind}</div>
                        <div className="text-muted-foreground">{format(new Date(t.created_at), 'PPp')}</div>
                        {t.note && <div className="text-muted-foreground">{t.note}</div>}
                      </div>
                      <div className={`font-mono ${t.points >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {t.points > 0 ? '+' : ''}{t.points}
                      </div>
                    </div>
                  ))}
                  {(!((viewData as any).transactions) || (viewData as any).transactions.length === 0) && (
                    <div className="p-3 text-xs text-muted-foreground text-center">No transactions.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust */}
      <Dialog open={!!adjust} onOpenChange={(o) => { if (!o) setAdjust(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust points</DialogTitle>
            <DialogDescription>Positive to add, negative to remove.</DialogDescription>
          </DialogHeader>
          {adjust && (
            <div className="space-y-3">
              <div><Label>Points (signed)</Label><Input type="number" value={adjust.points}
                onChange={(e) => setAdjust({ ...adjust, points: e.target.value })} /></div>
              <div><Label>Note</Label><Input value={adjust.note}
                onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button>
            <Button
              disabled={!adjust?.points || mut.isPending}
              onClick={async () => {
                if (!adjust) return;
                try {
                  await mut.mutateAsync({
                    action: 'adjust', customer_email: adjust.email,
                    points: Number(adjust.points), note: adjust.note || undefined,
                  });
                  setAdjust(null);
                } catch (e) { logger.error('adjust', e); }
              }}
            >Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem */}
      <Dialog open={!!redeem} onOpenChange={(o) => { if (!o) setRedeem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem points</DialogTitle>
            <DialogDescription>Deducts points from the balance.</DialogDescription>
          </DialogHeader>
          {redeem && (
            <div className="space-y-3">
              <div><Label>Points to redeem</Label><Input type="number" value={redeem.points}
                onChange={(e) => setRedeem({ ...redeem, points: e.target.value })} /></div>
              <div><Label>Note</Label><Input value={redeem.note}
                onChange={(e) => setRedeem({ ...redeem, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRedeem(null)}>Cancel</Button>
            <Button
              disabled={!redeem?.points || mut.isPending}
              onClick={async () => {
                if (!redeem) return;
                try {
                  await mut.mutateAsync({
                    action: 'redeem', customer_email: redeem.email,
                    points: Math.abs(Number(redeem.points)), note: redeem.note || undefined,
                  });
                  setRedeem(null);
                } catch (e) { logger.error('redeem', e); }
              }}
            >Redeem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
