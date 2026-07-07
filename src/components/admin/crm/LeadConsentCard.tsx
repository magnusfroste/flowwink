import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CONSENT_TYPES = ['marketing_email', 'newsletter', 'sms'] as const;
const LABELS: Record<string, string> = {
  marketing_email: 'Marketing email',
  newsletter: 'Newsletter',
  sms: 'SMS',
};

interface ConsentCheck {
  consents: Record<string, 'granted' | 'revoked' | 'none'>;
  newsletter_unsubscribed: boolean;
}

/**
 * GDPR consent center per contact (crm parity: consent_center).
 * Same backend as the manage_consent skill.
 */
export function LeadConsentCard({ email }: { email: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['lead-consent', email],
    queryFn: async (): Promise<ConsentCheck | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('manage_consent' as any, {
        p_action: 'check',
        p_email: email,
      });
      if (error) throw error;
      return data as unknown as ConsentCheck;
    },
    enabled: !!email,
  });

  const setConsent = useMutation({
    mutationFn: async ({ type, grant }: { type: string; grant: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc('manage_consent' as any, {
        p_action: grant ? 'grant' : 'revoke',
        p_email: email,
        p_consent_type: type,
        p_source: 'admin',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-consent', email] });
      toast.success('Consent updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Consent (GDPR)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            {CONSENT_TYPES.map((type) => {
              const state = data?.consents?.[type] ?? 'none';
              return (
                <div key={type} className="flex items-center justify-between gap-2 text-sm">
                  <span>{LABELS[type]}</span>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={state === 'granted' ? 'default' : state === 'revoked' ? 'destructive' : 'outline'}
                      className="text-xs"
                    >
                      {state}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Grant"
                      disabled={setConsent.isPending}
                      onClick={() => setConsent.mutate({ type, grant: true })}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Revoke"
                      disabled={setConsent.isPending}
                      onClick={() => setConsent.mutate({ type, grant: false })}
                    >
                      <ShieldX className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {data?.newsletter_unsubscribed && (
              <p className="text-xs text-destructive">Unsubscribed from the newsletter list</p>
            )}
            <p className="text-xs text-muted-foreground">
              Revoked contacts are excluded from bulk email automatically.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
