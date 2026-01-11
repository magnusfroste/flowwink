import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
}

interface FeedbackItem {
  id: string;
  rating: 'positive' | 'negative';
  user_question: string | null;
  ai_response: string | null;
  context_pages: string[] | null;
  context_kb_articles: string[] | null;
  created_at: string;
}

interface KbArticleWithFeedback {
  id: string;
  title: string;
  slug: string;
  negative_feedback_count: number;
  positive_feedback_count: number;
  needs_improvement: boolean;
}

export function useChatFeedbackStats() {
  return useQuery({
    queryKey: ['chat-feedback-stats'],
    queryFn: async (): Promise<FeedbackStats> => {
      const { data, error } = await supabase
        .from('chat_feedback')
        .select('rating');

      if (error) throw error;

      const total = data?.length || 0;
      const positive = data?.filter(f => f.rating === 'positive').length || 0;
      const negative = total - positive;

      return {
        total,
        positive,
        negative,
        positiveRate: total > 0 ? Math.round((positive / total) * 100) : 0,
      };
    },
  });
}

export function useChatFeedbackList(limit = 50) {
  return useQuery({
    queryKey: ['chat-feedback-list', limit],
    queryFn: async (): Promise<FeedbackItem[]> => {
      const { data, error } = await supabase
        .from('chat_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as FeedbackItem[];
    },
  });
}

export function useKbArticlesNeedingImprovement() {
  return useQuery({
    queryKey: ['kb-articles-needs-improvement'],
    queryFn: async (): Promise<KbArticleWithFeedback[]> => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('id, title, slug, negative_feedback_count, positive_feedback_count, needs_improvement')
        .eq('needs_improvement', true)
        .order('negative_feedback_count', { ascending: false });

      if (error) throw error;
      return data as KbArticleWithFeedback[];
    },
  });
}

export async function exportFeedbackForFineTuning() {
  const { data, error } = await supabase
    .from('chat_feedback')
    .select('user_question, ai_response, rating')
    .eq('rating', 'positive')
    .not('user_question', 'is', null)
    .not('ai_response', 'is', null);

  if (error) throw error;

  // Format for fine-tuning (OpenAI JSONL format)
  const jsonlData = data
    .filter(item => item.user_question && item.ai_response)
    .map(item => ({
      messages: [
        { role: 'user', content: item.user_question },
        { role: 'assistant', content: item.ai_response }
      ]
    }))
    .map(item => JSON.stringify(item))
    .join('\n');

  // Create and download file
  const blob = new Blob([jsonlData], { type: 'application/jsonl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-finetune-${new Date().toISOString().split('T')[0]}.jsonl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return data.length;
}
