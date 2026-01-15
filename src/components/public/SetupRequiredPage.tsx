import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Database, ExternalLink, Terminal, RefreshCw, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeoHead } from '@/components/public/SeoHead';
import { DatabaseSetupWizard } from '@/components/admin/DatabaseSetupWizard';

export function SetupRequiredPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Check for ?setup=true URL parameter to force wizard display (dev mode)
  const forceSetup = searchParams.get('setup') === 'true';

  useEffect(() => {
    if (forceSetup) {
      setShowWizard(true);
    }
  }, [forceSetup]);

  const handleRetry = () => {
    setIsRetrying(true);
    window.location.reload();
  };

  // Show the setup wizard if user chose auto-setup or ?setup=true
  if (showWizard) {
    return <DatabaseSetupWizard />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SeoHead title="Setup Required" noIndex />
      <div className="text-center max-w-lg px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
          <Database className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-4">
          Setup Required
        </h1>
        <p className="text-muted-foreground mb-6">
          FlowWink requires edge functions to be deployed before the setup wizard can run.
        </p>
        
        {/* Prerequisites Warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-left mb-4">
          <h2 className="font-medium mb-2 flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Terminal className="h-4 w-4" />
            Edge Functions Required
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Before using the setup wizard, you must deploy edge functions via Supabase CLI:
          </p>
          <div className="bg-background/50 rounded p-3 mb-3">
            <code className="text-xs block space-y-1">
              <div className="text-muted-foreground"># Install Supabase CLI</div>
              <div>npm install -g supabase</div>
              <div className="text-muted-foreground"># Login and link</div>
              <div>supabase login</div>
              <div>supabase link --project-ref YOUR_PROJECT_REF</div>
              <div className="text-muted-foreground"># Deploy essential functions</div>
              <div>supabase functions deploy setup-database</div>
              <div>supabase functions deploy get-page</div>
              <div>supabase functions deploy track-page-view</div>
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            Once deployed, refresh this page and the setup wizard will be available.
          </p>
        </div>

        {/* Auto Setup Option */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-left mb-4">
          <h2 className="font-medium mb-2 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Setup Wizard (After Edge Functions)
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            After deploying edge functions, use the wizard to create database tables and admin user.
          </p>
          <Button onClick={() => setShowWizard(true)} className="w-full gap-2">
            <Wand2 className="h-4 w-4" />
            Start Setup Wizard
          </Button>
        </div>

        {/* Full Manual Setup */}
        <div className="bg-muted/50 rounded-lg p-4 text-left mb-6">
          <h2 className="font-medium mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Complete Setup Steps
          </h2>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Create a Supabase project at supabase.com</li>
            <li>Install Supabase CLI: <code className="bg-muted px-1 rounded">npm install -g supabase</code></li>
            <li>Deploy edge functions (see above)</li>
            <li>Set environment variables in your hosting platform</li>
            <li>Run <code className="bg-muted px-1 rounded">schema.sql</code> in SQL Editor or use setup wizard</li>
            <li>Refresh this page</li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            onClick={handleRetry}
            disabled={isRetrying}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Connecting...' : 'Retry Connection'}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.open('https://github.com/magnusfroste/flowwink/blob/main/docs/DEPLOYMENT.md', '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Deployment Guide
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/auth')}
          >
            Try Login
          </Button>
        </div>
      </div>
    </div>
  );
}
