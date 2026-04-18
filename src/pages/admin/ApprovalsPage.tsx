import { useState } from 'react';
import { useApprovals, usePendingApprovals, useApprovalRules } from '@/hooks/useApprovals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, ShieldCheck, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

function formatAmount(cents: number | null, currency: string) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);
}

export default function ApprovalsPage() {
  const { data: pending, isLoading: pendingLoading } = usePendingApprovals();
  const { data: rules, isLoading: rulesLoading } = useApprovalRules();
  const { decide } = useApprovals();
  const [comment, setComment] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const handleDecide = async (id: string, decision: 'approve' | 'reject') => {
    try {
      await decide.mutateAsync({ request_id: id, decision, comment: comment[id] });
      toast.success(`Request ${decision}d`);
      setComment((c) => ({ ...c, [id]: '' }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  // Create rule form state
  const [ruleOpen, setRuleOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    entity_type: 'expense_report',
    amount_threshold_cents: '',
    currency: 'SEK',
    required_role: 'admin' as 'admin' | 'approver' | 'writer',
    priority: 100,
  });

  const createRule = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('approval_rules').insert({
        name: newRule.name,
        description: newRule.description || null,
        entity_type: newRule.entity_type,
        amount_threshold_cents: newRule.amount_threshold_cents ? Math.round(parseFloat(newRule.amount_threshold_cents) * 100) : null,
        currency: newRule.currency,
        required_role: newRule.required_role,
        priority: newRule.priority,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals', 'rules'] });
      setRuleOpen(false);
      setNewRule({ name: '', description: '', entity_type: 'expense_report', amount_threshold_cents: '', currency: 'SEK', required_role: 'admin', priority: 100 });
      toast.success('Rule created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const toggleRule = useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('approval_rules').update({ is_active: input.is_active }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals', 'rules'] }),
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Approvals</h1>
          <p className="text-muted-foreground">Generic approval workflow used across modules</p>
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending {pending && pending.length > 0 && <Badge variant="secondary" className="ml-2">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {!pendingLoading && pending && pending.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p>No pending approvals — you're all caught up.</p>
              </CardContent>
            </Card>
          )}
          {pending?.map((req) => (
            <Card key={req.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge>{req.entity_type}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{req.entity_id}</span>
                    </CardTitle>
                    <CardDescription>
                      {formatAmount(req.amount_cents, req.currency)} · requires <span className="font-medium">{req.required_role}</span> · requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {req.reason && <p className="text-sm">{req.reason}</p>}
                <Textarea
                  placeholder="Optional comment for the audit log…"
                  value={comment[req.id] ?? ''}
                  onChange={(e) => setComment((c) => ({ ...c, [req.id]: e.target.value }))}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button onClick={() => handleDecide(req.id, 'approve')} disabled={decide.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button variant="outline" onClick={() => handleDecide(req.id, 'reject')} disabled={decide.isPending}>
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> New rule</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create approval rule</DialogTitle>
                  <DialogDescription>Define when an entity needs sign-off.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={newRule.description} onChange={(e) => setNewRule({ ...newRule, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Entity type</Label>
                      <Select value={newRule.entity_type} onValueChange={(v) => setNewRule({ ...newRule, entity_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense_report">Expense report</SelectItem>
                          <SelectItem value="purchase_order">Purchase order</SelectItem>
                          <SelectItem value="invoice">Invoice</SelectItem>
                          <SelectItem value="quote">Quote</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Required role</Label>
                      <Select value={newRule.required_role} onValueChange={(v) => setNewRule({ ...newRule, required_role: v as 'admin' | 'approver' | 'writer' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="approver">Approver</SelectItem>
                          <SelectItem value="writer">Writer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Threshold (in {newRule.currency})</Label>
                      <Input
                        type="number"
                        placeholder="empty = always require"
                        value={newRule.amount_threshold_cents}
                        onChange={(e) => setNewRule({ ...newRule, amount_threshold_cents: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Currency</Label>
                      <Input value={newRule.currency} onChange={(e) => setNewRule({ ...newRule, currency: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRuleOpen(false)}>Cancel</Button>
                  <Button onClick={() => createRule.mutate()} disabled={!newRule.name || createRule.isPending}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {rulesLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {rules && rules.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Required role</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {rule.name}
                        {rule.description && <div className="text-xs text-muted-foreground">{rule.description}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{rule.entity_type}</Badge></TableCell>
                      <TableCell>{formatAmount(rule.amount_threshold_cents, rule.currency)}</TableCell>
                      <TableCell><Badge>{rule.required_role}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant={rule.is_active ? 'default' : 'outline'} onClick={() => toggleRule.mutate({ id: rule.id, is_active: !rule.is_active })}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
