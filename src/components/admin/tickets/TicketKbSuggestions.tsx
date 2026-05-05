import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface KbArticle { id: string; title: string; slug: string; question: string; answer_text: string | null }
interface TicketLite { id: string; subject: string; description: string | null; suggested_kb_article_ids?: string[] }

function tokenize(text: string): Set<string> {
  return new Set(
    (text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 3)
  );
}

export function TicketKbSuggestions({ ticket }: { ticket: TicketLite }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: articles = [] } = useQuery({
    queryKey: ['kb-articles-published'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles').select('id,title,slug,question,answer_text')
        .eq('is_published', true).limit(500);
      if (error) throw error;
      return (data ?? []) as KbArticle[];
    },
  });

  const ranked = useMemo(() => {
    const ticketTokens = tokenize(`${ticket.subject} ${ticket.description ?? ''}`);
    return articles
      .map((a) => {
        const tokens = tokenize(`${a.title} ${a.question} ${a.answer_text ?? ''}`);
        let overlap = 0;
        ticketTokens.forEach((t) => { if (tokens.has(t)) overlap++; });
        return { article: a, score: overlap };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [articles, ticket.subject, ticket.description]);

  const suggestedIds = ticket.suggested_kb_article_ids ?? [];

  const save = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('tickets')
        .update({ suggested_kb_article_ids: ids } as never).eq('id', ticket.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });

  const attachTop3 = async () => {
    setBusy(true);
    try {
      const ids = ranked.slice(0, 3).map((r) => r.article.id);
      await save.mutateAsync(ids);
    } finally { setBusy(false); }
  };

  const removeOne = (id: string) => save.mutate(suggestedIds.filter((x) => x !== id));

  const visible = articles.filter((a) => suggestedIds.includes(a.id));

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-medium">KB suggestions</h4>
        </div>
        <Button size="sm" variant="outline" onClick={attachTop3} disabled={busy || ranked.length === 0} className="h-7">
          <Sparkles className="h-3 w-3 mr-1" />Suggest top 3
        </Button>
      </div>

      {visible.length === 0 && ranked.length === 0 && (
        <p className="text-xs text-muted-foreground">No matching articles found.</p>
      )}

      {visible.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Attached:</p>
          {visible.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <a href={`/docs/${a.slug}`} target="_blank" rel="noreferrer" className="hover:underline flex-1 truncate">{a.title}</a>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeOne(a.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {visible.length === 0 && ranked.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Best matches:</p>
          {ranked.map((r) => (
            <div key={r.article.id} className="flex items-center gap-2 text-sm">
              <a href={`/docs/${r.article.slug}`} target="_blank" rel="noreferrer" className="hover:underline flex-1 truncate">{r.article.title}</a>
              <Badge variant="outline" className="text-[10px]">{r.score}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
