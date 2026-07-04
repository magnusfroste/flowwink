import { useState, useRef, useEffect } from 'react';
import { Mail, X, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'chat-lead-capture-state';

function readStoredState(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredState(value: 'dismissed' | 'submitted') {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage unavailable — the prompt simply reappears next visit.
  }
}

interface ChatLeadCaptureProps {
  /** Current conversation id (if one exists) so the lead gets associated. */
  conversationId?: string;
  className?: string;
}

/**
 * Dismissible inline email prompt shown after a visitor's first chat message.
 * Never blocks the conversation: submitting or dismissing hides it, and the
 * choice is remembered per browser. Creates/associates a CRM lead via the
 * `capture_chat_lead` RPC (anon-safe SECURITY DEFINER, source 'chat-widget').
 */
export function ChatLeadCapture({ conversationId, className }: ChatLeadCaptureProps) {
  const [hidden, setHidden] = useState(() => readStoredState() !== null);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (hidden) return null;

  const handleDismiss = () => {
    writeStoredState('dismissed');
    setHidden(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      // Pass the persistent pez_visitor_id so stitch_visitor_to_lead can
      // backfill this browser's entire page-view history onto the new lead.
      let visitorId: string | null = null;
      try {
        visitorId = localStorage.getItem('pez_visitor_id')
          ?? localStorage.getItem('chat-session-id');
      } catch {
        // ignore — RPC still creates the lead, just can't link browsing history
      }

      const { data, error: rpcError } = await supabase.rpc('capture_chat_lead', {
        p_email: trimmed,
        p_conversation_id: conversationId ?? undefined,
        p_session_id: visitorId ?? undefined,
      });

      if (rpcError) throw rpcError;
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        setError(result.error || 'Something went wrong. Please try again.');
        return;
      }

      writeStoredState('submitted');
      setSubmitted(true);
      // Show the thank-you briefly, then get out of the way.
      hideTimerRef.current = window.setTimeout(() => setHidden(true), 4000);
    } catch (err) {
      logger.error('Chat lead capture failed:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn('border-b bg-muted/40 px-3 py-2', className)}>
      {submitted ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span>Thanks! We&apos;ll be in touch.</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-1">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <p className="text-xs text-muted-foreground flex-1">
              Want us to follow up? Leave your email.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-8 text-sm"
              aria-label="Your email"
              disabled={isSubmitting}
            />
            <Button type="submit" size="sm" className="h-8 shrink-0" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                'Send'
              )}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}
