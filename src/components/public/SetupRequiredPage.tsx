import { useState } from 'react';
import { Database, ExternalLink, RefreshCw, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeoHead } from '@/components/public/SeoHead';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { DatabaseSetupWizard } from '@/components/admin/DatabaseSetupWizard';

export function SetupRequiredPage() {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = () => {
    setIsRetrying(true);
    window.location.reload();
  };

  // If Supabase IS configured, show the database setup wizard
  if (isSupabaseConfigured) {
    return <DatabaseSetupWizard />;
  }

  // Supabase is NOT configured - show simple message with link to docs
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <SeoHead title="Setup Required" noIndex />
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
          <Database className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-3">
          Welcome to FlowWink CMS
        </h1>
        <p className="text-muted-foreground mb-6">
          This instance needs to be configured before use. 
          Please follow the self-hosting guide to set up your Supabase database connection.
        </p>

        <div className="bg-muted/50 rounded-lg p-4 mb-6 text-left">
          <h2 className="font-medium mb-2 text-sm">Required environment variables:</h2>
          <code className="text-xs block bg-background rounded p-2 mb-1 font-mono">
            VITE_SUPABASE_URL
          </code>
          <code className="text-xs block bg-background rounded p-2 font-mono">
            VITE_SUPABASE_PUBLISHABLE_KEY
          </code>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            onClick={() => window.open('https://github.com/magnusfroste/flowwink#self-hosting', '_blank')}
            className="gap-2"
          >
            <Github className="h-4 w-4" />
            View Setup Guide
          </Button>
          <Button 
            onClick={handleRetry}
            disabled={isRetrying}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Checking...' : 'Retry Connection'}
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
            className="gap-2 text-muted-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            Open Supabase Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
