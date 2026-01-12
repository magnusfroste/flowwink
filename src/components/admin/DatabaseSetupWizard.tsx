import { useState } from 'react';
import { 
  Database, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ExternalLink,
  ChevronRight,
  Terminal,
  UserPlus,
  Mail,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

type SetupStep = 'welcome' | 'credentials' | 'running' | 'create-admin' | 'creating-admin' | 'success' | 'manual';

interface SetupResult {
  success: boolean;
  message?: string;
  error?: string;
  manual_required?: boolean;
  instructions?: string[];
  already_setup?: boolean;
}

export function DatabaseSetupWizard() {
  const [step, setStep] = useState<SetupStep>('welcome');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  
  // Admin creation fields
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const handleRunSetup = async () => {
    if (!serviceRoleKey.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your service role key',
        variant: 'destructive',
      });
      return;
    }

    setStep('running');
    setIsRunning(true);

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/setup-database`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service_role_key: serviceRoleKey,
            supabase_url: supabaseUrl,
          }),
        }
      );

      const data = await response.json();
      setResult(data);

      if (data.success) {
        // If already setup, skip admin creation
        if (data.already_setup) {
          setStep('success');
          setServiceRoleKey('');
        } else {
          // Proceed to admin creation
          setStep('create-admin');
        }
      } else if (data.manual_required) {
        setStep('manual');
      } else {
        setStep('credentials');
        toast({
          title: 'Setup Failed',
          description: data.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setStep('manual');
      setResult({
        success: false,
        manual_required: true,
        error: error instanceof Error ? error.message : 'Network error',
        instructions: [
          '1. Go to your Supabase project dashboard',
          '2. Navigate to SQL Editor',
          '3. Run the schema.sql file from the repository',
          '4. Refresh this page',
        ],
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCreateAdmin = async () => {
    if (!adminEmail.trim() || !adminPassword.trim()) {
      toast({
        title: 'Error',
        description: 'Email and password are required',
        variant: 'destructive',
      });
      return;
    }

    if (adminPassword.length < 8) {
      toast({
        title: 'Error',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    setStep('creating-admin');
    setIsCreatingAdmin(true);

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/setup-database`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service_role_key: serviceRoleKey,
            supabase_url: supabaseUrl,
            create_admin: true,
            admin_email: adminEmail,
            admin_password: adminPassword,
            admin_name: adminName || adminEmail,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setStep('success');
        // Clear sensitive data
        setServiceRoleKey('');
        setAdminPassword('');
        toast({
          title: 'Admin Created',
          description: `Admin account created for ${adminEmail}`,
        });
      } else {
        setStep('create-admin');
        toast({
          title: 'Failed to Create Admin',
          description: data.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setStep('create-admin');
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Network error',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleSkipAdmin = () => {
    setServiceRoleKey('');
    setStep('success');
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        {step === 'welcome' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">Database Setup</CardTitle>
              <CardDescription>
                Let's configure your database to get started with FlowWink CMS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h3 className="font-medium text-sm">What this will do:</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Create required database tables
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Set up security policies (RLS)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Configure authentication triggers
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Create your first admin account
                  </li>
                </ul>
              </div>
              <Button onClick={() => setStep('credentials')} className="w-full gap-2">
                Get Started
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setStep('manual')} 
                className="w-full"
              >
                I prefer manual setup
              </Button>
            </CardContent>
          </>
        )}

        {step === 'credentials' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Service Role Key
              </CardTitle>
              <CardDescription>
                Enter your Supabase service role key to run the database setup.
                This key is only used once and is not stored.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-600 dark:text-amber-400">
                      Keep this key secret!
                    </p>
                    <p className="text-muted-foreground mt-1">
                      The service role key has full database access. Never expose it in client-side code.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-key">Service Role Key</Label>
                <Input
                  id="service-key"
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={serviceRoleKey}
                  onChange={(e) => setServiceRoleKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your Supabase dashboard under Settings → API → service_role key
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('welcome')} className="flex-1">
                  Back
                </Button>
                <Button 
                  onClick={handleRunSetup} 
                  disabled={!serviceRoleKey.trim()}
                  className="flex-1"
                >
                  Run Setup
                </Button>
              </div>

              <Button 
                variant="link" 
                className="w-full text-xs"
                onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open Supabase Dashboard
              </Button>
            </CardContent>
          </>
        )}

        {step === 'running' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
              <CardTitle>Setting Up Database</CardTitle>
              <CardDescription>
                Running migrations... This may take a moment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Creating tables...
                </p>
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Configuring security policies...
                </p>
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Setting up triggers...
                </p>
              </div>
            </CardContent>
          </>
        )}

        {step === 'create-admin' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Create Admin Account
              </CardTitle>
              <CardDescription>
                Set up the first administrator account for your CMS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm">
                <div className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-emerald-600 dark:text-emerald-400">
                    Database setup complete! Now create your admin account.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Full Name (optional)</Label>
                  <Input
                    id="admin-name"
                    type="text"
                    placeholder="John Doe"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="admin@example.com"
                      className="pl-10"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="admin-password"
                      type="password"
                      placeholder="Minimum 8 characters"
                      className="pl-10"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters long
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleSkipAdmin}
                  className="flex-1"
                >
                  Skip for now
                </Button>
                <Button 
                  onClick={handleCreateAdmin}
                  disabled={!adminEmail.trim() || adminPassword.length < 8}
                  className="flex-1"
                >
                  Create Admin
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 'creating-admin' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
              <CardTitle>Creating Admin Account</CardTitle>
              <CardDescription>
                Setting up your administrator account...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Creating user...
                </p>
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Assigning admin role...
                </p>
              </div>
            </CardContent>
          </>
        )}

        {step === 'success' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <CardTitle>Setup Complete!</CardTitle>
              <CardDescription>
                {result?.already_setup 
                  ? 'Your database was already configured.' 
                  : 'Your database and admin account are ready.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-medium">You're all set!</p>
                <p className="text-muted-foreground">
                  {adminEmail 
                    ? `Sign in with ${adminEmail} to access the admin dashboard.`
                    : 'Sign up to create your account and access the admin dashboard.'}
                </p>
              </div>
              <Button onClick={handleRefresh} className="w-full">
                Continue to App
              </Button>
            </CardContent>
          </>
        )}

        {step === 'manual' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Manual Setup
              </CardTitle>
              <CardDescription>
                Follow these steps to set up your database manually.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result?.error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
                  <p className="text-destructive font-medium">{result.error}</p>
                </div>
              )}

              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">1</span>
                  <div>
                    <p className="font-medium">Open Supabase Dashboard</p>
                    <p className="text-muted-foreground">Go to your project's SQL Editor</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">2</span>
                  <div>
                    <p className="font-medium">Run the Schema SQL</p>
                    <p className="text-muted-foreground">
                      Copy the contents of <code className="bg-muted px-1 rounded">supabase/schema.sql</code> and execute it
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">3</span>
                  <div>
                    <p className="font-medium">Create admin user</p>
                    <p className="text-muted-foreground">
                      Sign up in the app, then update user_roles to set role = 'admin'
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">4</span>
                  <div>
                    <p className="font-medium">Refresh this page</p>
                    <p className="text-muted-foreground">The app will detect the configured database</p>
                  </div>
                </li>
              </ol>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                  className="flex-1 gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Supabase
                </Button>
                <Button onClick={handleRefresh} className="flex-1">
                  Refresh Page
                </Button>
              </div>

              <Button 
                variant="ghost" 
                onClick={() => setStep('welcome')} 
                className="w-full"
              >
                Try auto-setup instead
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
