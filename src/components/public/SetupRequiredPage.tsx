import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, ExternalLink, Terminal, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeoHead } from '@/components/public/SeoHead';

export function SetupRequiredPage() {
  const navigate = useNavigate();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = () => {
    setIsRetrying(true);
    // Force a full page reload to re-attempt connection
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SeoHead title="Setup Required" noIndex />
      <div className="text-center max-w-lg px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-6">
          <Database className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-4">
          Database Setup Required
        </h1>
        <p className="text-muted-foreground mb-6">
          Unable to connect to the database. This usually means the application hasn't been fully configured yet.
        </p>
        
        <div className="bg-muted/50 rounded-lg p-4 text-left mb-6">
          <h2 className="font-medium mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Quick Setup Steps
          </h2>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Create a Supabase project at supabase.com</li>
            <li>Copy your project URL and anon key</li>
            <li>Add them to your <code className="bg-muted px-1 rounded">.env</code> file</li>
            <li>Run the database migrations</li>
            <li>Restart the application</li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            onClick={handleRetry}
            disabled={isRetrying}
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
