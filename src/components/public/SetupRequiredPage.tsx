import { useState } from 'react';
import { Database, ExternalLink, RefreshCw, Server, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeoHead } from '@/components/public/SeoHead';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { DatabaseSetupWizard } from '@/components/admin/DatabaseSetupWizard';

export function SetupRequiredPage() {
  const [isRetrying, setIsRetrying] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const handleRetry = () => {
    setIsRetrying(true);
    window.location.reload();
  };

  const handleCopy = (text: string, item: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(item);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  // If Supabase IS configured but we still landed here, show the database setup wizard
  // (means env vars exist but database tables are missing)
  if (isSupabaseConfigured) {
    return <DatabaseSetupWizard />;
  }

  // Supabase is NOT configured - show instructions for adding env vars
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <SeoHead title="Setup Required" noIndex />
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-serif text-3xl font-bold mb-3">
            Welcome to FlowWink CMS
          </h1>
          <p className="text-muted-foreground">
            Let's connect your Supabase database to get started.
          </p>
        </div>

        {/* Step 1: Create Supabase Project */}
        <div className="bg-card border rounded-lg p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
              1
            </div>
            <div className="flex-1">
              <h2 className="font-medium mb-2">Create a Supabase Project</h2>
              <p className="text-sm text-muted-foreground mb-3">
                If you don't have one yet, create a free Supabase project.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Open Supabase Dashboard
              </Button>
            </div>
          </div>
        </div>

        {/* Step 2: Get API Keys */}
        <div className="bg-card border rounded-lg p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
              2
            </div>
            <div className="flex-1">
              <h2 className="font-medium mb-2">Get Your API Keys</h2>
              <p className="text-sm text-muted-foreground mb-3">
                In your Supabase project, go to <strong>Settings → API</strong> and copy:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 mb-3">
                <li>• <strong>Project URL</strong> (e.g., https://xxxxx.supabase.co)</li>
                <li>• <strong>anon public</strong> key (starts with eyJ...)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 3: Add Environment Variables */}
        <div className="bg-card border rounded-lg p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
              3
            </div>
            <div className="flex-1">
              <h2 className="font-medium mb-2 flex items-center gap-2">
                <Server className="h-4 w-4" />
                Add Environment Variables
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                In your hosting platform (Easypanel, Docker, etc.), add these as <strong>build arguments</strong>:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-muted rounded p-2">
                  <code className="text-xs flex-1 font-mono">VITE_SUPABASE_URL=https://your-project.supabase.co</code>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 w-7 p-0"
                    onClick={() => handleCopy('VITE_SUPABASE_URL=', 'url')}
                  >
                    {copiedItem === 'url' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center gap-2 bg-muted rounded p-2">
                  <code className="text-xs flex-1 font-mono">VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...</code>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 w-7 p-0"
                    onClick={() => handleCopy('VITE_SUPABASE_PUBLISHABLE_KEY=', 'key')}
                  >
                    {copiedItem === 'key' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                <strong>Easypanel:</strong> Go to your app → Build → Environment → Add build args
              </p>
            </div>
          </div>
        </div>

        {/* Step 4: Redeploy */}
        <div className="bg-card border rounded-lg p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
              4
            </div>
            <div className="flex-1">
              <h2 className="font-medium mb-2">Redeploy & Complete Setup</h2>
              <p className="text-sm text-muted-foreground">
                After adding the environment variables, trigger a new build/deploy. 
                The setup wizard will then help you create database tables and your admin account.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            onClick={handleRetry}
            disabled={isRetrying}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Checking...' : 'I\'ve Added the Variables'}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.open('https://github.com/magnusfroste/flowwink#self-hosting', '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Documentation
          </Button>
        </div>
      </div>
    </div>
  );
}
