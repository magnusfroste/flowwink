import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, Sparkles, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePages } from '@/hooks/usePages';

const WELCOME_KEY = 'cms-welcome-seen';
const WELCOME_DISMISSED_AT_KEY = 'cms-welcome-dismissed-at';
const RETRIGGER_DAYS = 7; // Re-show after 7 days if site is empty

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const { data: pages, isLoading } = usePages();

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
            Get your site up and running in minutes with our Quick Start Guide.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Rocket className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Start with a template</p>
              <p className="text-sm text-muted-foreground">
                Choose from ready-made site templates with multiple pages, branding, and AI chat pre-configured.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Skip for now
            </Button>
            <Button asChild className="flex-1">
              <Link to="/admin/quick-start" onClick={handleClose}>
                Quick Start
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
