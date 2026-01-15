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
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SeoHead title="Setup Required" noIndex />
      <div className="text-center max-w-lg px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
          <Database className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-4">
          Database Not Configured
        </h1>
        <p className="text-muted-foreground mb-6">
          Run the setup script to configure your Supabase backend, then redeploy.
        </p>
        
        {/* Setup Instructions */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-left mb-4">
          <h2 className="font-medium mb-2 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            Run Setup Script
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Run this command in your project directory:
          </p>
          <div className="bg-background/50 rounded p-3 mb-3">
            <code className="text-sm font-mono">
              ./scripts/setup-supabase.sh
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            This will deploy edge functions, run migrations, create admin user, and give you env vars to paste into Easypanel.
          </p>
        </div>

        {/* What the script does */}
        <div className="bg-muted/50 rounded-lg p-4 text-left mb-6">
          <h2 className="font-medium mb-3">What the script does:</h2>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>✓ Deploys all 33 edge functions (~60 seconds)</li>
            <li>✓ Runs database migrations (creates tables, RLS policies)</li>
            <li>✓ Creates your admin user</li>
            <li>✓ Displays env vars ready to copy-paste</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            See <a href="https://github.com/magnusfroste/flowwink/blob/main/docs/SETUP.md" target="_blank" className="text-primary hover:underline">SETUP.md</a> for detailed instructions.
          </p>
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
