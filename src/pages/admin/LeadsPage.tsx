import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { LensToggle } from '@/components/admin/LensToggle';
import { useOwnershipLens } from '@/hooks/useOwnershipLens';
import { applyLens } from '@/lib/ownership';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeads, useLeadStats, useDeleteLead } from '@/hooks/useLeads';
import { useDealStats } from '@/hooks/useDeals';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { getLeadStatusInfo, type LeadStatus } from '@/lib/lead-utils';
import { useExportLeads, useImportLeads } from '@/hooks/useCsvImportExport';
import { CsvImportDialog } from '@/components/admin/CsvImportDialog';
import { Users, TrendingUp, UserCheck, AlertCircle, Sparkles, Plus, Briefcase, Target, Trophy, XCircle, Download, Upload, MoreVertical, UserSearch, X, Mail, Search, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CreateLeadDialog } from '@/components/admin/CreateLeadDialog';
import { LeadKanban } from '@/components/admin/leads/LeadKanban';
import { BulkLeadEmailDialog } from '@/components/admin/crm/BulkLeadEmailDialog';
import { SavedViewsMenu } from '@/components/admin/SavedViewsMenu';
import { useOverdueActivityIndex } from '@/hooks/useOverdueActivityIndex';
import { useLeadStatusOptions } from '@/hooks/usePipelineStages';
import { OwnerChip } from '@/components/admin/OwnerChip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOpenOnQueryParam } from '@/hooks/useOpenOnQueryParam';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadDemoDataButton } from '@/components/admin/LoadDemoDataButton';

export default function LeadsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  useOpenOnQueryParam('new', '1', () => setShowCreateDialog(true));
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showBulkEmailDialog, setShowBulkEmailDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('pipeline');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const { data: dealStats, isLoading: dealStatsLoading } = useDealStats();
  const { data: rawLeads, isLoading: leadsLoading } = useLeads();
  const { data: rawReviewLeads } = useLeads({ needsReview: true });
  const { lens, uid, coveredUids } = useOwnershipLens();
  // The lens narrows the lists only — stat cards keep showing everything.
  const leads = applyLens(rawLeads, 'leads', lens, uid, coveredUids);
  const reviewLeads = applyLens(rawReviewLeads, 'leads', lens, uid, coveredUids);
  // Free-text + status filtering for the All Contacts tab. Client-side over the
  // already-loaded list — same bounds as the rest of the page.
  const q = searchQuery.trim().toLowerCase();
  // Prospects (pre-leads from prospecting) live in their own tab; the default
  // views leave them out so a Hunter batch can't drown the contact list.
  const prospects = (leads ?? []).filter((l) => l.status === 'prospect');
  const contactLeads = (leads ?? []).filter((l) => l.status !== 'prospect');
  const filteredLeads = (statusFilter === 'prospect' ? prospects : contactLeads).filter((l) => {
    if (statusFilter !== 'all' && statusFilter !== 'prospect' && l.status !== statusFilter) return false;
    if (!q) return true;
    return [l.name, l.email, l.company, l.companies?.name]
      .some((f) => (f || '').toLowerCase().includes(q));
  });
  const isFiltering = q !== '' || statusFilter !== 'all';
  const navigate = useNavigate();
  const exportLeads = useExportLeads();
  const importLeads = useImportLeads();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const deleteLead = useDeleteLead();
  const statusOptions = useLeadStatusOptions();

  const promoteProspect = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('leads').update({ status: 'lead' }).eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was updated — you may not have permission.');
    },
    onSuccess: () => {
      toast.success('Promoted to contact');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
    onError: (e: Error) => toast.error(`Promote failed: ${e.message}`),
  });

  const deleteAllProspects = useMutation({
    mutationFn: async () => {
      const ids = prospects.map((p) => p.id);
      // Activities first (same order as single delete), then the rows — and
      // report what the database touched, not what we asked about.
      await supabase.from('lead_activities').delete().in('lead_id', ids);
      const { data, error } = await supabase.from('leads').delete().in('id', ids).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was deleted — you may not have permission.');
      return data.length;
    },
    onSuccess: (deleted) => {
      toast.success(`Deleted ${deleted} prospect${deleted === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkUpdateStatus = useMutation({
    mutationFn: async (status: LeadStatus) => {
      const ids = Array.from(selectedIds);
      // Bulk lost skips the per-record reason prompt (reason stays unspecified);
      // bulk re-open clears any stored lost reason, same as single-record paths.
      const updates = status === 'lost'
        ? { status }
        : { status, lost_reason: null, lost_note: null };
      // Report rows the database actually touched, not rows we asked about:
      // RLS filters the set silently, so ids.length would overcount.
      const { data, error } = await supabase.from('leads').update(updates).in('id', ids).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was updated — you may not have permission.');
      return { updated: data.length, requested: ids.length };
    },
    onSuccess: ({ updated, requested }, status) => {
      toast.success(
        `Updated ${updated} contact${updated === 1 ? '' : 's'} to ${status}` +
        (updated < requested ? ` — ${requested - updated} skipped (no permission)` : '')
      );
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
    onError: (e: Error) => toast.error(`Bulk update failed: ${e.message}`),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      // Same as above: RLS-denied deletes return success with 0 rows, so the
      // count has to come back from the database, not from the selection.
      const { data, error } = await supabase.from('leads').delete().in('id', ids).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was deleted — you may not have permission, or they are already gone.');
      return { deleted: data.length, requested: ids.length };
    },
    onSuccess: ({ deleted, requested }) => {
      toast.success(
        `Deleted ${deleted} contact${deleted === 1 ? '' : 's'}` +
        (deleted < requested ? ` — ${requested - deleted} skipped (no permission)` : '')
      );
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
    onError: (e: Error) => toast.error(`Bulk delete failed: ${e.message}`),
  });

  const { formatCurrency } = usePlatformFormat();

  const handleExport = () => {
    if (leads && leads.length > 0) {
      exportLeads(leads);
    }
  };

  const handleImport = async (file: File) => {
    return await importLeads.mutateAsync(file);
  };

  // Each card is also a filter: click jumps to All Contacts scoped to that status.
  const statCards = [
    { label: 'Total', value: stats?.total || 0, icon: Users, color: 'text-foreground', filter: 'all' },
    { label: 'New', value: stats?.leads || 0, icon: TrendingUp, color: 'text-primary', filter: 'lead' },
    { label: 'Opportunities', value: stats?.opportunities || 0, icon: Sparkles, color: 'text-warning', filter: 'opportunity' },
    { label: 'Customers', value: stats?.customers || 0, icon: UserCheck, color: 'text-success', filter: 'customer' },
  ];

  // pipeline column rendering now lives inside <LeadKanban /> (dynamic stages).


  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Contacts"
          description="Manage contacts and view pipeline"
        >
          <div className="flex items-center gap-2">
            <LensToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport} disabled={!leads?.length}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowBulkEmailDialog(true)}>
                  <Mail className="h-4 w-4 mr-2" />
                  Bulk email
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Contact
            </Button>
          </div>
        </AdminPageHeader>

      <CreateLeadDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <BulkLeadEmailDialog open={showBulkEmailDialog} onOpenChange={setShowBulkEmailDialog} />
      <CsvImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        title="Import Leads"
        description="Upload a CSV file to import leads. Existing leads with the same email will be updated."
        expectedColumns={['Email (required)', 'Name', 'Phone', 'Source', 'Status']}
        onImport={handleImport}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((stat) => (
          <Card
            key={stat.label}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() => { setActiveTab('all'); setStatusFilter(stat.filter); }}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className={cn("text-2xl font-bold", stat.color)}>
                    {statsLoading ? '-' : stat.value}
                  </p>
                </div>
                <stat.icon className={cn("h-8 w-8 opacity-50", stat.color)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Deal Pipeline Stats */}
      {dealStats && dealStats.totalPipeline > 0 && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Briefcase className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Deal Pipeline</p>
                <p className="text-2xl font-bold text-primary">
                  {dealStatsLoading ? '...' : formatCurrency(dealStats.totalPipeline)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Proposal</p>
                  <p className="font-medium">{formatCurrency(dealStats.proposal.value)}</p>
                  <p className="text-xs text-muted-foreground">{dealStats.proposal.count} deals</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Negotiation</p>
                  <p className="font-medium">{formatCurrency(dealStats.negotiation.value)}</p>
                  <p className="text-xs text-muted-foreground">{dealStats.negotiation.count} deals</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Won</p>
                  <p className="font-medium">{formatCurrency(dealStats.closed_won.value)}</p>
                  <p className="text-xs text-muted-foreground">{dealStats.closed_won.count} deals</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Lost</p>
                  <p className="font-medium">{formatCurrency(dealStats.closed_lost.value)}</p>
                  <p className="text-xs text-muted-foreground">{dealStats.closed_lost.count} deals</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Needs Review Alert */}
      {(reviewLeads?.length || 0) > 0 && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div className="flex-1">
                <p className="font-medium">
                  {reviewLeads?.length} contact{reviewLeads?.length !== 1 ? 's' : ''} need{reviewLeads?.length === 1 ? 's' : ''} review
                </p>
                <p className="text-sm text-muted-foreground">
                  AI could not determine status with sufficient confidence
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setActiveTab('review')}
              >
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* First-run empty state — surfaces demo seeder */}
      {!leadsLoading && (leads?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Leads are created automatically from forms and inbox scans. Load a set of demo contacts to explore the pipeline, AI scoring and review flow."
          action={
            <LoadDemoDataButton
              moduleId="leads"
              invalidateKeys={[['leads'], ['leadStats']]}
              label="Load demo contacts"
            />
          }
          secondaryAction={
            <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Contact
            </Button>
          }
        />
      ) : (
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="all">All Contacts</TabsTrigger>
            <TabsTrigger value="prospects" className="relative">
              Prospects
              {prospects.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {prospects.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="review" className="relative">
              Needs Review
              {(reviewLeads?.length || 0) > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                  {reviewLeads?.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <SavedViewsMenu
            scope="leads"
            currentConfig={{ activeTab, searchQuery, statusFilter }}
            activeViewId={activeViewId}
            onActiveViewChange={setActiveViewId}
            onApply={(cfg) => {
              if (typeof cfg.activeTab === 'string') setActiveTab(cfg.activeTab);
              setSearchQuery(typeof cfg.searchQuery === 'string' ? cfg.searchQuery : '');
              setStatusFilter(typeof cfg.statusFilter === 'string' ? cfg.statusFilter : 'all');
            }}
          />
        </div>

        <TabsContent value="pipeline" className="mt-6">
          <LeadKanban
            leads={contactLeads}
            isLoading={leadsLoading}
            onLeadClick={(id) => navigate(`/admin/contacts/${id}`)}
          />
        </TabsContent>

        <TabsContent value="all" className="mt-6 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email or company…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((o) => (
                  <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isFiltering && (
              <Button variant="ghost" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                {/* One click grabs everything the filter shows — filter down to
                    yesterday's prospecting batch, select all, delete. */}
                {selectedIds.size < filteredLeads.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set(filteredLeads.map((l) => l.id)))}
                  >
                    Select all {filteredLeads.length}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={(v) => bulkUpdateStatus.mutate(v as LeadStatus)}
                  disabled={bulkUpdateStatus.isPending}
                >
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue placeholder="Set status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((o) => (
                      <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={bulkDelete.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${selectedIds.size} contact(s)? This cannot be undone.`)) {
                      bulkDelete.mutate();
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>All Contacts</CardTitle>
              <CardDescription>
                {isFiltering ? `${filteredLeads.length} of ${leads?.length ?? 0} contacts` : 'Sorted by score'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <p>Loading...</p>
              ) : !leads?.length ? (
                <p className="text-muted-foreground">No contacts yet</p>
              ) : !filteredLeads.length ? (
                <p className="text-muted-foreground">No contacts match the current filter</p>
              ) : (
                <div className="space-y-2">
                  {filteredLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      showStatus
                      selected={selectedIds.has(lead.id)}
                      onToggleSelect={() => toggleId(lead.id)}
                      onClick={() => navigate(`/admin/contacts/${lead.id}`)}
                      onDelete={() => {
                        if (confirm(`Delete ${lead.name || lead.email}? This cannot be undone.`)) {
                          deleteLead.mutate(lead.id);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prospects" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Prospects</CardTitle>
                  <CardDescription>
                    Found by prospecting — promote the ones you'll pursue, delete the rest. They become contacts only when promoted.
                  </CardDescription>
                </div>
                {prospects.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteAllProspects.isPending}
                    onClick={() => {
                      if (confirm(`Delete all ${prospects.length} prospects? This cannot be undone.`)) {
                        deleteAllProspects.mutate();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete all {prospects.length}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!prospects.length ? (
                <p className="text-muted-foreground">No prospects awaiting triage</p>
              ) : (
                <div className="space-y-2">
                  {prospects.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onClick={() => navigate(`/admin/contacts/${lead.id}`)}
                      onPromote={() => promoteProspect.mutate(lead.id)}
                      onDelete={() => {
                        if (confirm(`Delete ${lead.name || lead.email}? This cannot be undone.`)) {
                          deleteLead.mutate(lead.id);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Needs Review</CardTitle>
              <CardDescription>AI could not determine status automatically</CardDescription>
            </CardHeader>
            <CardContent>
              {!reviewLeads?.length ? (
                <p className="text-muted-foreground">No contacts need review</p>
              ) : (
                <div className="space-y-2">
                  {reviewLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      showStatus
                      onClick={() => navigate(`/admin/contacts/${lead.id}`)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      )}
      </AdminPageContainer>
    </AdminLayout>
  );
}

interface LeadCardProps {
  lead: {
    id: string;
    email: string;
    name: string | null;
    company: string | null;
    company_id: string | null;
    companies: {
      id: string;
      name: string;
      domain: string | null;
    } | null;
    score: number;
    status: LeadStatus;
    ai_summary: string | null;
    needs_review: boolean;
    created_at: string;
    assigned_to?: string | null;
  };
  showStatus?: boolean;
  onClick?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  onDelete?: () => void;
  onPromote?: () => void;
}

function LeadCard({ lead, showStatus, onClick, selected, onToggleSelect, onDelete, onPromote }: LeadCardProps) {
  const statusInfo = getLeadStatusInfo(lead.status);
  // Display company name from linked company, fallback to text field for legacy data
  const companyName = lead.companies?.name || lead.company;
  const navigate = useNavigate();
  const { data: overdue } = useOverdueActivityIndex();
  const hasOverdue = overdue?.leadIds.has(lead.id) ?? false;

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-colors group relative overflow-hidden",
        lead.needs_review && "border-amber-500/50",
        selected && "ring-2 ring-primary",
        hasOverdue && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-destructive"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {onToggleSelect && (
            <div
              className="pt-1"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            >
              <Checkbox checked={selected} onCheckedChange={() => onToggleSelect()} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">
                {lead.name || lead.email}
              </p>
              {lead.needs_review && (
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              )}
            </div>
            {lead.name && (
              <p className="text-sm text-muted-foreground truncate">{lead.email}</p>
            )}
            {companyName && (
              <p className="text-sm text-muted-foreground">{companyName}</p>
            )}
            {lead.ai_summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {lead.ai_summary}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <OwnerChip entity="leads" recordId={lead.id} ownerId={lead.assigned_to} compact />
            <Badge variant="outline" className="font-mono">
              {lead.score}p
            </Badge>
            {showStatus && (
              <Badge className={cn("text-white", statusInfo.color)}>
                {statusInfo.label}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/admin/customer/${lead.id}`);
                }}
                title="Open Customer 360°"
              >
                <UserSearch className="h-3.5 w-3.5 mr-1" />
                360°
              </Button>
              {onPromote && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-success hover:text-success"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPromote();
                  }}
                  title="Promote to contact"
                >
                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                  Promote
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  title="Delete contact"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
