import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreateInvoice, type InvoiceLineItem } from '@/hooks/useInvoices';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceFromTimesheetsDialog({ open, onOpenChange }: Props) {
  const [projectId, setProjectId] = useState('');
  const [period, setPeriod] = useState<'this_month' | 'last_month' | 'custom'>('last_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dueDays, setDueDays] = useState(30);
  const createInvoice = useCreateInvoice();
  const queryClient = useQueryClient();

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-for-invoice'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, client_name, hourly_rate_cents, currency, is_billable')
        .eq('is_active', true)
        .eq('is_billable', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const selectedProject = projects.find(p => p.id === projectId);

  // Fetch unbilled time entries for preview
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['unbilled-entries', projectId, period, startDate, endDate],
    queryFn: async () => {
      if (!projectId) return [];
      const now = new Date();
      let start: string, end: string;

      if (period === 'this_month') {
        start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        end = now.toISOString().split('T')[0];
      } else if (period === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        start = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      } else {
        start = startDate;
        end = endDate;
      }

      if (!start || !end) return [];

      const { data, error } = await supabase
        .from('time_entries')
        .select('id, entry_date, hours, description, is_billable')
        .eq('project_id', projectId)
        .eq('is_billable', true)
        .gte('entry_date', start)
        .lte('entry_date', end)
        .order('entry_date');

      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && open,
  });

  const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
  const rateCents = selectedProject?.hourly_rate_cents || 0;
  const totalCents = Math.round(totalHours * rateCents);

  const handleCreate = async () => {
    if (!projectId || !selectedProject || entries.length === 0) return;

    // Create line items from time entries
    const lineItems: InvoiceLineItem[] = entries.map(e => ({
      description: `${e.entry_date}: ${e.description || 'Consulting'}`,
      qty: e.hours || 0,
      unit_price_cents: rateCents,
    }));

    // We need a lead to create an invoice — look up by client_name
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .ilike('name', selectedProject.client_name || '')
      .limit(1);

    const leadId = leads?.[0]?.id;
    if (!leadId) {
      toast.error('No matching lead found for client. Create a lead first.');
      return;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    createInvoice.mutate(
      {
        lead_id: leadId,
        line_items: lineItems,
        tax_rate: 0.25,
        currency: selectedProject.currency || 'SEK',
        due_date: dueDate.toISOString().split('T')[0],
        notes: `Generated from ${totalHours}h billable time on project "${selectedProject.name}"`,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          onOpenChange(false);
          setProjectId('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoice from Timesheets</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Billable Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.client_name && `— ${p.client_name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Period</Label>
            <Select value={period} onValueChange={v => setPeriod(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Payment Terms (days)</Label>
            <Input
              type="number"
              value={dueDays}
              onChange={e => setDueDays(parseInt(e.target.value) || 30)}
              className="w-24"
            />
          </div>

          {/* Preview */}
          {projectId && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              {entriesLoading ? (
                <p className="text-muted-foreground">Loading entries…</p>
              ) : entries.length === 0 ? (
                <p className="text-muted-foreground">No billable entries for this period</p>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{entries.length} time entries</span>
                    <span className="font-medium">{totalHours.toFixed(1)} hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Rate: {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: selectedProject?.currency || 'SEK' }).format(rateCents / 100)}/h
                    </span>
                    <span className="font-mono font-medium">
                      {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: selectedProject?.currency || 'SEK' }).format(totalCents / 100)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">+ 25% VAT</p>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={!projectId || entries.length === 0 || createInvoice.isPending}
          >
            {createInvoice.isPending ? 'Creating…' : 'Create Invoice Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
