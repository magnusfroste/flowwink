import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const KEY = 'demo_mode';
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demo-cycle`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Demo Mode toggle. When enabled, the `demo-cycle` edge function (scheduled
 * hourly via pg_cron) will wipe and re-seed pilot modules. Intended for the
 * public demo instance only — never enable on a customer site.
 */
export function DemoModeCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['site_settings', KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', KEY)
        .maybeSingle();
      if (error) throw error;
      const v: any = data?.value;
      return v === true || v?.enabled === true;
    },
  });

  useEffect(() => {
    if (typeof data === 'boolean') setEnabled(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: KEY, value: next as any }, { onConflict: 'key' });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ['site_settings', KEY] });
      toast({
        title: next ? 'Demo mode enabled' : 'Demo mode disabled',
        description: next
          ? 'Hourly demo-cycle will wipe & re-seed pilot modules on this instance.'
          : 'Scheduled demo-cycle will skip this instance.',
      });
    },
    onError: (err: any) => {
      setEnabled(data === true);
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Demo Mode
        </CardTitle>
        <CardDescription>
          Enable only on a dedicated demo instance. Pilot modules (CRM, Quotes, Invoices,
          Expenses, Ecommerce) are wiped and re-seeded hourly by the <code>demo-cycle</code> job.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Demo cycle active</Label>
            <p className="text-sm text-muted-foreground">
              Off on customer sites. Templates and KB are never touched.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={isLoading || mutation.isPending}
            onCheckedChange={(next) => {
              setEnabled(next);
              mutation.mutate(next);
            }}
          />
        </div>
        {enabled && (
          <Alert variant="destructive">
            <AlertDescription>
              All non-template data in pilot modules will be reset every hour. Do not store
              real customer data on this instance.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
