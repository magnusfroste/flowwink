import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Printer, Loader2 } from 'lucide-react';
import { usePayslip } from '@/hooks/usePayslip';
import { PayslipView, printPayslip } from './PayslipView';

interface PayslipDialogProps {
  runId: string;
  employeeId: string;
  employeeName?: string | null;
  triggerLabel?: string;
}

export function PayslipDialog({ runId, employeeId, employeeName, triggerLabel = 'Payslip' }: PayslipDialogProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = usePayslip(runId, employeeId, open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-3.5 w-3.5 mr-1" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payslip{employeeName ? ` — ${employeeName}` : ''}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive py-6">
            {(error as Error).message}
          </div>
        )}
        {data && <PayslipView payslip={data} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={printPayslip} disabled={!data}>
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
