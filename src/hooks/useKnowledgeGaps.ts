import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The knowledge gap report — what the assistant could NOT answer.
 *
 * The point of the loop: an agent must not invent. Only the owner knows whether
 * dogs are allowed in the café, so a question with nothing behind it should end
 * in "I don't know" — correct behaviour, and the strongest possible signal that
 * a knowledge base article is missing. This report is that signal, and the KB
 * article's Q&A shape means the visitor's own wording becomes the question.
 *
 * The engine is `knowledge_gap_report` (SQL). It pairs each visitor question
 * with the next assistant answer and reads that answer's grounding receipt.
 */
export interface ChatGap {
  at: string;
  question: string;
  state: 'ungrounded' | 'unknown' | 'unanswered';
  conversation_id: string | null;
  /** How the answer got its knowledge, when it had any. */
  mode: 'retrieval' | 'fulltext' | 'skill' | 'none' | null;
}

export interface EmailGap {
  at: string;
  subject: string | null;
  recipient: string | null;
  needs_person: boolean | null;
  thread_id: string | null;
  state: 'ungrounded' | 'unknown' | 'grounded';
}

export interface KnowledgeGapReport {
  success: boolean;
  since: string;
  days: number;
  chat: {
    questions: number;
    grounded: number;
    ungrounded: number;
    unknown: number;
    unanswered: number;
    top_sources: Array<{ title: string; table: string; hits: number }>;
    gaps: ChatGap[];
  };
  email: {
    drafts: number;
    needs_person: number;
    ungrounded: number;
    unknown: number;
    gaps: EmailGap[];
  };
  kb: { articles: number; published: number; in_chat: number; never_cited: number };
  reading_guide: string;
}

export function useKnowledgeGaps(days = 14, limit = 50) {
  return useQuery({
    queryKey: ['knowledge-gaps', days, limit],
    queryFn: async (): Promise<KnowledgeGapReport> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC added after the generated types
      const { data, error } = await supabase.rpc('knowledge_gap_report' as any, {
        p_days: days,
        p_limit: limit,
      });
      if (error) throw error;
      return data as unknown as KnowledgeGapReport;
    },
    staleTime: 5 * 60 * 1000,
  });
}
