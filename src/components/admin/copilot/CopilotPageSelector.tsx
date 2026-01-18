import { useState } from 'react';
import { Check, X, ExternalLink, FileText, BookOpen, Library, AlertCircle, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface DiscoveredPageItem {
  url: string;
  path: string;
  slug: string;
  suggestedName: string;
  suggestedType: 'page' | 'blog' | 'kb' | 'skip';
  selected: boolean;
  isDuplicate?: boolean;
}

interface CopilotPageSelectorProps {
  pages: DiscoveredPageItem[];
  siteName: string;
  platform: string;
  onPagesChange: (pages: DiscoveredPageItem[]) => void;
  onStartMigration: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const TYPE_CONFIG = {
  page: { label: 'Page', icon: FileText, color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  blog: { label: 'Blog', icon: BookOpen, color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  kb: { label: 'KB', icon: Library, color: 'bg-green-500/10 text-green-600 border-green-200' },
  skip: { label: 'Skip', icon: AlertCircle, color: 'bg-muted text-muted-foreground border-muted' },
};

export function CopilotPageSelector({
  pages,
  siteName,
  platform,
  onPagesChange,
  onStartMigration,
  onCancel,
  isLoading,
}: CopilotPageSelectorProps) {
  const [filter, setFilter] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);
  
  const selectedCount = pages.filter(p => p.selected).length;
  const skipSuggested = pages.filter(p => p.suggestedType === 'skip');
  const mainPages = pages.filter(p => p.suggestedType !== 'skip');
  
  const filteredPages = (showSkipped ? pages : mainPages).filter(p => {
    if (!filter) return true;
    const searchLower = filter.toLowerCase();
    return p.suggestedName.toLowerCase().includes(searchLower) || 
           p.path.toLowerCase().includes(searchLower);
  });

  const togglePage = (url: string) => {
    onPagesChange(pages.map(p => 
      p.url === url ? { ...p, selected: !p.selected } : p
    ));
  };

  const selectAll = () => {
    onPagesChange(pages.map(p => ({ ...p, selected: p.suggestedType !== 'skip' })));
  };

  const deselectAll = () => {
    onPagesChange(pages.map(p => ({ ...p, selected: false })));
  };

  const selectOnlyPages = () => {
    onPagesChange(pages.map(p => ({ ...p, selected: p.suggestedType === 'page' })));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold">{siteName}</h3>
            <p className="text-xs text-muted-foreground">
              {platform !== 'unknown' && <Badge variant="outline" className="mr-2 text-xs">{platform}</Badge>}
              Found {pages.length} pages
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {selectedCount} selected
          </Badge>
        </div>
        
        {/* Search and filters */}
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter pages..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        
        {/* Quick actions */}
        <div className="flex gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs h-7">
            Deselect All
          </Button>
          <Button variant="ghost" size="sm" onClick={selectOnlyPages} className="text-xs h-7">
            Pages Only
          </Button>
        </div>
      </div>

      {/* Page list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredPages.map((page) => {
            const typeConfig = TYPE_CONFIG[page.suggestedType];
            const TypeIcon = typeConfig.icon;
            
            return (
              <label
                key={page.url}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                  page.selected ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50 border border-transparent',
                  page.suggestedType === 'skip' && !page.selected && 'opacity-60'
                )}
              >
                <Checkbox
                  checked={page.selected}
                  onCheckedChange={() => togglePage(page.url)}
                  className="shrink-0"
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{page.suggestedName}</span>
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', typeConfig.color)}>
                      <TypeIcon className="h-3 w-3 mr-1" />
                      {typeConfig.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">{page.path || '/'}</span>
                    <a 
                      href={page.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Show/hide skipped toggle */}
        {skipSuggested.length > 0 && !showSkipped && (
          <button
            onClick={() => setShowSkipped(true)}
            className="w-full p-3 text-center text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
          >
            <ChevronDown className="h-4 w-4" />
            Show {skipSuggested.length} suggested to skip
          </button>
        )}
        {showSkipped && skipSuggested.length > 0 && (
          <button
            onClick={() => setShowSkipped(false)}
            className="w-full p-3 text-center text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
          >
            <ChevronUp className="h-4 w-4" />
            Hide suggested to skip
          </button>
        )}
      </ScrollArea>

      {/* Footer actions */}
      <div className="p-3 border-t bg-muted/30 space-y-2">
        <div className="flex gap-2">
          <Button
            onClick={onStartMigration}
            disabled={selectedCount === 0 || isLoading}
            className="flex-1 gap-2"
          >
            <Check className="h-4 w-4" />
            Migrate {selectedCount} {selectedCount === 1 ? 'Page' : 'Pages'}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">
          You'll review each section before it's added
        </p>
      </div>
    </div>
  );
}
