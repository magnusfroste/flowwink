import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type State = 'idle' | 'running' | 'ok' | 'error';

interface Action {
  label: string;
  run: () => Promise<void>;
}

/**
 * Generic per-provider integration test panel.
 *
 * Provider-level concerns (token validation, webhook registration, derived
 * URLs) live here — rendered inside the IntegrationsStatusPage drawer.
 * Channel-level concerns (which agents use which channel, queue filters)
 * stay in their owning module page (e.g. /admin/live-support).
 *
 * New providers: add a case in `useProviderActions` returning derived
 * fields + actions. Everything else is shared.
 */
export function IntegrationTestPanel({ providerKey, hasKey }: { providerKey: string; hasKey: boolean }) {
  const provider = useProviderActions(providerKey);
  if (!provider) return null;

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Provider checks
      </div>

      {provider.derived?.map((d) => (
        <DerivedField key={d.label} {...d} />
      ))}

      {!hasKey && (
        <Alert>
          <AlertDescription className="text-xs">
            Add the credential above before running provider checks.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {provider.actions.map((a) => (
          <ActionButton key={a.label} action={a} disabled={!hasKey} />
        ))}
      </div>

      {providerKey === 'elks46' && hasKey && <Elks46NumbersPanel />}
    </div>
  );
}

function Elks46NumbersPanel() {
  const [numbers, setNumbers] = useState<Array<{ id: string; number: string; voice_start: string | null; sms_url: string | null }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const expectedUrl = useMemo(() => {
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    return base ? `${base}/functions/v1/elks46-ingest` : '';
  }, []);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('elks46-ingest', { body: { action: 'test' } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setNumbers((data as any)?.numbers ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load numbers');
    } finally {
      setLoading(false);
    }
  };

  const setVoiceStart = async (numberId: string, alsoSms: boolean) => {
    setSavingId(numberId);
    try {
      const { data, error } = await supabase.functions.invoke('elks46-ingest', {
        body: { action: 'set_voice_start', number_id: numberId, also_sms: alsoSms },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('voice_start updated on 46elks');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Numbers on this account</Label>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : (numbers ? 'Refresh' : 'Load')}
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {numbers && numbers.length === 0 && (
        <p className="text-xs text-muted-foreground">No active numbers on your 46elks account.</p>
      )}
      {numbers && numbers.length > 0 && (
        <div className="space-y-2">
          {numbers.map((n) => {
            const isConfigured = n.voice_start === expectedUrl;
            const isSaving = savingId === n.id;
            return (
              <div key={n.id} className="rounded-md border p-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">{n.number}</span>
                  {isConfigured ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" /> voice_start points to FlowWink
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => setVoiceStart(n.id, !n.sms_url)}
                      disabled={isSaving}
                    >
                      {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      Set voice_start → FlowWink
                    </Button>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground break-all">
                  <span>voice_start: </span>
                  <code>{n.voice_start || '— (not set)'}</code>
                </div>
                {n.sms_url && (
                  <div className="text-[11px] text-muted-foreground break-all">
                    <span>sms_url: </span><code>{n.sms_url}</code>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            "Set voice_start" calls the 46elks API for you — no need to log in and paste URLs manually.
          </p>
        </div>
      )}
    </div>
  );
}

function ActionButton({ action, disabled }: { action: Action; disabled: boolean }) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState('running'); setError(null);
    try {
      await action.run();
      setState('ok');
    } catch (e: any) {
      setState('error');
      setError(e?.message ?? 'Failed');
      toast.error(`${action.label}: ${e?.message ?? 'Failed'}`);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="outline" onClick={run} disabled={disabled || state === 'running'}>
        {state === 'running' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        {state === 'ok' && <CheckCircle2 className="h-3 w-3 text-green-500 mr-1" />}
        {state === 'error' && <XCircle className="h-3 w-3 text-red-500 mr-1" />}
        {action.label}
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

function DerivedField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface ProviderSpec {
  derived?: { label: string; value: string; hint?: string }[];
  actions: Action[];
}

async function invokeSkill(skill_name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('agent-execute', {
    body: { skill_name, arguments: args },
  });
  if (error) throw error;
  if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Skill returned failure');
  return data;
}

function useProviderActions(key: string): ProviderSpec | null {
  return useMemo<ProviderSpec | null>(() => {
    switch (key) {
      case 'telegram': {
        const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const webhookUrl = base ? `${base}/functions/v1/telegram-ingest` : '';
        return {
          derived: [{
            label: 'Webhook URL (auto-derived)',
            value: webhookUrl,
            hint: "You don't paste this anywhere — click Register webhook and we call Telegram's setWebhook for you using the token from secrets.",
          }],
          actions: [
            { label: 'Test connection', run: () => invokeSkill('manage_channel', { action: 'test', channel: 'telegram' }).then(() => { toast.success('Telegram bot reachable'); }) },
            { label: 'Register webhook', run: () => invokeSkill('manage_channel', { action: 'configure', channel: 'telegram', webhook_url: webhookUrl }).then(() => { toast.success('Webhook registered with Telegram'); }) },
          ],
        };
      }
      case 'twilio': {
        const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const webhookUrl = base ? `${base}/functions/v1/twilio-ingest` : '';
        return {
          derived: [{
            label: 'Webhook URL (auto-derived)',
            value: webhookUrl,
            hint: 'Paste this into Twilio Console → Messaging → Request URL (POST).',
          }],
          actions: [
            {
              label: 'Test connection',
              run: async () => {
                const { data, error } = await supabase.functions.invoke('twilio-ingest', {
                  body: { action: 'test' },
                });
                if (error) throw error;
                const payload = data as any;
                if (payload?.error) throw new Error(payload.error + (payload.details ? ` — ${payload.details}` : ''));
                toast.success(`Twilio connected — ${payload?.numbers_found ?? 0} number(s) found`);
              },
            },
          ],
        };
      }
      case 'gatewayapi': {
        const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const webhookUrl = base ? `${base}/functions/v1/gatewayapi-ingest` : '';
        return {
          derived: [{
            label: 'Webhook URL (auto-derived)',
            value: webhookUrl,
            hint: 'Paste this into GatewayAPI → Settings → Webhooks → Incoming messages.',
          }],
          actions: [
            {
              label: 'Test connection',
              run: async () => {
                const { data, error } = await supabase.functions.invoke('gatewayapi-ingest', {
                  body: { action: 'test' },
                });
                if (error) throw error;
                const payload = data as any;
                if (payload?.error) throw new Error(payload.error + (payload.details ? ` — ${payload.details}` : ''));
                toast.success(`GatewayAPI connected — credit: ${payload?.credit ?? 'unknown'}`);
              },
            },
          ],
        };
      }
      case 'elks46': {
        const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const smsWebhookUrl = base ? `${base}/functions/v1/elks46-ingest` : '';
        return {
          derived: [
            {
              label: 'SMS webhook URL (auto-derived)',
              value: smsWebhookUrl,
              hint: 'Paste this into 46elks Dashboard → Your number → SMS URL (POST).',
            },
            {
              label: 'Voice webhook URL (auto-derived)',
              value: smsWebhookUrl,
              hint: 'Same endpoint handles incoming voice calls — paste into Voice Start URL on your number.',
            },
          ],
          actions: [
            {
              label: 'Test connection',
              run: async () => {
                const { data, error } = await supabase.functions.invoke('elks46-ingest', {
                  body: { action: 'test' },
                });
                if (error) throw error;
                const payload = data as any;
                if (payload?.error) throw new Error(payload.error + (payload.details ? ` — ${payload.details}` : ''));
                toast.success(`46elks connected — ${payload?.numbers_found ?? 0} number(s), balance: ${payload?.balance ?? '?'} ${payload?.currency ?? ''}`);
              },
            },
          ],
        };
      }
      default:
        return null;
    }
  }, [key]);
}
