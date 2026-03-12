import { useState } from 'react';
import { toast } from 'sonner';
import { useChatSettings } from './useSiteSettings';

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

// Build the user message for each action.
// Instruction is in the user message — not overriding the system prompt —
// so FlowPilot's soul, brand voice, and objectives remain active.
function buildUserMessage(options: GenerateOptions): string {
  const { text, action, context, targetLanguage } = options;
  const contextPrefix = context ? `[Page context: "${context}"]\n\n` : '';

  const instructions: Record<AIAction, string> = {
    expand:    `${contextPrefix}Please expand the following into a well-written paragraph that fits this site's brand voice. Return ONLY the expanded text, no explanations:\n\n${text}`,
    improve:   `${contextPrefix}Please improve the following text for clarity, grammar, and flow while preserving its meaning and this site's brand voice. Return ONLY the improved text, no explanations:\n\n${text}`,
    translate: `${contextPrefix}Please translate the following text to ${targetLanguage || 'English'}. Return ONLY the translation, no explanations:\n\n${text}`,
    summarize: `${contextPrefix}Please summarize the following in 1-2 concise sentences. Return ONLY the summary, no explanations:\n\n${text}`,
    continue:  `${contextPrefix}Please continue the following text naturally with 2-3 more sentences, keeping the same style and tone. Return ONLY the continuation (not the original text), no explanations:\n\n${text}`,
  };

  return instructions[action];
}

export function useAITextGeneration(): UseAITextGenerationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: chatSettings } = useChatSettings();

  const generate = async (options: GenerateOptions): Promise<string | null> => {
    if (!options.text.trim()) {
      toast.error('Please enter some text first');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Route through FlowPilot (chat-completion) so brand voice, soul, and
      // objectives are applied — not a parallel AI pipeline.
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: buildUserMessage(options) }],
            settings: {
              aiProvider: chatSettings?.aiProvider || 'openai',
              // No systemPrompt override — let FlowPilot's soul be the intelligence
              toolCallingEnabled: false,
              includeContentAsContext: false,
              allowGeneralKnowledge: true,
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      // Accumulate SSE stream into plain text
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
          } catch { /* ignore malformed SSE frames */ }
        }
      }

      return fullContent.trim() || null;

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
