import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCreateContract, useUpdateContract, type Contract } from '@/hooks/useContracts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract?: Contract;
  /**
   * Prefill when the contract starts from a quote or a lead.
   *
   * `quote_id` is the link itself, not a convenience: before it existed the
   * handoff copied values and encoded the origin as prose in the title
   * (`Avtal — QUO-2026-00005`), so nothing downstream could answer which quote
   * became which agreement.
   */
  prefill?: {
    counterparty_name?: string;
    counterparty_email?: string;
    value_cents?: number;
    title?: string;
    quote_id?: string;
  };
}

const NO_TEMPLATE = '__blank__';

interface FormValues {
  title: string;
  contract_type: string;
  status: string;
  counterparty_name: string;
  counterparty_email: string;
  start_date: string;
  end_date: string;
  renewal_type: string;
  renewal_notice_days: number;
  value_cents: number;
  currency: string;
  notes: string;
}

export function NewContractDialog({ open, onOpenChange, contract, prefill }: Props) {
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const qc = useQueryClient();
  const isEdit = !!contract;

  // Templates were reachable to agents (manage_contract, template_id) but not
  // from here — a salesperson pressing "New contract" got a blank form and the
  // organisation's own agreement wordings stayed invisible to the people who
  // sell from them.
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);
  const { data: templates = [] } = useQuery({
    queryKey: ['contract-templates', 'active'],
    enabled: open && !isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_templates')
        .select('id, name, description, contract_type, default_currency, default_renewal_type, default_renewal_notice_days, default_value_cents')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const selectedTemplate = templates.find((t) => t.id === templateId);

  const { register, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      title: '',
      contract_type: 'service',
      status: 'draft',
      counterparty_name: '',
      counterparty_email: '',
      start_date: '',
      end_date: '',
      renewal_type: 'none',
      renewal_notice_days: 30,
      value_cents: 0,
      currency: 'SEK',
      notes: '',
    },
  });

  useEffect(() => {
    if (contract) {
      reset({
        title: contract.title,
        contract_type: contract.contract_type,
        status: contract.status,
        counterparty_name: contract.counterparty_name,
        counterparty_email: contract.counterparty_email || '',
        start_date: contract.start_date || '',
        end_date: contract.end_date || '',
        renewal_type: contract.renewal_type,
        renewal_notice_days: contract.renewal_notice_days || 30,
        value_cents: contract.value_cents / 100,
        currency: contract.currency,
        notes: contract.notes || '',
      });
    } else {
      reset({
        title: prefill?.title ?? '', contract_type: 'service', status: 'draft',
        counterparty_name: prefill?.counterparty_name ?? '',
        counterparty_email: prefill?.counterparty_email ?? '',
        start_date: '', end_date: '', renewal_type: 'none',
        renewal_notice_days: 30,
        value_cents: (prefill?.value_cents ?? 0) / 100,
        currency: 'SEK', notes: '',
      });
      setTemplateId(NO_TEMPLATE);
    }
  }, [contract, reset, prefill]);

  // Picking a template adopts its defaults so the form shows what will actually
  // be written, rather than leaving stale values the RPC then overrides.
  useEffect(() => {
    if (!selectedTemplate) return;
    setValue('contract_type', selectedTemplate.contract_type);
    setValue('currency', selectedTemplate.default_currency ?? 'SEK');
    setValue('renewal_type', selectedTemplate.default_renewal_type ?? 'none');
    if (selectedTemplate.default_renewal_notice_days != null) {
      setValue('renewal_notice_days', selectedTemplate.default_renewal_notice_days);
    }
    if (selectedTemplate.default_value_cents != null && !prefill?.value_cents) {
      setValue('value_cents', selectedTemplate.default_value_cents / 100);
    }
  }, [selectedTemplate, setValue, prefill]);

  const onSubmit = async (data: FormValues) => {
    // From a template, the body has to be rendered server-side — the same RPC
    // the agent path uses, so both surfaces produce byte-identical agreements
    // and there is only one place where token substitution can go wrong.
    if (!isEdit && templateId !== NO_TEMPLATE) {
      if (!data.counterparty_name?.trim()) {
        toast.error('Counterparty is required when starting from a template');
        return;
      }
      setCreatingFromTemplate(true);
      try {
        const { error } = await supabase.rpc('create_contract_from_template', {
          p_template_id: templateId,
          p_counterparty_name: data.counterparty_name.trim(),
          p_counterparty_email: data.counterparty_email || null,
          p_overrides: {
            title: data.title || undefined,
            start_date: data.start_date || undefined,
            end_date: data.end_date || undefined,
            value_cents: Math.round(data.value_cents * 100),
            currency: data.currency,
            // Carried through so the agreement records the quote it came from.
            quote_id: prefill?.quote_id || undefined,
          },
        });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ['contracts'] });
        toast.success('Contract drafted from template');
        onOpenChange(false);
      } catch (e) {
        toast.error(`Could not create from template: ${(e as Error).message}`);
      } finally {
        setCreatingFromTemplate(false);
      }
      return;
    }

    const payload = {
      ...data,
      value_cents: Math.round(data.value_cents * 100),
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      counterparty_email: data.counterparty_email || null,
      notes: data.notes || null,
    } as Partial<Contract>;

    if (isEdit) {
      updateContract.mutate({ id: contract!.id, ...payload } as Contract & { id: string }, {
        onSuccess: () => onOpenChange(false),
      });
    } else {
      createContract.mutate(payload, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Contract' : 'New Contract'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {!isEdit && (
            <div>
              <Label>Start from template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Blank contract" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Blank contract</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedTemplate
                  ? selectedTemplate.description || 'The full agreement text is rendered from this template.'
                  : templates.length
                    ? 'Pick a template to draft the full agreement text, or leave blank to write it yourself.'
                    : 'No templates yet — create them under Contracts → Templates.'}
              </p>
            </div>
          )}

          <div>
            <Label>Title</Label>
            <Input
              {...register('title')}
              placeholder={selectedTemplate ? `${selectedTemplate.name} — <counterparty>` : 'Service Agreement — Acme Corp'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <Select value={watch('contract_type')} onValueChange={(v) => setValue('contract_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="nda">NDA</SelectItem>
                  <SelectItem value="employment">Employment</SelectItem>
                  <SelectItem value="lease">Lease</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={watch('status')} onValueChange={(v) => setValue('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_signature">Pending Signature</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Counterparty</Label>
              <Input {...register('counterparty_name')} placeholder="Company or person name" />
            </div>
            <div>
              <Label>Email</Label>
              <Input {...register('counterparty_email')} type="email" placeholder="contact@example.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input {...register('start_date')} type="date" />
            </div>
            <div>
              <Label>End Date</Label>
              <Input {...register('end_date')} type="date" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Renewal</Label>
              <Select value={watch('renewal_type')} onValueChange={(v) => setValue('renewal_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notice Days</Label>
              <Input {...register('renewal_notice_days', { valueAsNumber: true })} type="number" />
            </div>
            <div>
              <Label>Value ({watch('currency')})</Label>
              <Input {...register('value_cents', { valueAsNumber: true })} type="number" step="0.01" />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea {...register('notes')} rows={3} placeholder="Internal notes…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createContract.isPending || updateContract.isPending || creatingFromTemplate}>
              {isEdit ? 'Save' : selectedTemplate ? 'Draft from template' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
