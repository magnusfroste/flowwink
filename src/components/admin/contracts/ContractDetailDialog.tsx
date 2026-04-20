import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { Contract } from "@/hooks/useContracts";
import { DocumentsPanel } from "@/components/admin/documents/DocumentsPanel";

interface Props {
  contract: Contract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_signature: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  terminated: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

export function ContractDetailDialog({ contract, open, onOpenChange }: Props) {
  if (!contract) return null;

  const formatValue = (cents: number, currency: string) =>
    cents ? new Intl.NumberFormat("sv-SE", { style: "currency", currency }).format(cents / 100) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="truncate">{contract.title}</DialogTitle>
            <Badge variant="outline" className={STATUS_COLORS[contract.status]}>
              {contract.status.replace("_", " ")}
            </Badge>
          </div>
          <DialogDescription>
            {contract.counterparty_name}
            {contract.counterparty_email && ` · ${contract.counterparty_email}`}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-2">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Type" value={contract.contract_type} />
              <Field label="Value" value={formatValue(contract.value_cents, contract.currency)} />
              <Field
                label="Start date"
                value={contract.start_date ? format(new Date(contract.start_date), "MMM d, yyyy") : "—"}
              />
              <Field
                label="End date"
                value={contract.end_date ? format(new Date(contract.end_date), "MMM d, yyyy") : "—"}
              />
              <Field label="Renewal" value={contract.renewal_type} />
              {contract.renewal_type !== "none" && (
                <Field label="Notice (days)" value={String(contract.renewal_notice_days ?? 30)} />
              )}
            </div>
            {contract.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="documents" className="pt-4">
            <DocumentsPanel
              entityType="contract"
              entityId={contract.id}
              defaultCategory="contract"
              title="Linked documents"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="capitalize">{value}</p>
    </div>
  );
}
