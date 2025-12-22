import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLead, useLeadActivities, useUpdateLead, useAddLeadNote, useQualifyLead } from '@/hooks/useLeads';
import { useAddLeadActivity, type ActivityType } from '@/hooks/useActivities';
import { getLeadStatusInfo, type LeadStatus } from '@/lib/lead-utils';
import { DealSection } from '@/components/admin/DealSection';
import { ActivityTimeline } from '@/components/admin/ActivityTimeline';
import { 
  ArrowLeft, Mail, Phone, Building, Calendar, Sparkles, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id);
  const { data: activities, isLoading: activitiesLoading } = useLeadActivities(id);
  const updateLead = useUpdateLead();
  const addNote = useAddLeadNote();
  const qualifyLead = useQualifyLead();
  const addActivity = useAddLeadActivity();
  const [note, setNote] = useState('');

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <p>Loading...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!lead) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p>Lead not found</p>
          <Button onClick={() => navigate('/admin/leads')}>
            Back to leads
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const statusInfo = getLeadStatusInfo(lead.status);

  const handleStatusChange = (newStatus: LeadStatus) => {
    updateLead.mutate({ 
      id: lead.id, 
      status: newStatus,
      needs_review: false,
    });
  };

  const handleAddNote = () => {
    if (!note.trim()) return;
    addNote.mutate({ leadId: lead.id, note });
    setNote('');
  };

  const handleQualify = () => {
    qualifyLead.mutate(lead.id);
  };

  const handleAddActivity = (activity: { type: ActivityType; title?: string; description?: string }) => {
    addActivity.mutate({
      leadId: lead.id,
      type: activity.type,
      metadata: {
        title: activity.title,
        description: activity.description,
      },
      points: activity.type === 'call' ? 10 : activity.type === 'meeting' ? 15 : activity.type === 'email' ? 5 : 0,
    });
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/leads')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to leads
        </Button>
      </div>
      
      <AdminPageHeader
        title={lead.name || lead.email}
        description={lead.company || 'Lead details'}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status & Actions */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select value={lead.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="opportunity">Opportunity</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Badge variant="outline" className="font-mono text-lg">
                  {lead.score} points
                </Badge>

                {lead.needs_review && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Needs Review
                  </Badge>
                )}

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleQualify}
                  disabled={qualifyLead.isPending}
                  className="ml-auto"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {qualifyLead.isPending ? 'Qualifying...' : 'AI Qualify'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary */}
          {lead.ai_summary && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{lead.ai_summary}</p>
                {lead.ai_qualified_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last qualified: {format(new Date(lead.ai_qualified_at), 'PPp')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deals Section */}
          <DealSection leadId={lead.id} />

          {/* Add Note */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Add Note</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Write a note..."
                  rows={2}
                  className="flex-1"
                />
                <Button 
                  onClick={handleAddNote}
                  disabled={!note.trim() || addNote.isPending}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <ActivityTimeline
            activities={activities || []}
            onAddActivity={handleAddActivity}
            isLoading={activitiesLoading}
            title="Activity History"
            description="All interactions with this lead"
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${lead.email}`} className="text-sm hover:underline">
                  {lead.email}
                </a>
              </div>
              
              {lead.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${lead.phone}`} className="text-sm hover:underline">
                    {lead.phone}
                  </a>
                </div>
              )}
              
              {lead.company && (
                <div className="flex items-center gap-3">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{lead.company}</span>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Created {format(new Date(lead.created_at), 'PPP')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Source Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Source</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">{lead.source}</Badge>
              {lead.source_id && (
                <p className="text-xs text-muted-foreground mt-2">
                  ID: {lead.source_id}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
