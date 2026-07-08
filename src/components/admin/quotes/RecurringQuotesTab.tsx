import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Play } from 'lucide-react';
import {
  useRecurringQuoteTemplates,
  useCreateRecurringQuoteTemplate,
  useDeleteRecurringQuoteTemplate,
  useUpdateRecurringQuoteTemplate,
  useRunRecurringQuotesNow,
  type RecurringInterval,
} from '@/hooks/useRecurringQuotes';
import { useQuotes } from '@/hooks/useQuotes';

export function RecurringQuotesTab() {
  const { data: templates = [] } = useRecurringQuoteTemplates();
  const { data: quotes = [] } = useQuotes();
  const create = useCreateRecurringQuoteTemplate();
  const update = useUpdateRecurringQuoteTemplate();
  const del = useDeleteRecurringQuoteTemplate();
  const run = useRunRecurringQuotesNow();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    source_quote_id: '',
    interval: 'monthly' as RecurringInterval,
    next_run_at: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const submit = async () => {
    if (!form.name.trim() || !form.source_quote_id) return;
    await create.mutateAsync(form);
    setForm({ ...form, name: '', notes: '' });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex items-start justify-between gap-3">
          <div className="text-sm text-muted-foreground max-w-2xl">
            Retainers and renewals. A template regenerates a fresh draft quote on its interval — monthly retainer,
            annual renewal. The source quote's line items, tax and currency are copied; the new quote starts as a
            draft you can review and send.
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
              <Play className="h-4 w-4 mr-1" /> Run due now
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New template</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New recurring quote template</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly retainer — Acme" />
                  </div>
                  <div>
                    <Label>Source quote</Label>
                    <Select value={form.source_quote_id} onValueChange={(v) => setForm({ ...form, source_quote_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Pick a quote to clone" /></SelectTrigger>
                      <SelectContent>
                        {quotes.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.quote_number} — {q.leads?.name ?? '—'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Interval</Label>
                      <Select value={form.interval} onValueChange={(v) => setForm({ ...form, interval: v as RecurringInterval })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Next run</Label>
                      <Input type="date" value={form.next_run_at} onChange={(e) => setForm({ ...form, next_run_at: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={submit} disabled={!form.name.trim() || !form.source_quote_id || create.isPending}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Interval</TableHead>
              <TableHead>Next run</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No recurring templates yet</TableCell></TableRow>
            ) : templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  {t.notes && <div className="text-xs text-muted-foreground">{t.notes}</div>}
                </TableCell>
                <TableCell><Badge variant="secondary">{t.interval}</Badge></TableCell>
                <TableCell>{format(new Date(t.next_run_at), 'yyyy-MM-dd')}</TableCell>
                <TableCell className="tabular-nums">{t.generated_count}</TableCell>
                <TableCell>
                  <Switch
                    checked={t.active}
                    onCheckedChange={(v) => update.mutate({ id: t.id, patch: { active: v } })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
