import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Send, Loader2, CheckCircle2, XCircle, ExternalLink, Copy, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

type State = 'idle' | 'running' | 'ok' | 'error';

/**
 * Telegram channel status card.
 *
 * Architecture: the bot token lives in `TELEGRAM_BOT_TOKEN` (Supabase secret,
 * managed under /admin/integrations like every other provider). The webhook
 * URL is derived from this instance's own SUPABASE_URL — there is no field to
 * paste it. "Register webhook" calls `manage_channel action=configure`, which
 * uses the token from secrets and tells Telegram to POST updates to our
 * derived URL with a derived secret. Nothing for the operator to copy
 * manually into BotFather beyond the token itself.
 */
export function TelegramIntegrationCard() {
  const [test, setTest] = useState<State>('idle');
  const [register, setRegister] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const webhookUrl = useMemo(() => {
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    return base ? `${base}/functions/v1/telegram-ingest` : '';
  }, []);

  const runTest = async () => {
    setTest('running'); setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('agent-execute', {
        body: { skill_name: 'manage_channel', arguments: { action: 'test', channel: 'telegram' } },
      });
      if (invokeErr) throw invokeErr;
      const ok = (data as any)?.success !== false;
      setTest(ok ? 'ok' : 'error');
      if (!ok) setError((data as any)?.error || 'Test failed');
      else toast.success('Telegram bot reachable');
    } catch (e: any) {
      setTest('error');
      setError(e?.message ?? 'Unable to reach manage_channel skill');
    }
  };

  const runRegister = async () => {
    setRegister('running'); setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('agent-execute', {
        body: { skill_name: 'manage_channel', arguments: { action: 'configure', channel: 'telegram' } },
      });
      if (invokeErr) throw invokeErr;
      const ok = (data as any)?.success !== false;
      setRegister(ok ? 'ok' : 'error');
      if (!ok) setError((data as any)?.error || 'Register failed');
      else toast.success('Webhook registered with Telegram');
    } catch (e: any) {
      setRegister('error');
      setError(e?.message ?? 'Unable to register webhook');
    }
  };

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-sky-500" />
            Telegram
          </CardTitle>
          <CardDescription>
            Two-way messaging via your Telegram bot. Webhook URL is fixed to this instance — you only set the bot token.
          </CardDescription>
        </div>
        <Badge variant="outline" className="gap-1">
          {test === 'ok' && <><CheckCircle2 className="h-3 w-3 text-green-500" /> Connected</>}
          {test === 'error' && <><XCircle className="h-3 w-3 text-red-500" /> Error</>}
          {test === 'running' && 'Testing…'}
          {test === 'idle' && 'Not tested'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Webhook URL (auto-derived)</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copyWebhook} disabled={!webhookUrl} aria-label="Copy webhook URL">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            You don't paste this anywhere — click "Register webhook" and we call Telegram's setWebhook for you using the token from secrets.
          </p>
        </div>

        <Alert>
          <KeyRound className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs flex items-center justify-between gap-2">
            <span>Bot token is stored as <code className="font-mono">TELEGRAM_BOT_TOKEN</code> in your secrets.</span>
            <Button asChild size="sm" variant="ghost" className="h-6 px-2">
              <Link to="/admin/integrations">Manage <ExternalLink className="h-3 w-3 ml-1" /></Link>
            </Button>
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between pt-1 gap-2">
          <a
            href="https://core.telegram.org/bots#how-do-i-create-a-bot"
            target="_blank" rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            BotFather docs <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={runTest} disabled={test === 'running'}>
              {test === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test connection'}
            </Button>
            <Button size="sm" onClick={runRegister} disabled={register === 'running'}>
              {register === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Register webhook'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TwilioIntegrationPlaceholder() {
  return (
    <Card className="opacity-70">
      <CardHeader>
        <CardTitle className="text-base">Twilio (SMS / Voice)</CardTitle>
        <CardDescription>
          Coming next — once Twilio is wired the same Test pattern will land here.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
