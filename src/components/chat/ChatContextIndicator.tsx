import { FileText, BookOpen, Sparkles } from 'lucide-react';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { usePages } from '@/hooks/usePages';
import { useKbStats } from '@/hooks/useKnowledgeBase';
import { cn } from '@/lib/utils';

interface ChatContextIndicatorProps {
  variant?: 'compact' | 'detailed';
  className?: string;
}

export function ChatContextIndicator({ 
  variant = 'compact',
  className 
}: ChatContextIndicatorProps) {
  const { data: settings } = useChatSettings();
  const { data: pages } = usePages();
  const { data: kbStats } = useKbStats();

  // Only show if enabled in settings and there's context
  if (!settings?.showContextIndicator) return null;
  if (!settings.includeContentAsContext && !settings.includeKbArticles) return null;

  // Calculate page count
  let pageCount = 0;
  if (settings.includeContentAsContext && pages) {
    const publishedPages = pages.filter(p => p.status === 'published');
    if (settings.includedPageSlugs?.includes('*')) {
      pageCount = publishedPages.length;
    } else if (settings.includedPageSlugs?.length) {
      pageCount = settings.includedPageSlugs.length;
    }
  }

  // Get KB article count
  const articleCount = settings.includeKbArticles ? (kbStats?.articles ?? 0) : 0;

  // Don't show if nothing to display
  if (pageCount === 0 && articleCount === 0) return null;

  if (variant === 'detailed') {
    return (
      <div className={cn(
        'flex items-center gap-3 px-4 py-2 bg-primary/5 border-b text-xs text-muted-foreground',
        className
      )}>
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span>AI has access to:</span>
        {pageCount > 0 && (
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </span>
        )}
        {pageCount > 0 && articleCount > 0 && <span>•</span>}
        {articleCount > 0 && (
          <span className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {articleCount} {articleCount === 1 ? 'article' : 'articles'}
          </span>
        )}
      </div>
    );
  }

  // Compact variant - just a small badge
  const parts: string[] = [];
  if (pageCount > 0) parts.push(`${pageCount} pages`);
  if (articleCount > 0) parts.push(`${articleCount} articles`);

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-[11px] text-primary font-medium',
      className
    )}>
      <Sparkles className="h-3 w-3" />
      <span>{parts.join(' • ')}</span>
    </div>
  );
}
