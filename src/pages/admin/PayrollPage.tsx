import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Wallet, Plus, CheckCircle2, Banknote, Eye, Trash2 } from 'lucide-react';

interface PayrollRun {
  id: string;
  period_date: string;
  status: 'draft' | 'approved' | 'paid' | 'cancelled';
  total_gross_cents: number;
  total_tax_cents: number;
  total_social_fee_cents: number;
  total_net_cents: number;
  approved_at: string | null;
  paid_at: string | null;
}
interface PayrollLine {
  id: string;
  employee_id: string;
  employee_name: string | null;
  gross_cents: number;
  benefits_cents: number;
  deductions_cents: number;
  taxable_cents: number;
  tax_cents: number;
  social_fee_cents: number;
  net_cents: number;
}
interface Employee {
  id: string;
  full_name: string;
  monthly_salary_cents: number;
  tax_rate_pct: number;
  employment_status: string;
}
interface Component {
  id: string;
  employee_id: string;
  component_type: 'salary' | 'benefit' | 'deduction' | 'bonus' | 'overtime';
  label: string;
  amount_cents: number;
  taxable: boolean;
  recurring: boolean;
  active: boolean;
}

const fmtSEK = (cents: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format((cents ?? 0) / 100);

export default function PayrollPage() {
  const [tab, setTab] = useState('runs');
  const qc = useQueryClient();

  const { data: runsData } = useQuery({
    queryKey: ['payroll_runs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_payroll_runs' as any, { p_limit: 24 });
      if (error) throw error;
      return ((data as any)?.runs ?? []) as PayrollRun[];
    },
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-for-payroll'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, monthly_salary_cents, tax_rate_pct, employment_status')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as unknown as Employee[];
    },
  });

  const createRun = useMutation({
    mutationFn: async (period: string) => {
      const { data, error } = await supabase.rpc('create_payroll_run' as any, { p_period_date: period });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d: any) => {
      toast.success(`Created run with ${d?.lines} lines, gross ${fmtSEK(d?.total_gross_cents ?? 0)}`);
      qc.invalidateQueries({ queryKey: ['payroll_runs'] });
      setTab('runs');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('approve_payroll_run' as any, { p_run_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Payroll approved and posted to ledger');
      qc.invalidateQueries({ queryKey: ['payroll_runs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('mark_payroll_paid' as any, { p_run_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Payment booked (Dt 2890 / Cr 1930)');
      qc.invalidateQueries({ queryKey: ['payroll_runs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = (runsData ?? []).reduce(
    (a, r) => {
      if (r.status !== 'cancelled') {
        a.gross += r.total_gross_cents;
        a.net += r.total_net_cents;
      }
      return a;
    },
    { gross: 0, net: 0 },
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Payroll"
          description="Monthly payroll runs (SE-locale). Posts wages to BAS 7210/7510/2710/2731/2890."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Active employees</CardDescription></CardHeader>
            <CardContent className="text-2xl font-semibold">
              {employees?.filter((e) => e.employment_status === 'active').length ?? 0}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>YTD gross (last 24 runs)</CardDescription></CardHeader>
            <CardContent className="text-2xl font-semibold">{fmtSEK(totals.gross)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>YTD net paid</CardDescription></CardHeader>
            <CardContent className="text-2xl font-semibold">{fmtSEK(totals.net)}</CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="new">New run</TabsTrigger>
            <TabsTrigger value="components">Salary & components</TabsTrigger>
          </TabsList>

          <TabsContent value="runs">
            <Card>
              <CardHeader><CardTitle>Payroll runs</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Social fee</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(runsData ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.period_date.slice(0, 7)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'paid' ? 'default' : 'outline'} className="capitalize">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtSEK(r.total_gross_cents)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtSEK(r.total_tax_cents)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtSEK(r.total_social_fee_cents)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtSEK(r.total_net_cents)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <RunDetails run={r} />
                            {r.status === 'draft' && (
                              <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                            )}
                            {r.status === 'approved' && (
                              <Button size="sm" onClick={() => markPaid.mutate(r.id)} disabled={markPaid.isPending}>
                                <Banknote className="h-3.5 w-3.5 mr-1" /> Mark paid
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!runsData || runsData.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No payroll runs yet. Switch to "New run" to create one.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <NewRunForm onCreate={(p) => createRun.mutate(p)} pending={createRun.isPending} />
          </TabsContent>

          <TabsContent value="components">
            <ComponentsManager employees={employees ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function NewRunForm({ onCreate, pending }: { onCreate: (period: string) => void; pending: boolean }) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create new payroll run</CardTitle>
        <CardDescription>
          Snapshots all active employees with their monthly salary + recurring components into a draft run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 max-w-md">
          <div className="space-y-1">
            <Label>Period (any date in target month)</Label>
            <Input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div>
            <Button onClick={() => onCreate(period)} disabled={pending}>
              <Plus className="mr-2 h-4 w-4" /> Create draft run
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RunDetails({ run }: { run: PayrollRun }) {
  const [open, setOpen] = useState(false);
  const { data: lines } = useQuery({
    queryKey: ['payroll_lines', run.id, open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_payroll_lines' as any, { p_run_id: run.id });
      if (error) throw error;
      return ((data as any)?.lines ?? []) as PayrollLine[];
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{run.period_date.slice(0, 7)} — {run.status}</DialogTitle></DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Social</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(lines ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.employee_name ?? l.employee_id.slice(0, 8)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.gross_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.tax_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.social_fee_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.net_cents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function ComponentsManager({ employees }: { employees: Employee[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');
  const emp = employees.find((e) => e.id === selected);

  const { data: components, refetch } = useQuery({
    queryKey: ['payroll_components', selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_components' as any)
        .select('*')
        .eq('employee_id', selected)
        .order('component_type');
      if (error) throw error;
      return (data ?? []) as unknown as Component[];
    },
  });

  const updateEmp = async (field: 'monthly_salary_cents' | 'tax_rate_pct', value: number) => {
    if (!selected) return;
    const { error } = await supabase.from('employees').update({ [field]: value } as any).eq('id', selected);
    if (error) toast.error(error.message);
    else {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['employees-for-payroll'] });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salary & recurring components</CardTitle>
        <CardDescription>Set monthly salary, PAYE tax rate, and recurring benefits/deductions per employee.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-md">
          <Label>Employee</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {emp && (
          <>
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <div className="space-y-1">
                <Label>Monthly salary (SEK)</Label>
                <Input
                  type="number" step="0.01"
                  defaultValue={(emp.monthly_salary_cents / 100).toString()}
                  onBlur={(e) => updateEmp('monthly_salary_cents', Math.round(parseFloat(e.target.value || '0') * 100))}
                />
              </div>
              <div className="space-y-1">
                <Label>PAYE tax rate (%)</Label>
                <Input
                  type="number" step="0.01"
                  defaultValue={emp.tax_rate_pct.toString()}
                  onBlur={(e) => updateEmp('tax_rate_pct', parseFloat(e.target.value || '30'))}
                />
              </div>
            </div>

            <ComponentsList employeeId={emp.id} components={components ?? []} onChange={() => refetch()} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ComponentsList({
  employeeId,
  components,
  onChange,
}: {
  employeeId: string;
  components: Component[];
  onChange: () => void;
}) {
  const [type, setType] = useState<Component['component_type']>('benefit');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [taxable, setTaxable] = useState(true);

  const add = async () => {
    const cents = Math.round(parseFloat(amount || '0') * 100);
    if (!label || !cents) return toast.error('Label and amount required');
    const { error } = await supabase.from('payroll_components' as any).insert({
      employee_id: employeeId,
      component_type: type,
      label,
      amount_cents: cents,
      taxable,
      recurring: true,
      active: true,
    } as any);
    if (error) return toast.error(error.message);
    toast.success('Added');
    setLabel(''); setAmount('');
    onChange();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('payroll_components' as any).delete().eq('id', id);
    if (error) return toast.error(error.message);
    onChange();
  };

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="text-sm font-medium">Recurring components</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Taxable</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {components.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="capitalize">{c.component_type}</TableCell>
              <TableCell>{c.label}</TableCell>
              <TableCell className="text-right font-mono">{fmtSEK(c.amount_cents)}</TableCell>
              <TableCell>{c.taxable ? 'Yes' : 'No'}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => remove(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {components.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No recurring components.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <div className="grid grid-cols-5 gap-2 items-end pt-2">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v: any) => setType(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bonus">Bonus</SelectItem>
              <SelectItem value="overtime">Overtime</SelectItem>
              <SelectItem value="benefit">Benefit</SelectItem>
              <SelectItem value="deduction">Deduction</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Wellness allowance" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount (SEK)</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Button onClick={add} className="w-full"><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
        </div>
      </div>
    </div>
  );
}
