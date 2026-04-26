import { useState, useMemo } from 'react';
import {
  useAnalyticAccounts,
  useAnalyticBalances,
  useCreateAnalyticAccount,
  useUpdateAnalyticAccount,
  type AnalyticAccountType,
} from '@/hooks/useAnalyticAccounting';
import { useProjects } from '@/hooks/useProjects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Tag, FolderTree, Building2, Megaphone } from 'lucide-react';

const TYPE_META: Record<AnalyticAccountType, { label: string; icon: any; color: string }> = {
  cost_center: { label: 'Cost Center', icon: Tag, color: 'bg-blue-500/10 text-blue-600' },
  project: { label: 'Project', icon: FolderTree, color: 'bg-emerald-500/10 text-emerald-600' },
  department: { label: 'Department', icon: Building2, color: 'bg-purple-500/10 text-purple-600' },
  campaign: { label: 'Campaign', icon: Megaphone, color: 'bg-amber-500/10 text-amber-600' },
  other: { label: 'Other', icon: Tag, color: 'bg-muted text-muted-foreground' },
};

export function AnalyticAccountingTab() {
  const { data: accounts = [], isLoading } = useAnalyticAccounts(false);
  const { data: balances = [] } = useAnalyticBalances();
  const { data: projects = [] } = useProjects();
  const create = useCreateAnalyticAccount();
  const update = useUpdateAnalyticAccount();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    code: '',
    name: '',
    account_type: 'cost_center' as AnalyticAccountType,
    parent_id: '',
    project_id: '',
    description: '',
  });

  const balanceMap = useMemo(() => {
    const m = new Map<string, typeof balances[number]>();
    balances.forEach(b => m.set(b.analytic_account_id, b));
    return m;
  }, [balances]);

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCreate = async () => {
    if (!form.code || !form.name) return;
    await create.mutateAsync({
      code: form.code,
      name: form.name,
      account_type: form.account_type,
      parent_id: form.parent_id || null,
      project_id: form.project_id || null,
      description: form.description || undefined,
    });
    setForm({ code: '', name: '', account_type: 'cost_center', parent_id: '', project_id: '', description: '' });
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Analytic Accounting</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Tag journal entries to projects, cost centers, departments or campaigns for profitability reporting.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New analytic account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New analytic account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Code</Label>
                    <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="CC-001" />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={form.account_type} onValueChange={v => setForm(f => ({ ...f, account_type: v as AnalyticAccountType }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_META).map(([k, m]) => (
                          <SelectItem key={k} value={k}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Name</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Marketing Q1 2026" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Parent (optional)</Label>
                    <Select value={form.parent_id || 'none'} onValueChange={v => setForm(f => ({ ...f, parent_id: v === 'none' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {accounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Linked project (optional)</Label>
                    <Select value={form.project_id || 'none'} onValueChange={v => setForm(f => ({ ...f, project_id: v === 'none' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!form.code || !form.name || create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No analytic accounts yet.</p>
              <p className="text-xs mt-1">Create cost centers or projects to start tagging journal entries.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(a => {
                  const bal = balanceMap.get(a.id);
                  const meta = TYPE_META[a.account_type];
                  const Icon = meta.icon;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-sm">{a.code}</TableCell>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={meta.color}>
                          <Icon className="h-3 w-3 mr-1" />{meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{bal?.line_count ?? 0}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(bal?.balance_cents ?? 0)}</TableCell>
                      <TableCell>
                        {a.is_active
                          ? <Badge variant="outline">Active</Badge>
                          : <Badge variant="secondary">Archived</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => update.mutate({ id: a.id, is_active: !a.is_active })}
                        >
                          {a.is_active ? 'Archive' : 'Reactivate'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
