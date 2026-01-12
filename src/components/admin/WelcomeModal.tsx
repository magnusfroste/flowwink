import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, LayoutTemplate, FileText, ArrowRight, Bot, Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePages } from '@/hooks/usePages';
import { useIsAIConfigured } from '@/hooks/useIntegrationStatus';

const WELCOME_KEY = 'cms-welcome-seen';
const WELCOME_DISMISSED_AT_KEY = 'cms-welcome-dismissed-at';
const RETRIGGER_DAYS = 7; // Re-show after 7 days if site is empty

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const { data: pages, isLoading } = usePages();
  const isAIConfigured = useIsAIConfigured();

  useEffect(() => {
    if (isLoading) return;

    const hasSeenWelcome = localStorage.getItem(WELCOME_KEY);
    const dismissedAtStr = localStorage.getItem(WELCOME_DISMISSED_AT_KEY);
    const pagesExist = pages && pages.length > 0;

    // If pages exist, never show the modal
    if (pagesExist) {
      return;
    }

    // First time user - show modal
    if (!hasSeenWelcome) {
      const timer = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(timer);
    }

    // Previously dismissed but site is now empty - check if enough time has passed
    if (dismissedAtStr) {
      const dismissedAt = new Date(dismissedAtStr);
      const now = new Date();
      const daysSinceDismissed = (now.getTime() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceDismissed >= RETRIGGER_DAYS) {
        const timer = setTimeout(() => setOpen(true), 500);
        return () => clearTimeout(timer);
      }
    }
  }, [pages, isLoading]);

  const handleClose = () => {
    localStorage.setItem(WELCOME_KEY, 'true');
    localStorage.setItem(WELCOME_DISMISSED_AT_KEY, new Date().toISOString());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 w-fit">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-serif">Welcome to the CMS</DialogTitle>
          <DialogDescription className="text-base">
            Choose how you want to build your site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* When AI is configured - show Copilot as primary */}
          {isAIConfigured ? (
            <>
              <Link
                to="/admin/copilot"
                onClick={handleClose}
                className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
              >
                <Bot className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm">AI Copilot</p>
                  <p className="text-sm text-muted-foreground">
                    Describe your site in plain language. AI builds it for you.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
              </Link>

              <Link
                to="/admin/templates"
                onClick={handleClose}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <LayoutTemplate className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Browse Templates</p>
                  <p className="text-sm text-muted-foreground">
                    Pick a ready-made design to customize.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              </Link>
            </>
          ) : (
            <>
              {/* When AI is NOT configured - show Templates as primary */}
              <Link
                to="/admin/templates"
                onClick={handleClose}
                className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
              >
                <LayoutTemplate className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Browse Templates</p>
                  <p className="text-sm text-muted-foreground">
                    Pick a professionally designed template. Works immediately.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-primary mt-1 shrink-0" />
              </Link>

              <Link
                to="/admin/integrations#ai"
                onClick={handleClose}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Bot className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Use AI Copilot</p>
                  <p className="text-sm text-muted-foreground">
                    Requires OpenAI or Gemini API key setup.
                  </p>
                </div>
                <Settings className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              </Link>
            </>
          )}

          <Link
            to="/admin/pages/new"
            onClick={handleClose}
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">Start Blank</p>
              <p className="text-sm text-muted-foreground">
                Build from scratch with full control.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
          </Link>

          <div className="pt-2">
            <Button variant="ghost" onClick={handleClose} className="w-full text-muted-foreground">
              Skip for now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
