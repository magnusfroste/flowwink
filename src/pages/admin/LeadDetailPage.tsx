import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useLead, useLeadActivities, useUpdateLead, useAddLeadNote, useQualifyLead } from '@/hooks/useLeads';
import { useCompanies, useCreateCompany } from '@/hooks/useCompanies';
import { useAddLeadActivity, type ActivityType } from '@/hooks/useActivities';
import { getLeadStatusInfo, type LeadStatus } from '@/lib/lead-utils';
import { DealSection } from '@/components/admin/DealSection';
import { ActivityTimeline } from '@/components/admin/ActivityTimeline';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ArrowLeft, Mail, Phone, Building, Calendar, Sparkles, AlertCircle, Check, ChevronsUpDown, X, Plus, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id);
  const { data: activities, isLoading: activitiesLoading } = useLeadActivities(id);
  const { data: companies } = useCompanies();
  const createCompany = useCreateCompany();
  const updateLead = useUpdateLead();
  const addNote = useAddLeadNote();
  const qualifyLead = useQualifyLead();
  const addActivity = useAddLeadActivity();
  const [note, setNote] = useState('');
  const [companyOpen, setCompanyOpen] = useState(false);
  const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyDomain, setNewCompanyDomain] = useState('');
  const [newCompanyIndustry, setNewCompanyIndustry] = useState('');
  const [newCompanySize, setNewCompanySize] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');
  const [newCompanyAddress, setNewCompanyAddress] = useState('');
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('');
  const [newCompanyNotes, setNewCompanyNotes] = useState('');
  const [isEnrichingInline, setIsEnrichingInline] = useState(false);
  const [showEnrichedFields, setShowEnrichedFields] = useState(false);

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
          <p>Contact not found</p>
          <Button onClick={() => navigate('/admin/contacts')}>
            Back to contacts
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const statusInfo = getLeadStatusInfo(lead.status);
  const companyName = lead.companies?.name;

  const handleCompanyChange = (companyId: string | null) => {
    updateLead.mutate({ 
      id: lead.id, 
      company_id: companyId,
    });
    setCompanyOpen(false);
    setShowNewCompanyForm(false);
  };

  const handleEnrichInline = async () => {
    if (!newCompanyDomain.trim()) {
      toast.error('Ange en domän för att berika');
      return;
    }
    
    setIsEnrichingInline(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-company', {
        body: { domain: newCompanyDomain.trim() }
      });
      
      if (error) throw error;
      
      if (data?.success && data?.data) {
        const enrichedData = data.data;
        if (enrichedData.industry) setNewCompanyIndustry(enrichedData.industry);
        if (enrichedData.size) setNewCompanySize(enrichedData.size);
        if (enrichedData.phone) setNewCompanyPhone(enrichedData.phone);
        if (enrichedData.address) setNewCompanyAddress(enrichedData.address);
        if (enrichedData.website) setNewCompanyWebsite(enrichedData.website);
        if (enrichedData.description) setNewCompanyNotes(enrichedData.description);
        setShowEnrichedFields(true);
        toast.success('Företagsinformation hämtad');
      } else {
        toast.error('Kunde inte hämta företagsinformation');
      }
    } catch (error) {
      console.error('Enrichment failed:', error);
      toast.error('Kunde inte hämta företagsinformation');
    } finally {
      setIsEnrichingInline(false);
    }
  };

  const resetNewCompanyForm = () => {
    setNewCompanyName('');
    setNewCompanyDomain('');
    setNewCompanyIndustry('');
    setNewCompanySize('');
    setNewCompanyPhone('');
    setNewCompanyAddress('');
    setNewCompanyWebsite('');
    setNewCompanyNotes('');
    setShowEnrichedFields(false);
    setShowNewCompanyForm(false);
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return;
    
    // Check if we have enriched data
    const hasEnrichedData = newCompanyIndustry || newCompanySize || newCompanyPhone || newCompanyAddress || newCompanyWebsite;
    
    createCompany.mutate(
      {
        name: newCompanyName.trim(),
        domain: newCompanyDomain.trim() || null,
        industry: newCompanyIndustry.trim() || null,
        size: newCompanySize.trim() || null,
        address: newCompanyAddress.trim() || null,
        phone: newCompanyPhone.trim() || null,
        website: newCompanyWebsite.trim() || null,
        notes: newCompanyNotes.trim() || null,
        created_by: null,
        enriched_at: hasEnrichedData ? new Date().toISOString() : null,
      },
      {
        onSuccess: (newCompany) => {
          handleCompanyChange(newCompany.id);
          resetNewCompanyForm();
        },
      }
    );
  };

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
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/contacts')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to contacts
        </Button>
      </div>
      
      <AdminPageHeader
        title={lead.name || lead.email}
        description={companyName || 'Contact details'}
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
                      <SelectItem value="lead">Contact</SelectItem>
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
            description="All interactions with this contact"
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
              
              <div className="flex items-start gap-3">
                <Building className="h-4 w-4 text-muted-foreground mt-2" />
                <div className="flex-1">
                  <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={companyOpen}
                        className="w-full justify-between h-auto min-h-9 py-2"
                      >
                        {lead.companies ? (
                          <span className="truncate">{lead.companies.name}</span>
                        ) : (
                          <span className="text-muted-foreground">Select company...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      {showNewCompanyForm ? (
                        <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Nytt företag</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={resetNewCompanyForm}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <Input
                            placeholder="Företagsnamn *"
                            value={newCompanyName}
                            onChange={(e) => setNewCompanyName(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Input
                              placeholder="Domän (t.ex. acme.com)"
                              value={newCompanyDomain}
                              onChange={(e) => setNewCompanyDomain(e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={handleEnrichInline}
                              disabled={!newCompanyDomain.trim() || isEnrichingInline}
                              title="Berika med AI"
                            >
                              {isEnrichingInline ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          
                          {showEnrichedFields && (
                            <div className="space-y-3 pt-2 border-t">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Bransch</Label>
                                  <Select value={newCompanyIndustry} onValueChange={setNewCompanyIndustry}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Välj..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="IT & Teknik">IT & Teknik</SelectItem>
                                      <SelectItem value="Finans & Försäkring">Finans & Försäkring</SelectItem>
                                      <SelectItem value="Detaljhandel">Detaljhandel</SelectItem>
                                      <SelectItem value="Tillverkning">Tillverkning</SelectItem>
                                      <SelectItem value="Hälsa & Sjukvård">Hälsa & Sjukvård</SelectItem>
                                      <SelectItem value="Utbildning">Utbildning</SelectItem>
                                      <SelectItem value="Konsulttjänster">Konsulttjänster</SelectItem>
                                      <SelectItem value="Media & Underhållning">Media & Underhållning</SelectItem>
                                      <SelectItem value="Bygg & Fastighet">Bygg & Fastighet</SelectItem>
                                      <SelectItem value="Övrigt">Övrigt</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Storlek</Label>
                                  <Select value={newCompanySize} onValueChange={setNewCompanySize}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Välj..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1-10">1-10 anställda</SelectItem>
                                      <SelectItem value="11-50">11-50 anställda</SelectItem>
                                      <SelectItem value="51-200">51-200 anställda</SelectItem>
                                      <SelectItem value="201-500">201-500 anställda</SelectItem>
                                      <SelectItem value="501+">501+ anställda</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Telefon</Label>
                                <Input
                                  placeholder="Telefonnummer"
                                  value={newCompanyPhone}
                                  onChange={(e) => setNewCompanyPhone(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Webbplats</Label>
                                <Input
                                  placeholder="https://..."
                                  value={newCompanyWebsite}
                                  onChange={(e) => setNewCompanyWebsite(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Adress</Label>
                                <Input
                                  placeholder="Adress"
                                  value={newCompanyAddress}
                                  onChange={(e) => setNewCompanyAddress(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Beskrivning</Label>
                                <Textarea
                                  placeholder="Företagsbeskrivning..."
                                  value={newCompanyNotes}
                                  onChange={(e) => setNewCompanyNotes(e.target.value)}
                                  rows={2}
                                  className="text-xs"
                                />
                              </div>
                            </div>
                          )}
                          
                          <Button
                            className="w-full"
                            size="sm"
                            onClick={handleCreateCompany}
                            disabled={!newCompanyName.trim() || createCompany.isPending}
                          >
                            {createCompany.isPending ? 'Skapar...' : 'Skapa & länka'}
                          </Button>
                        </div>
                      ) : (
                        <Command>
                          <CommandInput placeholder="Search companies..." />
                          <CommandList>
                            <CommandEmpty>No company found.</CommandEmpty>
                            <CommandGroup>
                              {companies?.map((company) => (
                                <CommandItem
                                  key={company.id}
                                  value={company.name}
                                  onSelect={() => handleCompanyChange(company.id)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      lead.company_id === company.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{company.name}</span>
                                    {company.domain && (
                                      <span className="text-xs text-muted-foreground">{company.domain}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            <CommandSeparator />
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => setShowNewCompanyForm(true)}
                                className="text-primary"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Create new company
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      )}
                    </PopoverContent>
                  </Popover>
                  {lead.companies && (
                    <div className="flex items-center gap-2 mt-2">
                      <Link 
                        to={`/admin/companies/${lead.companies.id}`}
                        className="text-xs hover:underline text-primary"
                      >
                        View company
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleCompanyChange(null)}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Unlink
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
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
