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
import { Wallet, Plus, CheckCircle2, Banknote, Eye, Trash2, FileDown, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
            <TabsTrigger value="reports">Reports</TabsTrigger>
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

          <TabsContent value="reports">
            <ReportsTab runs={runsData ?? []} />
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

  const period = run.period_date.slice(0, 7);
  const sorted = [...(lines ?? [])].sort((a, b) =>
    (a.employee_name ?? '').localeCompare(b.employee_name ?? ''),
  );
  const totals = sorted.reduce(
    (a, l) => {
      a.gross += l.gross_cents;
      a.tax += l.tax_cents;
      a.social += l.social_fee_cents;
      a.net += l.net_cents;
      a.employer += l.gross_cents + l.social_fee_cents;
      return a;
    },
    { gross: 0, tax: 0, social: 0, net: 0, employer: 0 },
  );

  const fmtNum = (cents: number) => (cents / 100).toFixed(2);

  const exportCSV = () => {
    const header = ['Employee', 'Gross', 'PAYE tax', 'Social fee (31.42%)', 'Net wages', 'Employer cost'];
    const rows = sorted.map((l) => [
      l.employee_name ?? l.employee_id,
      fmtNum(l.gross_cents),
      fmtNum(l.tax_cents),
      fmtNum(l.social_fee_cents),
      fmtNum(l.net_cents),
      fmtNum(l.gross_cents + l.social_fee_cents),
    ]);
    rows.push([
      'TOTAL',
      fmtNum(totals.gross),
      fmtNum(totals.tax),
      fmtNum(totals.social),
      fmtNum(totals.net),
      fmtNum(totals.employer),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${period}_per-employee.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Payroll ${period} — per employee`, 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Status: ${run.status}    Currency: SEK    ${sorted.length} employees`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Employee', 'Gross', 'PAYE tax', 'Social fee', 'Net wages', 'Employer cost']],
      body: sorted.map((l) => [
        l.employee_name ?? l.employee_id.slice(0, 8),
        fmtNum(l.gross_cents),
        fmtNum(l.tax_cents),
        fmtNum(l.social_fee_cents),
        fmtNum(l.net_cents),
        fmtNum(l.gross_cents + l.social_fee_cents),
      ]),
      foot: [[
        'TOTAL',
        fmtNum(totals.gross),
        fmtNum(totals.tax),
        fmtNum(totals.social),
        fmtNum(totals.net),
        fmtNum(totals.employer),
      ]],
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right' }, 5: { halign: 'right' },
      },
      styles: { fontSize: 9 },
    });

    doc.save(`payroll_${period}_per-employee.pdf`);
    toast.success('PDF downloaded');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Per-employee drilldown"><Eye className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Payroll {period} — per employee</DialogTitle>
              <div className="text-xs text-muted-foreground mt-1">
                Status: <span className="capitalize">{run.status}</span> · {sorted.length} employees
              </div>
            </div>
            <div className="flex gap-2 mr-6">
              <Button size="sm" variant="outline" onClick={exportCSV} disabled={sorted.length === 0}>
                <FileDown className="mr-1 h-3.5 w-3.5" /> CSV
              </Button>
              <Button size="sm" onClick={exportPDF} disabled={sorted.length === 0}>
                <FileText className="mr-1 h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
          <MiniStat label="Gross" value={fmtSEK(totals.gross)} />
          <MiniStat label="PAYE tax" value={fmtSEK(totals.tax)} />
          <MiniStat label="Social fee" value={fmtSEK(totals.social)} />
          <MiniStat label="Net" value={fmtSEK(totals.net)} />
          <MiniStat label="Employer cost" value={fmtSEK(totals.employer)} highlight />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">PAYE tax</TableHead>
              <TableHead className="text-right">Social fee</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Employer cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.employee_name ?? l.employee_id.slice(0, 8)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.gross_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.tax_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.social_fee_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(l.net_cents)}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtSEK(l.gross_cents + l.social_fee_cents)}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No employee lines for this run.
                </TableCell>
              </TableRow>
            )}
            {sorted.length > 0 && (
              <TableRow className="font-semibold bg-muted/40">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.gross)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.tax)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.social)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.net)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.employer)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${highlight ? 'border-primary' : ''}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold font-mono">{value}</div>
    </div>
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

// ─────────────────────────────────────────────────────────────────────────
// Reports tab — period aggregation + CSV/PDF export
// ─────────────────────────────────────────────────────────────────────────

function ReportsTab({ runs }: { runs: PayrollRun[] }) {
  const currentYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${currentYear}-01-01`);
  const [to, setTo] = useState(`${currentYear}-12-31`);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'approved+paid'>('approved+paid');

  const filtered = runs.filter((r) => {
    if (r.period_date < from || r.period_date > to) return false;
    if (statusFilter === 'paid') return r.status === 'paid';
    if (statusFilter === 'approved+paid') return r.status === 'approved' || r.status === 'paid';
    return r.status !== 'cancelled';
  });

  const sorted = [...filtered].sort((a, b) => a.period_date.localeCompare(b.period_date));

  const totals = sorted.reduce(
    (a, r) => {
      a.gross += r.total_gross_cents;
      a.tax += r.total_tax_cents;
      a.social += r.total_social_fee_cents;
      a.net += r.total_net_cents;
      a.employer_cost += r.total_gross_cents + r.total_social_fee_cents;
      return a;
    },
    { gross: 0, tax: 0, social: 0, net: 0, employer_cost: 0 },
  );

  const fmtNum = (cents: number) => (cents / 100).toFixed(2);

  const exportCSV = () => {
    const header = ['Period', 'Status', 'Gross', 'PAYE tax', 'Employer social fee (31.42%)', 'Net wages', 'Total employer cost'];
    const rows = sorted.map((r) => [
      r.period_date.slice(0, 7),
      r.status,
      fmtNum(r.total_gross_cents),
      fmtNum(r.total_tax_cents),
      fmtNum(r.total_social_fee_cents),
      fmtNum(r.total_net_cents),
      fmtNum(r.total_gross_cents + r.total_social_fee_cents),
    ]);
    rows.push([
      'TOTAL', '',
      fmtNum(totals.gross),
      fmtNum(totals.tax),
      fmtNum(totals.social),
      fmtNum(totals.net),
      fmtNum(totals.employer_cost),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-report_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Payroll Report', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${from} → ${to}    Filter: ${statusFilter}    Currency: SEK`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Period', 'Status', 'Gross', 'PAYE tax', 'Social fee', 'Net wages', 'Employer cost']],
      body: sorted.map((r) => [
        r.period_date.slice(0, 7),
        r.status,
        fmtNum(r.total_gross_cents),
        fmtNum(r.total_tax_cents),
        fmtNum(r.total_social_fee_cents),
        fmtNum(r.total_net_cents),
        fmtNum(r.total_gross_cents + r.total_social_fee_cents),
      ]),
      foot: [[
        'TOTAL', '',
        fmtNum(totals.gross),
        fmtNum(totals.tax),
        fmtNum(totals.social),
        fmtNum(totals.net),
        fmtNum(totals.employer_cost),
      ]],
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
        5: { halign: 'right' }, 6: { halign: 'right' },
      },
      styles: { fontSize: 9 },
    });

    doc.save(`payroll-report_${from}_${to}.pdf`);
    toast.success('PDF downloaded');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment report per period</CardTitle>
        <CardDescription>
          Aggregated gross wages, PAYE tax, employer social fee, and net paid per period. Export to CSV or PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid only</SelectItem>
                <SelectItem value="approved+paid">Approved + Paid</SelectItem>
                <SelectItem value="all">All (excl. cancelled)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={sorted.length === 0}>
              <FileDown className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={exportPDF} disabled={sorted.length === 0}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard label="Gross wages" value={fmtSEK(totals.gross)} />
          <SummaryCard label="PAYE tax (2710)" value={fmtSEK(totals.tax)} />
          <SummaryCard label="Social fee (2731)" value={fmtSEK(totals.social)} />
          <SummaryCard label="Net paid (2890)" value={fmtSEK(totals.net)} />
          <SummaryCard label="Employer cost" value={fmtSEK(totals.employer_cost)} highlight />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">PAYE tax</TableHead>
              <TableHead className="text-right">Social fee</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Employer cost</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.period_date.slice(0, 7)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === 'paid' ? 'default' : 'outline'} className="capitalize">{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(r.total_gross_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(r.total_tax_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(r.total_social_fee_cents)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(r.total_net_cents)}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtSEK(r.total_gross_cents + r.total_social_fee_cents)}
                </TableCell>
                <TableCell className="text-right"><RunDetails run={r} /></TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No runs match the selected period and status.
                </TableCell>
              </TableRow>
            )}
            {sorted.length > 0 && (
              <TableRow className="font-semibold bg-muted/40">
                <TableCell>Total</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.gross)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.tax)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.social)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.net)}</TableCell>
                <TableCell className="text-right font-mono">{fmtSEK(totals.employer_cost)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary' : ''}>
      <CardHeader className="pb-1 pt-3">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent className="pb-3 text-lg font-semibold font-mono">{value}</CardContent>
    </Card>
  );
}
