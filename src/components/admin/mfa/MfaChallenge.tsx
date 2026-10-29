import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { logger } from '@/lib/logger';

/**
 * The second step of signing in, for an account that enrolled an authenticator.
 * Rendered by the admin shell when the session is aal1 and the account can
 * reach aal2 (src/lib/mfa-gate.ts). Until the code is verified the database
 * answers this session as if it had no staff role (session_mfa_ok), so the
 * screen is a courtesy, not the lock.
 */
export function MfaChallenge({ onVerified }: { onVerified?: () => void }) {
  const { refreshMfa, signOut, user } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: listErr } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listErr) { setError(listErr.message); return; }
      const totp = (data?.totp ?? []).find((f) => f.status === 'verified') ?? data?.totp?.[0];
      if (!totp) { setError('No authenticator is enrolled on this account.'); return; }
      setFactorId(totp.id);
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (cancelled) return;
      if (chErr) { setError(chErr.message); return; }
      setChallengeId(ch.id);
    })();
    return () => { cancelled = true; };
  }, []);

  const verify = async (value: string) => {
    if (!factorId || !challengeId || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code: value });
    if (vErr) {
      logger.warn('[mfa] verify failed:', vErr.message);
      setError(/invalid|expired/i.test(vErr.message) ? 'That code did not match. Codes change every 30 seconds — try the current one.' : vErr.message);
      setCode('');
      // A challenge is single-use once it has failed on some servers; open a fresh one.
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId });
      if (ch) setChallengeId(ch.id);
      setBusy(false);
      return;
    }
    await refreshMfa();
    setBusy(false);
    onVerified?.();
  };

  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <ShieldCheck className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Enter your authenticator code</h1>
        <p className="text-sm text-muted-foreground">
          Open your authenticator app and type the six-digit code for this site{user?.email ? ` (${user.email})` : ''}.
        </p>
      </div>
      <div className="flex justify-center">
        <InputOTP maxLength={6} value={code} onChange={(v) => { setCode(v); if (v.length === 6) void verify(v); }} disabled={busy || !challengeId} autoFocus>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
          </InputOTPGroup>
        </InputOTP>
      </div>
      {busy && <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span>Lost the phone? An admin can reset your authenticator under Users.</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => void signOut()}>Sign out</Button>
    </div>
  );
}
