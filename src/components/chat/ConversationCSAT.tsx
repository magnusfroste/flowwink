import { logger } from '@/lib/logger';
import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/lib/ui-text';
import { supabase } from '@/integrations/supabase/client';

interface ConversationCSATProps {
  conversationId: string;
}

/**
 * Conversation-level CSAT (binary thumbs).
 * Rendered in the visitor closed-conversation banner.
 * Anonymous insert is allowed by chat_feedback INSERT policy.
 */
export function ConversationCSAT({ conversationId }: ConversationCSATProps) {
  const t = useUiText();
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (rating: 'positive' | 'negative') => {
    if (submitted || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('chat_feedback').insert({
        conversation_id: conversationId,
        rating,
      });
      if (error) throw error;
      setSubmitted(rating);
    } catch (err) {
      logger.error('CSAT submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-xs text-muted-foreground">
        {t('chat.csat.thanks', 'Thanks for the feedback!')}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t('chat.csat.question', 'How was this chat?')}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full"
        disabled={submitting}
        onClick={() => submit('positive')}
        aria-label={t('chat.csat.good', 'Good')}
      >
        <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground hover:text-green-500 transition-colors" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full"
        disabled={submitting}
        onClick={() => submit('negative')}
        aria-label={t('chat.csat.bad', 'Bad')}
      >
        <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
      </Button>
    </div>
  );
}
