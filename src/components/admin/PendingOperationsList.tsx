import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Inbox, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export function PendingOperationsList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pending-operations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_operations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('approve_pending_operation', { p_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success('Approved'); qc.invalidateQueries({ queryKey: ['pending-operations'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('reject_pending_operation', { p_id: id, p_reason: 'Rejected via admin UI' });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success('Rejected'); qc.invalidateQueries({ queryKey: ['pending-operations'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Pending Operations
          {data && data.length > 0 && <Badge>{data.length}</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Staged operations from agents and skills awaiting approval. Preview-first protects against unwanted writes.
        </p>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending operations.</p>
        ) : (
          <div className="space-y-3">
            {data.map((op: any) => (
              <div key={op.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{op.skill_name}</Badge>
                    <Badge variant={op.risk_level === 'high' ? 'destructive' : op.risk_level === 'medium' ? 'default' : 'secondary'}>
                      {op.risk_level}
                    </Badge>
                    {op.period_status && (
                      <Badge variant={op.period_status === 'locked' ? 'destructive' : 'outline'}>
                        period: {op.period_status}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(op.created_at).toLocaleString()}</span>
                </div>
                <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-48">{JSON.stringify(op.preview ?? op.args, null, 2)}</pre>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={() => approve.mutate(op.id)}>
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reject.mutate(op.id)}>
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
