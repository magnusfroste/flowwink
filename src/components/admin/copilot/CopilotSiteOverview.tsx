import { useState } from 'react';
import { 
  Globe, 
  FileText, 
  Newspaper, 
  HelpCircle, 
  ChevronRight, 
  ChevronDown,
  Check,
  X,
  Loader2,
  ExternalLink,
  Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { SiteStructure, DiscoveredPage, DiscoveryStatus } from '@/hooks/useCopilot';

interface CopilotSiteOverviewProps {
  siteStructure: SiteStructure | null;
  discoveryStatus: DiscoveryStatus;
  onTogglePage: (url: string) => void;
  onStartMigration: () => void;
  isLoading: boolean;
}

type PageCategory = 'page' | 'blog' | 'kb';

const CATEGORY_CONFIG: Record<PageCategory, { label: string; icon: typeof FileText; color: string }> = {
  page: { label: 'Pages', icon: FileText, color: 'text-blue-500' },
  blog: { label: 'Blog Posts', icon: Newspaper, color: 'text-green-500' },
  kb: { label: 'Knowledge Base', icon: HelpCircle, color: 'text-purple-500' },
};

export function CopilotSiteOverview({
  siteStructure,
  discoveryStatus,
  onTogglePage,
  onStartMigration,
  isLoading,
}: CopilotSiteOverviewProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<PageCategory>>(
    new Set(['page', 'blog', 'kb'])
  );

  if (discoveryStatus === 'idle' || !siteStructure) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Globe className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium mb-2">Site Overview</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Enter a URL in the chat to analyze and discover all pages on a website.
        </p>
      </div>
    );
  }

  if (discoveryStatus === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <h3 className="text-lg font-medium mb-2">Analyzing Site...</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Scanning navigation, sitemap, and detecting content types.
        </p>
      </div>
    );
  }

  const toggleCategory = (category: PageCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Group pages by type
  const groupedPages = siteStructure.pages.reduce((acc, page) => {
    const type = page.type as PageCategory;
    if (!acc[type]) acc[type] = [];
    acc[type].push(page);
    return acc;
  }, {} as Record<PageCategory, DiscoveredPage[]>);

  const selectedCount = siteStructure.pages.filter(p => p.status === 'pending').length;
  const totalCount = siteStructure.pages.length;

  const selectAll = () => {
    siteStructure.pages.forEach(p => {
      if (p.status === 'skipped') onTogglePage(p.url);
    });
  };

  const deselectAll = () => {
    siteStructure.pages.forEach(p => {
      if (p.status === 'pending') onTogglePage(p.url);
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-background/50">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="font-medium truncate">{siteStructure.siteName}</h3>
          {siteStructure.platform !== 'unknown' && (
            <Badge variant="secondary" className="text-xs capitalize">
              {siteStructure.platform}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{selectedCount} of {totalCount} selected</span>
          <div className="flex gap-2">
            <button 
              onClick={selectAll}
              className="hover:text-foreground transition-colors"
            >
              Select all
            </button>
            <span>•</span>
            <button 
              onClick={deselectAll}
              className="hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Page tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {(['page', 'blog', 'kb'] as PageCategory[]).map(category => {
            const pages = groupedPages[category] || [];
            if (pages.length === 0) return null;

            const config = CATEGORY_CONFIG[category];
            const Icon = config.icon;
            const isExpanded = expandedCategories.has(category);
            const selectedInCategory = pages.filter(p => p.status === 'pending').length;

            return (
              <div key={category} className="mb-2">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Icon className={cn('h-4 w-4', config.color)} />
                  <span className="text-sm font-medium">{config.label}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {selectedInCategory}/{pages.length}
                  </Badge>
                </button>

                {isExpanded && (
                  <div className="ml-6 mt-1 space-y-1">
                    {pages.map(page => (
                      <PageItem
                        key={page.url}
                        page={page}
                        baseUrl={siteStructure.baseUrl}
                        onToggle={() => onTogglePage(page.url)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Action footer */}
      <div className="p-4 border-t bg-background/50">
        <Button 
          onClick={onStartMigration}
          disabled={selectedCount === 0 || isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Migrating...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Migrate {selectedCount} {selectedCount === 1 ? 'page' : 'pages'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface PageItemProps {
  page: DiscoveredPage;
  baseUrl: string;
  onToggle: () => void;
}

function PageItem({ page, baseUrl, onToggle }: PageItemProps) {
  const isSelected = page.status === 'pending';
  const isMigrating = page.status === 'migrating';
  const isCompleted = page.status === 'completed';

  const displayUrl = page.url.startsWith('http') 
    ? new URL(page.url).pathname 
    : page.url;

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors group',
        isSelected && 'bg-primary/10',
        isMigrating && 'bg-amber-500/10',
        isCompleted && 'bg-green-500/10 opacity-60',
        !isSelected && !isMigrating && !isCompleted && 'hover:bg-muted/50'
      )}
      onClick={onToggle}
    >
      {/* Status indicator */}
      <div className={cn(
        'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
        isSelected && 'bg-primary border-primary',
        isMigrating && 'border-amber-500',
        isCompleted && 'bg-green-500 border-green-500',
        !isSelected && !isMigrating && !isCompleted && 'border-muted-foreground/30'
      )}>
        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
        {isMigrating && <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />}
        {isCompleted && <Check className="h-3 w-3 text-white" />}
      </div>

      {/* Page info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {page.title || displayUrl}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {displayUrl}
        </p>
      </div>

      {/* Source badge */}
      <Badge variant="outline" className="text-[10px] capitalize opacity-50 group-hover:opacity-100">
        {page.source}
      </Badge>

      {/* External link */}
      <a
        href={page.url.startsWith('http') ? page.url : `${baseUrl}${page.url}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
      </a>
    </div>
  );
}
