/**
 * Contract obligations checklist — milestone / deliverable tracking.
 * Uses contract_obligations_with_status view for auto is_overdue flag.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Check, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useContractObligations,
  useCreateObligation,
  useUpdateObligationStatus,
  useDeleteObligation,
  type ContractObligation,
} from '@/hooks/useContractsParity';

const STATUS_STYLES: Record<ContractObligation['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  met: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  waived: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

export function ContractObligationsPanel({ contractId }: { contractId: string }) {
  const { data: obligations = [], isLoading } = useContractObligations(contractId);
  const create = useCreateObligation();
  const setStatus = useUpdateObligationStatus();
  const remove = useDeleteObligation();

  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [responsible, setResponsible] = useState('');

  const handleAdd = async () => {
    if (!desc.trim()) return;
    await create.mutateAsync({
      contract_id: contractId,
      description: desc.trim(),
      due_date: due || null,
      responsible: responsible.trim() || null,
    });
    setDesc('');
    setDue('');
    setResponsible('');
  };

  const overdueCount = obligations.filter((o) => o.is_overdue || o.status === 'overdue').length;
  const openCount = obligations.filter((o) => o.status === 'pending').length;
  const metCount = obligations.filter((o) => o.status === 'met').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Obligations &amp; milestones</CardTitle>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline">{openCount} open</Badge>
            <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30">
              {metCount} met
            </Badge>
            {overdueCount > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
                <AlertTriangle className="h-3 w-3 mr-1" /> {overdueCount} overdue
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add row */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_160px_auto] gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Deliver Q1 report"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Due date</label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Responsible</label>
            <Input
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Name / role"
            />
          </div>
          <Button onClick={handleAdd} disabled={!desc.trim() || create.isPending} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="h-24 animate-pulse bg-muted/40 rounded-md" />
        ) : obligations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No obligations yet. Add milestones or deliverables above.</p>
        ) : (
          <div className="space-y-2">
            {obligations.map((o) => {
              const displayStatus: ContractObligation['status'] =
                o.status === 'pending' && o.is_overdue ? 'overdue' : o.status;
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={o.status === 'met' ? 'line-through text-muted-foreground' : 'font-medium'}>
                        {o.description}
                      </span>
                      <Badge variant="outline" className={STATUS_STYLES[displayStatus]}>
                        {displayStatus}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                      {o.due_date && <span>Due {format(new Date(o.due_date), 'MMM d, yyyy')}</span>}
                      {o.responsible && <span>· {o.responsible}</span>}
                      {o.met_at && (
                        <span>· Met {format(new Date(o.met_at), 'MMM d, yyyy')}</span>
                      )}
                    </div>
                  </div>
                  <Select
                    value={o.status}
                    onValueChange={(v) => setStatus.mutate({ obligation_id: o.id, status: v as ContractObligation['status'] })}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="met">
                        <Check className="h-3 w-3 inline mr-1" /> Met
                      </SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="waived">Waived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(o.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
