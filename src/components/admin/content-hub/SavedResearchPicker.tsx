import { useState } from 'react';
import { format } from 'date-fns';
import { BookOpen, Trash2, ChevronDown, ChevronUp, Search, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SavedResearch, useSavedResearch } from '@/hooks/useSavedResearch';
import { ContentResearch } from '@/hooks/useContentResearch';
import { ChannelIcon } from './ChannelIcon';

interface SavedResearchPickerProps {
  onSelect: (research: ContentResearch, metadata: { topic: string; target_audience?: string; industry?: string; target_channels: string[] }) => void;
  onClose: () => void;
}

export function SavedResearchPicker({ onSelect, onClose }: SavedResearchPickerProps) {
  const { savedResearch, isLoading, deleteResearch, isDeleting } = useSavedResearch();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredResearch = savedResearch.filter(r => 
    r.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.target_audience?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (research: SavedResearch) => {
    onSelect(research.research_data, {
      topic: research.topic,
      target_audience: research.target_audience || undefined,
      industry: research.industry || undefined,
      target_channels: research.target_channels,
    });
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteResearch(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (savedResearch.length === 0) {
    return (
      <div className="text-center py-12">
        <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">No saved research yet</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Research will appear here after you save it
        </p>
        <Button variant="outline" onClick={onClose} className="mt-4">
          Start New Research
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search saved research..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3 pr-4">
          {filteredResearch.map((research) => (
            <Card 
              key={research.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{research.topic}</CardTitle>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{format(new Date(research.created_at), 'MMM d, yyyy')}</span>
                      {research.industry && (
                        <>
                          <span>•</span>
                          <span>{research.industry}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(expandedId === research.id ? null : research.id);
                      }}
                    >
                      {expandedId === research.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(research.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {research.target_channels.map((channel) => (
                    <Badge key={channel} variant="secondary" className="text-xs gap-1">
                      <ChannelIcon channel={channel} className="h-3 w-3" />
                      {channel}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              {expandedId === research.id && (
                <CardContent className="pt-0 pb-3 px-4 border-t">
                  <div className="space-y-3 mt-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Main Theme</p>
                      <p className="text-sm">{research.research_data.topic_analysis?.main_theme}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Content Angles ({research.research_data.content_angles?.length || 0})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {research.research_data.content_angles?.slice(0, 3).map((angle, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {angle.angle}
                          </Badge>
                        ))}
                        {(research.research_data.content_angles?.length || 0) > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{research.research_data.content_angles!.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => handleSelect(research)}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      Use This Research
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Research?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this saved research. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
