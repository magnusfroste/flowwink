import { useState } from 'react';
import { Plus, Sparkles, Calendar, Filter, LayoutGrid, List } from 'lucide-react';
import { useContentProposals, useDeleteProposal, useApproveProposal, ContentProposal } from '@/hooks/useContentProposals';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ContentProposalCard } from './ContentProposalCard';
import { ContentProposalPreview } from './ContentProposalPreview';
import { CreateProposalDialog } from './CreateProposalDialog';
import { AIProposalDialog } from './AIProposalDialog';

export function CampaignsDashboard() {
  const [selectedProposal, setSelectedProposal] = useState<ContentProposal | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: proposals, isLoading } = useContentProposals();
  const deleteProposal = useDeleteProposal();
  const approveProposal = useApproveProposal();

  const filteredProposals = proposals?.filter(p => 
    statusFilter === 'all' || p.status === statusFilter
  ) || [];

  const statusCounts = proposals?.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const handleDelete = async (id: string) => {
    if (confirm('Delete this proposal?')) {
      await deleteProposal.mutateAsync(id);
    }
  };

  const handleApprove = async (id: string) => {
    await approveProposal.mutateAsync(id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Content Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Create once, publish everywhere. AI-powered multi-channel content.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Manual
          </Button>
          <Button onClick={() => setShowAIDialog(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            AI Generate
          </Button>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="flex items-center justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">
              All <Badge variant="secondary" className="ml-1.5">{proposals?.length || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="draft">
              Drafts <Badge variant="secondary" className="ml-1.5">{statusCounts.draft || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved <Badge variant="secondary" className="ml-1.5">{statusCounts.approved || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="published">
              Published <Badge variant="secondary" className="ml-1.5">{statusCounts.published || 0}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filteredProposals.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="max-w-sm mx-auto space-y-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No campaigns yet</h3>
            <p className="text-sm text-muted-foreground">
              Create your first multi-channel content campaign with AI assistance.
            </p>
            <Button onClick={() => setShowAIDialog(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Generate with AI
            </Button>
          </div>
        </Card>
      ) : (
        <div className={viewMode === 'grid' 
          ? 'grid sm:grid-cols-2 lg:grid-cols-3 gap-4' 
          : 'space-y-3'
        }>
          {filteredProposals.map((proposal) => (
            <ContentProposalCard
              key={proposal.id}
              proposal={proposal}
              onSelect={setSelectedProposal}
              onApprove={handleApprove}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Preview Sheet */}
      <Sheet open={!!selectedProposal} onOpenChange={(open) => !open && setSelectedProposal(null)}>
        <SheetContent className="w-full sm:max-w-2xl p-0">
          {selectedProposal && (
            <ContentProposalPreview
              proposal={selectedProposal}
              onClose={() => setSelectedProposal(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <CreateProposalDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={(id) => {
          const proposal = proposals?.find(p => p.id === id);
          if (proposal) setSelectedProposal(proposal);
        }}
      />

      <AIProposalDialog
        open={showAIDialog}
        onOpenChange={setShowAIDialog}
        onSuccess={(id) => {
          const proposal = proposals?.find(p => p.id === id);
          if (proposal) setSelectedProposal(proposal);
        }}
      />
    </div>
  );
}
