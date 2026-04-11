import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateContract, useUpdateContract, type Contract } from '@/hooks/useContracts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract?: Contract;
}

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

export function NewContractDialog({ open, onOpenChange, contract }: Props) {
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const isEdit = !!contract;

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
        title: '', contract_type: 'service', status: 'draft',
        counterparty_name: '', counterparty_email: '',
        start_date: '', end_date: '', renewal_type: 'none',
        renewal_notice_days: 30, value_cents: 0, currency: 'SEK', notes: '',
      });
    }
  }, [contract, reset]);

  const onSubmit = (data: FormValues) => {
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
          <div>
            <Label>Title</Label>
            <Input {...register('title')} placeholder="Service Agreement — Acme Corp" />
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
            <Button type="submit" disabled={createContract.isPending || updateContract.isPending}>
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
