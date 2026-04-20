import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Building2, Users, Search, Globe, Phone, Sparkles, Download, Upload, MoreVertical, Trophy, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCompanies, useCompanyStats, useDeleteCompany } from '@/hooks/useCompanies';
import { useExportCompanies, useImportCompanies } from '@/hooks/useCsvImportExport';
import { CsvImportDialog } from '@/components/admin/CsvImportDialog';
import { CreateCompanyDialog } from '@/components/admin/CreateCompanyDialog';
import { format } from 'date-fns';
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

type LifecycleFilter = 'all' | 'prospect' | 'customer' | 'churned';

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('all');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { data: companies, isLoading } = useCompanies();
  const { data: stats } = useCompanyStats();
  const deleteCompany = useDeleteCompany();
  const exportCompanies = useExportCompanies();
  const importCompanies = useImportCompanies();

  const filteredCompanies = companies?.filter((company) => {
    const matchesSearch =
      company.name.toLowerCase().includes(search.toLowerCase()) ||
      company.domain?.toLowerCase().includes(search.toLowerCase()) ||
      company.industry?.toLowerCase().includes(search.toLowerCase());
    const matchesLifecycle = lifecycleFilter === 'all' || company.lifecycle_stage === lifecycleFilter;
    return matchesSearch && matchesLifecycle;
  });

  const handleExport = () => {
    if (companies && companies.length > 0) {
      exportCompanies(companies);
    }
  };

  const handleImport = async (file: File) => {
    return await importCompanies.mutateAsync(file);
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Companies"
          description="Manage companies and organizations in your CRM"
        >
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport} disabled={!companies?.length}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <CreateCompanyDialog />
          </div>
        </AdminPageHeader>

      <CsvImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        title="Import Companies"
        description="Upload a CSV file to import companies."
        expectedColumns={['Name (required)', 'Domain', 'Industry', 'Size', 'Website', 'Phone', 'Address']}
        onImport={handleImport}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer transition hover:bg-muted/30" onClick={() => setLifecycleFilter('all')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition hover:bg-muted/30" onClick={() => setLifecycleFilter('customer')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Trophy className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.customers ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition hover:bg-muted/30" onClick={() => setLifecycleFilter('prospect')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prospects</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.prospects ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.withContacts ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredCompanies?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No companies found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Customer Since</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies?.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <Link 
                            to={`/admin/companies/${company.id}`}
                            className="font-medium hover:underline"
                          >
                            {company.name}
                          </Link>
                          {company.domain && (
                            <span className="text-sm text-muted-foreground">
                              {company.domain}
                            </span>
                          )}
                        </div>
                        {company.enriched_at && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Sparkles className="h-4 w-4 text-primary/70" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Enriched {format(new Date(company.enriched_at), 'd MMM yyyy')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {company.lifecycle_stage === 'customer' ? (
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-primary/30">
                          <Trophy className="h-3 w-3 mr-1" /> Customer
                        </Badge>
                      ) : company.lifecycle_stage === 'churned' ? (
                        <Badge variant="outline" className="text-muted-foreground">Churned</Badge>
                      ) : (
                        <Badge variant="outline">Prospect</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {company.industry && (
                        <Badge variant="secondary">{company.industry}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {company.size && (
                        <span className="text-sm text-muted-foreground">
                          {company.size}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {company.website && (
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Globe className="h-4 w-4" />
                          </a>
                        )}
                        {company.phone && (
                          <a
                            href={`tel:${company.phone}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.customer_since
                        ? format(new Date(company.customer_since), 'd MMM yyyy')
                        : <span className="text-xs italic opacity-60">—</span>}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive">
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete company?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the company. Contacts linked to the company will be kept but will lose their association.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteCompany.mutate(company.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </AdminPageContainer>
    </AdminLayout>
  );
}
