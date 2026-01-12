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
          Database Setup Required
        </h1>
        <p className="text-muted-foreground mb-6">
          Unable to connect to the database. This usually means the application hasn't been fully configured yet.
        </p>
        
        {/* Auto Setup Option */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-left mb-4">
          <h2 className="font-medium mb-2 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Automatic Setup (Recommended)
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Run the database setup wizard to automatically create all required tables and configurations.
          </p>
          <Button onClick={() => setShowWizard(true)} className="w-full gap-2">
            <Wand2 className="h-4 w-4" />
            Start Setup Wizard
          </Button>
        </div>

        {/* Manual Setup Option */}
        <div className="bg-muted/50 rounded-lg p-4 text-left mb-6">
          <h2 className="font-medium mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Manual Setup Steps
          </h2>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Create a Supabase project at supabase.com</li>
            <li>Copy your project URL and anon key</li>
            <li>Add them to your <code className="bg-muted px-1 rounded">.env</code> file</li>
            <li>Run <code className="bg-muted px-1 rounded">schema.sql</code> in SQL Editor</li>
            <li>Restart the application</li>
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
            onClick={() => window.open('https://docs.lovable.dev/tips-tricks/self-hosting', '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Setup Guide
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
