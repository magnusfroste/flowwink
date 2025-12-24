import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ArrowLeft, 
  Building2, 
  Globe, 
  Phone, 
  MapPin, 
  Users, 
  Mail,
  Pencil,
  Save,
  X,
  Plus,
  Sparkles,
  Loader2
} from 'lucide-react';
import { useCompany, useCompanyLeads, useUpdateCompany, useDeleteCompany } from '@/hooks/useCompanies';
import { CreateLeadDialog } from '@/components/admin/CreateLeadDialog';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { getLeadStatusInfo } from '@/lib/lead-utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: company, isLoading: companyLoading } = useCompany(id);
  const { data: leads, isLoading: leadsLoading } = useCompanyLeads(id);
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    domain: '',
    industry: '',
    size: '',
    website: '',
    phone: '',
    address: '',
    notes: '',
  });

  const handleEdit = () => {
    if (company) {
      setEditForm({
        name: company.name,
        domain: company.domain || '',
        industry: company.industry || '',
        size: company.size || '',
        website: company.website || '',
        phone: company.phone || '',
        address: company.address || '',
        notes: company.notes || '',
      });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!id) return;
    await updateCompany.mutateAsync({
      id,
      name: editForm.name,
      domain: editForm.domain || null,
      industry: editForm.industry || null,
      size: editForm.size || null,
      website: editForm.website || null,
      phone: editForm.phone || null,
      address: editForm.address || null,
      notes: editForm.notes || null,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteCompany.mutateAsync(id);
    navigate('/admin/companies');
  };

  const handleEnrich = async () => {
    if (!company?.domain) {
      toast.error('Ingen domän angiven för detta företag');
      return;
    }
    
    setIsEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-company', {
        body: { domain: company.domain }
      });
      
      if (error) throw error;
      
      if (data?.success && data?.data) {
        const enrichedData = data.data;
        
        await updateCompany.mutateAsync({
          id: company.id,
          industry: enrichedData.industry || company.industry,
          size: enrichedData.size || company.size,
          phone: enrichedData.phone || company.phone,
          address: enrichedData.address || company.address,
          website: enrichedData.website || company.website,
          notes: enrichedData.description 
            ? `${company.notes ? company.notes + '\n\n' : ''}AI-beskrivning: ${enrichedData.description}`
            : company.notes,
          enriched_at: new Date().toISOString(),
        });
        toast.success('Företagsinformation uppdaterad');
      } else {
        toast.error('Kunde inte hämta företagsinformation');
      }
    } catch (error) {
      console.error('Enrichment failed:', error);
      toast.error('Kunde inte hämta företagsinformation');
    } finally {
      setIsEnriching(false);
    }
  };

  if (companyLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!company) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Företaget hittades inte</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/admin/companies">Tillbaka till företag</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/companies">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{company.name}</h1>
              {company.domain && (
                <p className="text-muted-foreground">{company.domain}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  <X className="h-4 w-4 mr-2" />
                  Avbryt
                </Button>
                <Button onClick={handleSave} disabled={updateCompany.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Spara
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleEnrich}
                  disabled={isEnriching || !company.domain}
                  title={!company.domain ? 'Lägg till en domän för att kunna berika' : undefined}
                >
                  {isEnriching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Berika
                </Button>
                <Button variant="outline" onClick={handleEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Redigera
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Ta bort</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Ta bort företag?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Detta kommer ta bort företaget permanent. Kontakter kopplade till företaget behålls men förlorar sin koppling.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Avbryt</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Ta bort
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company Info */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Företagsinformation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label>Namn</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Domän</Label>
                    <Input
                      value={editForm.domain}
                      onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
                      placeholder="example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bransch</Label>
                    <Input
                      value={editForm.industry}
                      onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Storlek</Label>
                    <Input
                      value={editForm.size}
                      onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                      placeholder="1-10, 11-50, 51-200..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Webbplats</Label>
                    <Input
                      value={editForm.website}
                      onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefon</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Adress</Label>
                    <Textarea
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Anteckningar</Label>
                    <Textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  {company.industry && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{company.industry}</Badge>
                      {company.size && (
                        <Badge variant="outline">{company.size}</Badge>
                      )}
                    </div>
                  )}
                  
                  {company.website && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={company.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {company.website}
                      </a>
                    </div>
                  )}
                  
                  {company.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${company.phone}`} className="hover:underline">
                        {company.phone}
                      </a>
                    </div>
                  )}
                  
                  {company.address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground">{company.address}</span>
                    </div>
                  )}
                  
                  {company.notes && (
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {company.notes}
                      </p>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t text-xs text-muted-foreground space-y-1">
                    <p>Skapat: {format(new Date(company.created_at), 'd MMMM yyyy', { locale: sv })}</p>
                    <p>Uppdaterat: {format(new Date(company.updated_at), 'd MMMM yyyy', { locale: sv })}</p>
                    {company.enriched_at && (
                      <p className="flex items-center gap-1 text-primary">
                        <Sparkles className="h-3 w-3" />
                        Berikad: {format(new Date(company.enriched_at), 'd MMMM yyyy', { locale: sv })}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Contacts/Leads */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Kontakter ({leads?.length ?? 0})
              </CardTitle>
              <Button size="sm" onClick={() => setCreateLeadOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Lägg till kontakt
              </Button>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !leads?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>Inga kontakter kopplade till detta företag</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => setCreateLeadOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Lägg till första kontakten
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kontakt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Källa</TableHead>
                      <TableHead>Skapad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <Link 
                            to={`/admin/contacts/${lead.id}`}
                            className="flex flex-col hover:underline"
                          >
                            <span className="font-medium">{lead.name || 'Namnlös'}</span>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge className={getLeadStatusInfo(lead.status).color}>
                            {getLeadStatusInfo(lead.status).label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lead.source}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(lead.created_at), 'd MMM yyyy', { locale: sv })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateLeadDialog 
        open={createLeadOpen} 
        onOpenChange={setCreateLeadOpen}
        defaultCompanyId={id}
        defaultCompanyName={company.name}
      />
    </AdminLayout>
  );
}
