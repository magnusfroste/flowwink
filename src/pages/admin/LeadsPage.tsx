import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLeads, useLeadStats } from '@/hooks/useLeads';
import { useDealStats } from '@/hooks/useDeals';
import { formatPrice } from '@/hooks/useProducts';
import { getLeadStatusInfo, type LeadStatus } from '@/lib/lead-utils';
import { useExportLeads, useImportLeads } from '@/hooks/useCsvImportExport';
import { CsvImportDialog } from '@/components/admin/CsvImportDialog';
import { Users, TrendingUp, UserCheck, AlertCircle, Sparkles, Plus, Briefcase, Target, Trophy, XCircle, Download, Upload, MoreVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CreateLeadDialog } from '@/components/admin/CreateLeadDialog';

export default function LeadsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('pipeline');
  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const { data: dealStats, isLoading: dealStatsLoading } = useDealStats();
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: reviewLeads } = useLeads({ needsReview: true });
  const navigate = useNavigate();
  const exportLeads = useExportLeads();
  const importLeads = useImportLeads();

  const handleExport = () => {
    if (leads && leads.length > 0) {
      exportLeads(leads);
    }
  };

  const handleImport = async (file: File) => {
    return await importLeads.mutateAsync(file);
  };

  const statCards = [
    { label: 'Total', value: stats?.total || 0, icon: Users, color: 'text-foreground' },
    { label: 'Contacts', value: stats?.leads || 0, icon: TrendingUp, color: 'text-blue-500' },
    { label: 'Opportunities', value: stats?.opportunities || 0, icon: Sparkles, color: 'text-amber-500' },
    { label: 'Customers', value: stats?.customers || 0, icon: UserCheck, color: 'text-green-500' },
  ];

  const pipelineStages: LeadStatus[] = ['lead', 'opportunity', 'customer'];

  const getLeadsByStatus = (status: LeadStatus) => {
    return leads?.filter(l => l.status === status) || [];
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Contacts"
          description="Manage contacts and view pipeline"
        >
          <div className="flex items-center gap-2">
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
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Contact
            </Button>
          </div>
        </AdminPageHeader>

      <CreateLeadDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
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
          <Card key={stat.label}>
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
                  {dealStatsLoading ? '...' : formatPrice(dealStats.totalPipeline)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Proposal</p>
                  <p className="font-medium">{formatPrice(dealStats.proposal.value)}</p>
                  <p className="text-xs text-muted-foreground">{dealStats.proposal.count} deals</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Negotiation</p>
                  <p className="font-medium">{formatPrice(dealStats.negotiation.value)}</p>
                  <p className="text-xs text-muted-foreground">{dealStats.negotiation.count} deals</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Won</p>
                  <p className="font-medium">{formatPrice(dealStats.closed_won.value)}</p>
                  <p className="text-xs text-muted-foreground">{dealStats.closed_won.count} deals</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Lost</p>
                  <p className="font-medium">{formatPrice(dealStats.closed_lost.value)}</p>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="all">All Contacts</TabsTrigger>
          <TabsTrigger value="review" className="relative">
            Needs Review
            {(reviewLeads?.length || 0) > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                {reviewLeads?.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pipelineStages.map((status) => {
              const stageLeads = getLeadsByStatus(status);
              const statusInfo = getLeadStatusInfo(status);
              
              return (
                <div key={status} className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <div className={cn("h-3 w-3 rounded-full", statusInfo.color)} />
                    <h3 className="font-medium">{statusInfo.label}</h3>
                    <Badge variant="secondary" className="ml-auto">
                      {stageLeads.length}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 min-h-[200px]">
                    {leadsLoading ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : stageLeads.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No contacts</p>
                    ) : (
                      stageLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          onClick={() => navigate(`/admin/contacts/${lead.id}`)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>All Contacts</CardTitle>
              <CardDescription>Sorted by score</CardDescription>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <p>Loading...</p>
              ) : !leads?.length ? (
                <p className="text-muted-foreground">No contacts yet</p>
              ) : (
                <div className="space-y-2">
                  {leads.map((lead) => (
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
  };
  showStatus?: boolean;
  onClick?: () => void;
}

function LeadCard({ lead, showStatus, onClick }: LeadCardProps) {
  const statusInfo = getLeadStatusInfo(lead.status);
  // Display company name from linked company, fallback to text field for legacy data
  const companyName = lead.companies?.name || lead.company;

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-colors",
        lead.needs_review && "border-amber-500/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
