import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Loader2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { AUTHENTICATOR_APPS } from '@/lib/mfa-gate';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type Step = 'idle' | 'enrolling' | 'scan' | 'done';

/**
 * Enroll an authenticator app (TOTP) on the signed-in account, or remove it.
 * Lives on Profile → Security, and full-screen when the instance requires MFA
 * of its staff and this staff member has none yet (`forced`). TOTP is a
 * standard: Google Authenticator, Microsoft Authenticator, 1Password,
 * Bitwarden and Apple Passwords all read the same QR code.
 *
 * Supabase leaves an UNVERIFIED factor behind when enrollment is abandoned,
 * and refuses a second one with the same name — so every start clears those.
 */
export function MfaEnroll({ forced = false, onEnrolled }: { forced?: boolean; onEnrolled?: () => void }) {
  const { mfa, refreshMfa, signOut } = useAuth();
  const [step, setStep] = useState<Step>('idle');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedId, setVerifiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const v = (data?.totp ?? []).find((f) => f.status === 'verified');
      setVerifiedId(v?.id ?? null);
    });
    return () => { cancelled = true; };
  }, [mfa.verifiedFactors]);

  const clearUnverified = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.totp ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearUnverified();
      const { data, error: enErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
      if (enErr || !data) throw new Error(enErr?.message ?? 'Enrollment did not start');
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (chErr || !ch) throw new Error(chErr?.message ?? 'Could not open a challenge');
      setChallengeId(ch.id);
      setStep('scan');
    } catch (e) {
      logger.warn('[mfa] enroll failed:', e);
      setError(e instanceof Error ? e.message : String(e));
      setStep('idle');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!factorId || !challengeId || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code: value });
    if (vErr) {
      setError(/invalid|expired/i.test(vErr.message) ? 'That code did not match. Scan the code again if the app shows a different site, then type the current code.' : vErr.message);
      setCode('');
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId });
      if (ch) setChallengeId(ch.id);
      setBusy(false);
      return;
    }
    await refreshMfa();
    setStep('done');
    setBusy(false);
    toast.success('Authenticator enrolled — your sign-in now asks for a code');
    onEnrolled?.();
  };

  const cancel = async () => {
    setBusy(true);
    await clearUnverified();
    setStep('idle');
    setQr(null);
    setSecret(null);
    setCode('');
    setBusy(false);
  };

  const remove = async () => {
    if (!verifiedId) return;
    setBusy(true);
    const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId: verifiedId });
    setBusy(false);
    if (unErr) { toast.error(unErr.message); return; }
    await refreshMfa();
    toast.success('Authenticator removed');
  };

  const enrolled = mfa.verifiedFactors > 0 && step !== 'scan';

  if (enrolled && step !== 'done') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium">Authenticator app enrolled</span>
          <Badge variant="outline" className="text-xs">on</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Signing in asks for a six-digit code from your app. Remove it only to re-enroll on a new phone; an admin can also reset it for you under Users.</p>
        <Button variant="outline" size="sm" onClick={remove} disabled={busy}>
          <ShieldOff className="h-3.5 w-3.5 mr-1.5" /> Remove authenticator
        </Button>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4 text-emerald-500" /> Enrolled. {forced ? 'Taking you in…' : 'Your next sign-in asks for a code.'}
      </div>
    );
  }

  if (step === 'scan') {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open your authenticator app ({AUTHENTICATOR_APPS.slice(0, 3).join(', ')} or any other).</li>
          <li>Scan the code, or type the key by hand.</li>
          <li>Enter the six-digit code the app shows.</li>
        </ol>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {qr && <img src={qr} alt="QR code for the authenticator app" className="h-40 w-40 rounded-md border bg-white p-1" />}
          {secret && (
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs text-muted-foreground">Key, if the camera will not scan:</p>
              <div className="flex items-center gap-2">
                <code className="break-all rounded bg-muted px-2 py-1 text-xs">{secret}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { void navigator.clipboard?.writeText(secret); toast.success('Key copied'); }} title="Copy key">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-center sm:justify-start">
          <InputOTP maxLength={6} value={code} onChange={(v) => { setCode(v); if (v.length === 6) void verify(v); }} disabled={busy} autoFocus>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>Cancel</Button>
          {forced && <Button variant="ghost" size="sm" onClick={() => void signOut()}>Sign out</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldOff className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">No authenticator app enrolled</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {forced
          ? 'This site requires a second factor for everyone who runs it. Enroll an authenticator app to continue — it takes a minute.'
          : 'A second factor means a stolen password alone cannot open this account. Works with any authenticator app.'}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={start} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
          Set up authenticator app
        </Button>
        {forced && <Button variant="ghost" size="sm" onClick={() => void signOut()}>Sign out</Button>}
      </div>
    </div>
  );
}
