import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Search, Ban, Copy, Check } from 'lucide-react';
import {
  useGiftCards,
  useIssueGiftCard,
  useDeactivateGiftCard,
  lookupGiftCard,
  type GiftCard,
} from '@/hooks/useGiftCards';
import { toast } from 'sonner';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { homeCurrency } from '@/lib/platform-fallbacks';

const toCents = (s: string): number => {
  const n = Number(s.trim().replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) : 0;
};

export function GiftCardsTab() {
  const { formatCurrency, formatDate } = usePlatformFormat();
  const { data: cards = [], isLoading } = useGiftCards();
  const issue = useIssueGiftCard();
  const deactivate = useDeactivateGiftCard();

  const [open, setOpen] = useState(false);
  const [amountSek, setAmountSek] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [issuedCard, setIssuedCard] = useState<GiftCard | null>(null);
  const [copied, setCopied] = useState(false);

  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState<GiftCard | null | 'not_found' | 'loading'>(null);

  const openIssue = () => {
    setAmountSek('');
    setCustomCode('');
    setIssuedCard(null);
    setCopied(false);
    setOpen(true);
  };

  const submitIssue = async () => {
    const cents = toCents(amountSek);
    if (cents <= 0) return;
    const card = await issue.mutateAsync({
      p_code: customCode.trim() || null,
      p_amount_cents: cents,
    });
    setIssuedCard(card);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const runLookup = async () => {
    const code = lookupCode.trim();
    if (!code) return;
    setLookupResult('loading');
    try {
      const card = await lookupGiftCard(code);
      setLookupResult(card ?? 'not_found');
    } catch (e: any) {
      toast.error(e?.message ?? 'Lookup failed');
      setLookupResult('not_found');
    }
  };

  const sorted = [...cards].sort((a, b) => {
    const ad = a.issued_at ?? a.created_at ?? '';
    const bd = b.issued_at ?? b.created_at ?? '';
    return bd.localeCompare(ad);
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 font-mono"
                placeholder="Enter gift card code…"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runLookup();
                }}
              />
            </div>
            <Button onClick={runLookup} disabled={!lookupCode.trim() || lookupResult === 'loading'}>
              {lookupResult === 'loading' ? 'Looking up…' : 'Check'}
            </Button>
          </div>
          {lookupResult === 'not_found' && (
            <p className="text-sm text-muted-foreground">
              No gift card found for that code.
            </p>
          )}
          {lookupResult && lookupResult !== 'loading' && lookupResult !== 'not_found' && (
            <div className="rounded-lg border p-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-sm">{lookupResult.code}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Status:{' '}
                  {lookupResult.status === 'active' ? (
                    <span className="text-emerald-600 font-medium">Active</span>
                  ) : (
                    <span className="text-muted-foreground">{lookupResult.status}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className="text-xl font-semibold font-mono">
                  {formatCurrency(lookupResult.balance_cents, lookupResult.currency)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Gift cards</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Spending happens at checkout via the redeem flow — this screen only issues, lists,
              and deactivates cards.
            </p>
          </div>
          <Button onClick={openIssue}>
            <Plus className="h-4 w-4 mr-2" />
            Issue gift card
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No gift cards issued yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((c) => {
                    const active = c.status === 'active';
                    const issued = c.issued_at ?? c.created_at;
                    return (
                      <TableRow key={c.id ?? c.code}>
                        <TableCell>
                          <span className="font-mono text-sm">{c.code}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(c.balance_cents, c.currency)}
                        </TableCell>
                        <TableCell>
                          {active ? (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              {c.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {issued ? formatDate(new Date(issued)) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Deactivate gift card ${c.code}? This cannot be undone.`)) {
                                    deactivate.mutate(c.code);
                                  }
                                }}
                              >
                                <Ban className="h-4 w-4 mr-1 text-destructive" />
                                Deactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue gift card</DialogTitle>
            <DialogDescription>
              Leave the code empty to auto-generate one.
            </DialogDescription>
          </DialogHeader>

          {issuedCard ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-4 bg-muted/40 space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Code</div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-lg font-semibold flex-1 break-all">
                      {issuedCard.code}
                    </code>
                    <Button size="icon" variant="ghost" onClick={() => copyCode(issuedCard.code)}>
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Balance</div>
                  <div className="text-xl font-semibold font-mono">
                    {formatCurrency(issuedCard.balance_cents, issuedCard.currency)}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Store this code securely — it grants the bearer the balance at checkout.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="gc-amt">Initial amount ({homeCurrency()})</Label>
                <Input
                  id="gc-amt"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountSek}
                  onChange={(e) => setAmountSek(e.target.value)}
                  placeholder="e.g. 500"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gc-code">Code (optional)</Label>
                <Input
                  id="gc-code"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  placeholder="Leave empty to auto-generate"
                  className="font-mono uppercase"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {issuedCard ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={submitIssue}
                  disabled={toCents(amountSek) <= 0 || issue.isPending}
                >
                  {issue.isPending ? 'Issuing…' : 'Issue card'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
