import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AIAction = 'expand' | 'improve' | 'translate' | 'summarize' | 'continue';

interface GenerateOptions {
  text: string;
  action: AIAction;
  context?: string;
  targetLanguage?: string;
  tone?: 'professional' | 'friendly' | 'formal';
}

interface UseAITextGenerationReturn {
  generate: (options: GenerateOptions) => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
}

export function useAITextGeneration(): UseAITextGenerationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (options: GenerateOptions): Promise<string | null> => {
    const { text, action, context, targetLanguage, tone } = options;

    if (!text.trim()) {
      toast.error('Please enter some text first');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-text', {
        body: { text, action, context, targetLanguage, tone }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data?.generatedText || null;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate text';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { generate, isLoading, error };
}
