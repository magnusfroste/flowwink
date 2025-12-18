import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Download, Trash2, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface FormSubmission {
  id: string;
  block_id: string;
  page_id: string | null;
  form_name: string | null;
  data: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  created_at: string;
  page?: { title: string; slug: string } | null;
}

export default function FormSubmissionsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFormName, setFilterFormName] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch submissions with page info
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['form-submissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_submissions')
        .select(`
          *,
          page:pages(title, slug)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as FormSubmission[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('form_submissions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions'] });
      toast.success('Submission deleted');
      setDeleteId(null);
    },
    onError: () => {
      toast.error('Failed to delete submission');
    },
  });

  // Get unique form names for filter
  const formNames = useMemo(() => {
    const names = new Set<string>();
    submissions.forEach((s) => {
      if (s.form_name) names.add(s.form_name);
    });
    return Array.from(names);
  }, [submissions]);

  // Filter submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((submission) => {
      // Form name filter
      if (filterFormName !== 'all' && submission.form_name !== filterFormName) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const dataStr = JSON.stringify(submission.data).toLowerCase();
        const formName = (submission.form_name || '').toLowerCase();
        const pageTitle = (submission.page?.title || '').toLowerCase();
        
        return (
          dataStr.includes(searchLower) ||
          formName.includes(searchLower) ||
          pageTitle.includes(searchLower)
        );
      }

      return true;
    });
  }, [submissions, filterFormName, searchQuery]);

  // Export to CSV
  const exportToCSV = () => {
    if (filteredSubmissions.length === 0) {
      toast.error('No submissions to export');
      return;
    }

    // Collect all unique field keys
    const allKeys = new Set<string>();
    filteredSubmissions.forEach((s) => {
      Object.keys(s.data).forEach((key) => allKeys.add(key));
    });
    const fieldKeys = Array.from(allKeys);

    // Build CSV
    const headers = ['Date', 'Form Name', 'Page', ...fieldKeys];
    const rows = filteredSubmissions.map((s) => {
      const row = [
        format(new Date(s.created_at), 'yyyy-MM-dd HH:mm'),
        s.form_name || '-',
        s.page?.title || '-',
        ...fieldKeys.map((key) => {
          const value = s.data[key];
          if (typeof value === 'boolean') return value ? 'Yes' : 'No';
          return String(value || '');
        }),
      ];
      return row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `form-submissions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredSubmissions.length} submissions`);
  };

  // Render data preview
  const renderDataPreview = (data: Record<string, unknown>) => {
    const entries = Object.entries(data).slice(0, 2);
    return entries
      .map(([key, value]) => {
        const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '');
        return `${key}: ${displayValue.substring(0, 30)}${displayValue.length > 30 ? '...' : ''}`;
      })
      .join(', ');
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Form Submissions"
        description="View and manage form submissions from your website"
      />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search submissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterFormName} onValueChange={setFilterFormName}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All forms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All forms</SelectItem>
              {formNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border rounded-lg p-4">
            <div className="text-2xl font-bold">{submissions.length}</div>
            <div className="text-sm text-muted-foreground">Total Submissions</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-2xl font-bold">{formNames.length}</div>
            <div className="text-sm text-muted-foreground">Unique Forms</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-2xl font-bold">{filteredSubmissions.length}</div>
            <div className="text-sm text-muted-foreground">Filtered Results</div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No submissions found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery || filterFormName !== 'all'
                ? 'Try adjusting your filters'
                : 'Form submissions will appear here'}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead className="hidden md:table-cell">Data Preview</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(submission.created_at), 'dd MMM yyyy HH:mm', { locale: sv })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{submission.form_name || 'Unnamed'}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {submission.page?.title || '-'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                      {renderDataPreview(submission.data)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedSubmission(submission)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(submission.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submission Details</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Date</div>
                  <div className="font-medium">
                    {format(new Date(selectedSubmission.created_at), 'PPpp', { locale: sv })}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Form</div>
                  <div className="font-medium">{selectedSubmission.form_name || 'Unnamed'}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground">Page</div>
                  <div className="font-medium">{selectedSubmission.page?.title || '-'}</div>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground mb-2">Submitted Data</div>
                <div className="space-y-2">
                  {Object.entries(selectedSubmission.data).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-2 border-b last:border-0">
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="font-medium text-right max-w-[60%] break-words">
                        {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '-')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The submission data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
