import { useState } from 'react';
import { Plus, FileText, Calendar, DollarSign, MoreHorizontal, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useContracts, useDeleteContract, type Contract } from '@/hooks/useContracts';
import { NewContractDialog } from './NewContractDialog';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_signature: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  terminated: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  nda: 'NDA',
  employment: 'Employment',
  lease: 'Lease',
  other: 'Other',
};

interface Props {
  statusFilter: string;
}

export function ContractsList({ statusFilter }: Props) {
  const { data: contracts, isLoading } = useContracts(statusFilter);
  const deleteContract = useDeleteContract();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContract, setEditContract] = useState<Contract | undefined>();

  const formatValue = (cents: number, currency: string) => {
    if (!cents) return null;
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading contracts…</div>;
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditContract(undefined); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New Contract
        </Button>
      </div>

      {!contracts?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>No contracts found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {contracts.map((contract) => (
            <Card key={contract.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{contract.title}</h3>
                      <Badge variant="outline" className={STATUS_COLORS[contract.status]}>
                        {contract.status.replace('_', ' ')}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {TYPE_LABELS[contract.contract_type]}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">
                      {contract.counterparty_name}
                      {contract.counterparty_email && ` · ${contract.counterparty_email}`}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {contract.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(contract.start_date), 'MMM d, yyyy')}
                          {contract.end_date && ` → ${format(new Date(contract.end_date), 'MMM d, yyyy')}`}
                        </span>
                      )}
                      {contract.value_cents > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {formatValue(contract.value_cents, contract.currency)}
                        </span>
                      )}
                      {contract.renewal_type !== 'none' && (
                        <Badge variant="outline" className="text-xs">
                          {contract.renewal_type === 'auto' ? 'Auto-renew' : 'Manual renew'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditContract(contract); setDialogOpen(true); }}>
                        <Edit className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteContract.mutate(contract.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contract={editContract}
      />
    </>
  );
}
