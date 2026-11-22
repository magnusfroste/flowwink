import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBrandingSettings } from '@/hooks/useSiteSettings';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, User, PlayCircle, ShieldAlert } from 'lucide-react';
import { recentAuthDiagnostic, describeAuthDiagnostic } from '@/lib/auth-diagnostics';
import { useUiText } from '@/lib/ui-text';
import { z } from 'zod';

type T = (key: string, fallback: string) => string;

// Built with the page's texts: a validation message is read by the visitor too.
const loginSchemaFor = (t: T) => z.object({
  email: z.string().email(t('auth.invalidEmail', 'Invalid email address')),
  password: z.string().min(6, t('auth.passwordTooShort', 'Password must be at least 6 characters')),
});

const signupSchemaFor = (t: T) => z.object({
  email: z.string().email(t('auth.invalidEmail', 'Invalid email address')),
  password: z.string().min(6, t('auth.passwordTooShort', 'Password must be at least 6 characters')),
  fullName: z.string().min(2, t('auth.nameTooShort', 'Name must be at least 2 characters')),
});

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  // Why the last session ended, if the browser saw an auth failure recently.
  const [lastAuthFailure] = useState(() => recentAuthDiagnostic());
  const t = useUiText();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'demo_mode')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v: any = data?.value;
        setDemoMode(v === true || v?.enabled === true);
      });
    return () => { cancelled = true; };
  }, []);
  
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { data: branding } = useBrandingSettings();

  // The sign-in screen wears the SITE's brand: in maintenance mode a visitor
  // lands here, and "CMS — Content Management System" told them nothing about
  // whose site it was (MJP demo, 2026-09-28). The instance's own name is
  // enough; the last fallback matches the admin sidebar's.
  const brandName = branding?.organizationName || branding?.adminName || 'FlowWink';

  // Where to land after sign-in: the page that sent us here (a shared deep
  // link kept alive by AdminLayout), or the dashboard. Internal paths only —
  // a state value that doesn't start with a single '/' is ignored.
  const rawFrom = (location.state as { from?: unknown } | null)?.from;
  const returnTo =
    typeof rawFrom === 'string' && rawFrom.startsWith('/') && !rawFrom.startsWith('//')
      ? rawFrom
      : '/admin';

  // Redirect if already logged in
  if (user) {
    navigate(returnTo);
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginSchemaFor(t).safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) {
      toast({
        title: t('auth.checkFields', 'Check the fields'),
        description: result.error.issues[0].message,
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);
    
    if (error) {
      toast({
        title: t('auth.loginFailed', 'Sign-in failed'),
        description: error.message === 'Invalid login credentials' 
          ? t('auth.wrongCredentials', 'Incorrect email or password')
          : error.message,
        variant: 'destructive',
      });
    } else {
      navigate(returnTo);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = signupSchemaFor(t).safeParse({ 
      email: signupEmail, 
      password: signupPassword,
      fullName: signupName,
    });
    if (!result.success) {
      toast({
        title: t('auth.checkFields', 'Check the fields'),
        description: result.error.issues[0].message,
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    setIsLoading(false);
    
    if (error) {
      const message = error.message.includes('already registered')
        ? t('auth.emailTaken', 'A user with this email already exists')
        : error.message;
      toast({
        title: t('auth.signupFailed', 'The account could not be created'),
        description: message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('auth.accountCreated', 'Account created'),
        description: t('auth.accountCreatedBody', 'You can now sign in with your e-mail and password.'),
      });
      navigate(returnTo);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <h1 className="font-serif font-bold text-2xl text-foreground">{brandName}</h1>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-xl">{t('auth.welcome', 'Welcome')}</CardTitle>
            <CardDescription>
              {t('auth.signInToContinue', 'Sign in to continue.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lastAuthFailure && (
              <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{t('auth.session_ended', 'Your previous session ended')}</p>
                    <p className="text-muted-foreground">{describeAuthDiagnostic(lastAuthFailure)}</p>
                    <p className="text-muted-foreground">{t('auth.session_ended_hint', 'Sign in again. If this keeps happening, send this line to your admin.')}</p>
                  </div>
                </div>
              </div>
            )}
            {demoMode && (
              <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <PlayCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{t('auth.demoTitle', 'Public demo instance')}</p>
                    <p className="text-muted-foreground">
                      {t('auth.demoSignInWith', 'Sign in with')} <code className="font-mono text-foreground">demo@flowwink.com</code> / <code className="font-mono text-foreground">demo1234</code>. {t('auth.demoResets', 'All data is reset every day at 03:00 UTC. No e-mail is sent.')}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">{t('auth.signIn', 'Sign in')}</TabsTrigger>
                <TabsTrigger value="signup">{t('auth.createAccount', 'Create account')}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('auth.email', 'E-mail address')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="name@company.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t('auth.password', 'Password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('auth.signIn', 'Sign in')}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">{t('auth.fullName', 'Full name')}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder={t('auth.namePlaceholder', 'Jane Doe')}
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t('auth.email', 'E-mail address')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="name@company.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t('auth.password', 'Password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder={t('auth.passwordHint', 'At least 6 characters')}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('auth.createAccount', 'Create account')}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link to="/" className="hover:text-primary transition-colors">
            ← {t('auth.backHome', 'Back to the homepage')}
          </Link>
        </p>
      </div>
    </div>
  );
}
