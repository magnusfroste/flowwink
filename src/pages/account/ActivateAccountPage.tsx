/**
 * Activate account — where an invited customer sets their password.
 *
 * The account already exists: the invite (from a signed contract, a paid
 * order, etc.) created it with the email bound and the customer role granted.
 * Supabase's invite link verifies a one-time token and, via detectSessionInUrl,
 * hands this page a temporary session for that exact account. So the email is
 * FIXED — read from the session, shown read-only, never typed. The customer
 * only chooses a password. That closes the hole Magnus spotted: a plain login
 * page would let them "create an account" with the wrong address, orphaning the
 * invited one that holds their service.
 *
 * No valid invite session → an honest dead-end, not a signup form.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function ActivateAccountPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // detectSessionInUrl (default on) consumes the invite token from the URL
    // hash and establishes a temporary session for the invited account. If it
    // did, we have a user with the bound email. If not, the link is spent or
    // was never valid — do NOT fall through to a form that accepts any email.
    let active = true;
    const resolve = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!active) return;
      if (user?.email) {
        setEmail(user.email);
        setStatus('ready');
      } else {
        setStatus('invalid');
      }
    };
    // Give the client a beat to parse the URL hash on first mount.
    const t = setTimeout(resolve, 400);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.email) {
        setEmail(session.user.email);
        setStatus('ready');
      }
    });
    return () => { active = false; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const submit = async () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { toast.error('The passwords do not match.'); return; }
    setSubmitting(true);
    try {
      // Sets the password on the ALREADY-EXISTING invited account (the session
      // is that account). The email is never sent — it cannot be changed here.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Welcome — your account is ready.');
      // Where the invitation was headed. A colleague invited to the admin should
      // land in the admin, a portal customer in the portal — one activation
      // screen, two destinations, rather than a second copy of a password form.
      // Relative paths only: an open redirect on a page that hands out a session
      // is how an invitation link becomes somebody else's.
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
      <Card className="w-full max-w-md">
        {status === 'checking' && (
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm">Verifying your invitation…</span>
          </CardContent>
        )}

        {status === 'invalid' && (
          <>
            <CardHeader>
              <CardTitle>Invitation link expired</CardTitle>
              <CardDescription>
                This activation link is no longer valid — it may already have
                been used, or it expired. Contact us and we'll send a new one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                Back to homepage
              </Button>
            </CardContent>
          </>
        )}

        {status === 'ready' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Set your password
              </CardTitle>
              <CardDescription>
                Choose a password to finish setting up your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                {/* Read-only, from the invite session — the whole point. */}
                <Input value={email} readOnly disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input id="pw" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input id="pw2" type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()} />
              </div>
              <Button className="w-full" onClick={submit} disabled={submitting || !password || !confirm}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Activate account
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
