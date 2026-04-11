import { AlertTriangle, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useExpiringContracts } from '@/hooks/useContracts';

export function ContractAlerts() {
  const { data: expiring } = useExpiringContracts(30);

  if (!expiring?.length) return null;

  return (
    <Alert variant="destructive" className="border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-400">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <Clock className="h-4 w-4" />
        {expiring.length} contract{expiring.length > 1 ? 's' : ''} expiring within 30 days
      </AlertTitle>
      <AlertDescription className="mt-1 text-sm">
        {expiring.slice(0, 3).map(c => c.title).join(', ')}
        {expiring.length > 3 && ` and ${expiring.length - 3} more`}
      </AlertDescription>
    </Alert>
  );
}
