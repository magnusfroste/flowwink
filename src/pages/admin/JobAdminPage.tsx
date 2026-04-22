import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  useApplications,
  useJobPosting,
  useUpdateJobPosting,
  useDeleteJobPosting,
  type EmploymentKind,
} from '@/hooks/useRecruitment';
import { ArrowLeft, Share2, ExternalLink, Trash2, Save, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CandidateMatchOverlay } from '@/components/admin/recruitment/CandidateMatchOverlay';

const EMPLOYMENT_OPTIONS: { value: EmploymentKind; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'internship', label: 'Internship' },
];

export default function JobAdminPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: job, isLoading } = useJobPosting(id);
  const { data: apps } = useApplications(id);
  const update = useUpdateJobPosting();
  const del = useDeleteJobPosting();
  const [overlayId, setOverlayId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    slug: '',
    department: '',
    location: '',
    employment_type: 'full_time' as EmploymentKind,
    description: '',
    requirements: '',
    status: 'draft' as 'draft' | 'published' | 'closed' | 'archived',
  });

  useEffect(() => {
    if (job) {
      setForm({
        title: job.title,
        slug: job.slug,
        department: job.department ?? '',
        location: job.location ?? '',
        employment_type: job.employment_type,
        description: job.description ?? '',
        requirements: job.requirements ?? '',
        status: job.status,
      });
    }
  }, [job]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!job) {
    return (
      <AdminLayout>
        <div className="py-16 text-center">
          <h2 className="text-2xl font-semibold">Job not found</h2>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/admin/recruitment">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to recruitment
            </Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const publicUrl = `${window.location.origin}/jobs/${job.slug}`;

  const handleSave = () => {
    update.mutate({
      id: job.id,
      updates: {
        title: form.title,
        slug: form.slug,
        department: form.department || null,
        location: form.location || null,
        employment_type: form.employment_type,
        description: form.description || null,
        requirements: form.requirements || null,
        status: form.status,
      },
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast({ title: 'Link copied', description: publicUrl });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
    del.mutate(job.id, {
      onSuccess: () => {
        window.location.href = '/admin/recruitment';
      },
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/recruitment">
            <ArrowLeft className="mr-2 h-4 w-4" /> All recruitment
          </Link>
        </Button>

        <AdminPageHeader title={job.title} description={`Created ${formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={job.status === 'published' ? 'default' : 'outline'}>{job.status}</Badge>
            {job.status === 'published' && (
              <>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Share2 className="mr-2 h-4 w-4" /> Copy link
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> View public
                  </a>
                </Button>
              </>
            )}
          </div>
        </AdminPageHeader>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="applicants">Applicants ({apps?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Job posting</CardTitle>
                <CardDescription>Edit the role and publish when ready.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug *</Label>
                    <Input id="slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employment">Employment type</Label>
                    <Select value={form.employment_type} onValueChange={(v) => setForm((f) => ({ ...f, employment_type: v as EmploymentKind }))}>
                      <SelectTrigger id="employment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" rows={8} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requirements">Requirements</Label>
                  <Textarea id="requirements" rows={6} value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
                    <SelectTrigger id="status" className="md:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <Button variant="destructive" onClick={handleDelete} disabled={del.isPending}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                  <Button onClick={handleSave} disabled={update.isPending}>
                    <Save className="mr-2 h-4 w-4" /> {update.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applicants" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Applicants for this role</CardTitle>
                <CardDescription>Click a candidate to review the full profile and AI scoring.</CardDescription>
              </CardHeader>
              <CardContent>
                {!apps?.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No applications yet.</p>
                ) : (
                  <div className="divide-y">
                    {apps.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-4 py-3 -mx-2 px-2 rounded"
                      >
                        <Link
                          to={`/admin/recruitment/candidates/${a.id}`}
                          className="flex-1 min-w-0 hover:underline"
                        >
                          <p className="font-medium truncate">{a.candidate_name}</p>
                          <p className="text-sm text-muted-foreground truncate">{a.candidate_email}</p>
                        </Link>
                        <div className="flex items-center gap-3 shrink-0">
                          {typeof a.ai_score === 'number' && (
                            <button
                              type="button"
                              onClick={() => setOverlayId(a.id)}
                              title="View match breakdown"
                            >
                              <Badge
                                variant={a.ai_score >= 80 ? 'default' : a.ai_score >= 50 ? 'secondary' : 'outline'}
                                className="cursor-pointer hover:opacity-80 transition-opacity gap-1"
                              >
                                <Sparkles className="h-3 w-3" />
                                {a.ai_score}/100
                              </Badge>
                            </button>
                          )}
                          <Badge variant="outline">{a.stage}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <CandidateMatchOverlay applicationId={overlayId} onClose={() => setOverlayId(null)} />
      </div>
    </AdminLayout>
  );
}
