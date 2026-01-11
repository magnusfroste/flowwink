import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

      // Update KB article feedback counts if negative
      if (rating === 'negative' && contextKbArticles.length > 0) {
        // Call edge function to update KB stats
        await supabase.functions.invoke('update-kb-feedback', {
          body: { 
            articleSlugs: contextKbArticles, 
            rating 
          }
        });
      }

      setSubmitted(rating);
      
      if (rating === 'positive') {
        toast.success('Tack för din feedback!');
      } else {
        toast.success('Tack! Vi använder detta för att förbättra.');
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast.error('Kunde inte spara feedback');
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
        <span>Tack!</span>
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
