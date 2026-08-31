import { logger } from '@/lib/logger';
import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUiText } from '@/lib/ui-text';

interface ChatFeedbackProps {
  messageId: string;
  conversationId?: string;
  userQuestion?: string;
  aiResponse: string;
  contextPages?: string[];
  contextKbArticles?: string[];
  sessionId?: string;
}

export function ChatFeedback({
  messageId,
  conversationId,
  userQuestion,
  aiResponse,
  contextPages = [],
  contextKbArticles = [],
  sessionId,
}: ChatFeedbackProps) {
  const t = useUiText();
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFeedback = async (rating: 'positive' | 'negative') => {
    if (submitted || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      // Submit feedback to database
      const { error } = await supabase.from('chat_feedback').insert({
        message_id: messageId,
        conversation_id: conversationId,
        rating,
        user_question: userQuestion,
        ai_response: aiResponse,
        context_pages: contextPages,
        context_kb_articles: contextKbArticles,
        session_id: sessionId,
      });

      if (error) throw error;

      // Update KB article feedback counts if negative (RPC instead of edge function)
      if (rating === 'negative' && contextKbArticles.length > 0) {
        await supabase.rpc('bump_kb_article_feedback', {
          p_slugs: contextKbArticles,
          p_rating: rating,
        });
      }

      setSubmitted(rating);
      
      if (rating === 'positive') {
        toast.success(t('chat.feedback.saved', 'Thanks for your feedback!'));
      } else {
        toast.success(t('chat.feedback.improve', "Thanks! We'll use this to improve."));
      }
    } catch (error) {
      logger.error('Failed to submit feedback:', error);
      toast.error(t('chat.feedback.error', 'Could not save feedback'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {submitted === 'positive' ? (
          <ThumbsUp className="h-3 w-3 text-green-500 fill-green-500" />
        ) : (
          <ThumbsDown className="h-3 w-3 text-destructive fill-destructive" />
        )}
        <span>{t('chat.feedback.thanks', 'Thanks!')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-6 w-6 rounded-full",
          isSubmitting && "pointer-events-none opacity-50"
        )}
        onClick={() => handleFeedback('positive')}
        disabled={isSubmitting}
      >
        <ThumbsUp className="h-3 w-3 text-muted-foreground hover:text-green-500 transition-colors" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-6 w-6 rounded-full",
          isSubmitting && "pointer-events-none opacity-50"
        )}
        onClick={() => handleFeedback('negative')}
        disabled={isSubmitting}
      >
        <ThumbsDown className="h-3 w-3 text-muted-foreground hover:text-destructive transition-colors" />
      </Button>
    </div>
  );
}
