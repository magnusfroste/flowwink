import { useState } from 'react';
import { format, isPast, isFuture } from 'date-fns';
import { Video, Plus, Pencil, Trash2, Users, Calendar, Clock, ExternalLink, Play, CheckCircle, Eye } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { StatCard } from '@/components/admin/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
  useWebinars,
  useCreateWebinar,
  useUpdateWebinar,
  useDeleteWebinar,
  useWebinarRegistrations,
  useWebinarStats,
  type Webinar,
  type WebinarStatus,
  type WebinarPlatform,
  type CreateWebinarInput,
} from '@/hooks/useWebinars';

const STATUS_LABELS: Record<WebinarStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  live: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<WebinarStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-primary/10 text-primary',
  live: 'bg-destructive/10 text-destructive',
  completed: 'bg-success/10 text-success',
  cancelled: 'bg-muted text-muted-foreground line-through',
};

const PLATFORM_LABELS: Record<WebinarPlatform, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  custom: 'Custom URL',
};

const defaultFormData: CreateWebinarInput = {
  title: '',
  description: '',
  agenda: '',
  date: '',
  duration_minutes: 60,
  max_attendees: undefined,
  platform: 'google_meet',
  meeting_url: '',
  status: 'draft',
};

export default function WebinarsPage() {
  const { data: webinars = [], isLoading } = useWebinars();
  const { data: stats } = useWebinarStats();
  const createWebinar = useCreateWebinar();
  const updateWebinar = useUpdateWebinar();
  const deleteWebinar = useDeleteWebinar();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebinar, setEditingWebinar] = useState<Webinar | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [webinarToDelete, setWebinarToDelete] = useState<Webinar | null>(null);
  const [detailWebinar, setDetailWebinar] = useState<Webinar | null>(null);
  const [formData, setFormData] = useState<CreateWebinarInput>(defaultFormData);

  const upcoming = webinars.filter(w => w.status === 'published' && isFuture(new Date(w.date)));
  const past = webinars.filter(w => w.status === 'completed' || (w.status === 'published' && isPast(new Date(w.date))));
  const drafts = webinars.filter(w => w.status === 'draft');

  const openCreateDialog = () => {
    setEditingWebinar(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const openEditDialog = (webinar: Webinar) => {
    setEditingWebinar(webinar);
    setFormData({
      title: webinar.title,
      description: webinar.description || '',
      agenda: webinar.agenda || '',
      date: webinar.date ? webinar.date.slice(0, 16) : '',
      duration_minutes: webinar.duration_minutes,
      max_attendees: webinar.max_attendees || undefined,
      platform: webinar.platform,
      meeting_url: webinar.meeting_url || '',
      status: webinar.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingWebinar) {
      await updateWebinar.mutateAsync({ id: editingWebinar.id, ...formData });
    } else {
      await createWebinar.mutateAsync(formData);
    }
    setDialogOpen(false);
  };

  const handleDelete = (webinar: Webinar) => {
    setWebinarToDelete(webinar);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (webinarToDelete) {
      deleteWebinar.mutate(webinarToDelete.id);
      setDeleteDialogOpen(false);
      setWebinarToDelete(null);
    }
  };

  const WebinarCard = ({ webinar }: { webinar: Webinar }) => {
    const isUpcoming = isFuture(new Date(webinar.date));
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium truncate">{webinar.title}</h3>
                <Badge className={STATUS_COLORS[webinar.status]} variant="secondary">
                  {STATUS_LABELS[webinar.status]}
                </Badge>
              </div>
              {webinar.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{webinar.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(webinar.date), 'PPP')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {format(new Date(webinar.date), 'HH:mm')} ({webinar.duration_minutes} min)
                </span>
                <span className="flex items-center gap-1">
                  <Video className="h-3.5 w-3.5" />
                  {PLATFORM_LABELS[webinar.platform]}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setDetailWebinar(webinar)}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => openEditDialog(webinar)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(webinar)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {webinar.meeting_url && isUpcoming && (
            <div className="mt-3 pt-3 border-t">
              <a
                href={webinar.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {PLATFORM_LABELS[webinar.platform]} link
              </a>
            </div>
          )}
          {webinar.recording_url && !isUpcoming && (
            <div className="mt-3 pt-3 border-t">
              <a
                href={webinar.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary flex items-center gap-1 hover:underline"
              >
                <Play className="h-3.5 w-3.5" />
                Watch recording
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Webinars"
          description="Plan, promote and follow up webinars and online events"
        >
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Webinar
          </Button>
        </AdminPageHeader>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total" value={stats?.total || 0} icon={Video} variant="default" />
          <StatCard label="Upcoming" value={stats?.upcoming || 0} icon={Calendar} variant="success" />
          <StatCard label="Completed" value={stats?.completed || 0} icon={CheckCircle} variant="default" />
          <StatCard label="Registrations" value={stats?.totalRegistrations || 0} icon={Users} variant="default" />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : webinars.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Video className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No webinars yet</h3>
              <p className="text-muted-foreground mb-4">Create your first webinar to get started</p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                New Webinar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="upcoming">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
              <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
              <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="space-y-4">
              {upcoming.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No upcoming webinars</p>
              ) : (
                upcoming.map(w => <WebinarCard key={w.id} webinar={w} />)
              )}
            </TabsContent>
            <TabsContent value="past" className="space-y-4">
              {past.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No past webinars</p>
              ) : (
                past.map(w => <WebinarCard key={w.id} webinar={w} />)
              )}
            </TabsContent>
            <TabsContent value="drafts" className="space-y-4">
              {drafts.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No drafts</p>
              ) : (
                drafts.map(w => <WebinarCard key={w.id} webinar={w} />)
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingWebinar ? 'Edit Webinar' : 'New Webinar'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Introduction to FlowWink"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What will this webinar cover?"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="agenda">Agenda</Label>
                <Textarea
                  id="agenda"
                  value={formData.agenda}
                  onChange={(e) => setFormData(prev => ({ ...prev, agenda: e.target.value }))}
                  placeholder="1. Introduction&#10;2. Demo&#10;3. Q&A"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Date & Time</Label>
                  <Input
                    id="date"
                    type="datetime-local"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={15}
                    max={480}
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 60 }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select
                    value={formData.platform}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, platform: v as WebinarPlatform }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="teams">Microsoft Teams</SelectItem>
                      <SelectItem value="custom">Custom URL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="max_attendees">Max Attendees</Label>
                  <Input
                    id="max_attendees"
                    type="number"
                    min={1}
                    value={formData.max_attendees || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_attendees: e.target.value ? parseInt(e.target.value) : undefined }))}
                    placeholder="Unlimited"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="meeting_url">Meeting URL</Label>
                <Input
                  id="meeting_url"
                  type="url"
                  value={formData.meeting_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, meeting_url: e.target.value }))}
                  placeholder="https://meet.google.com/..."
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as WebinarStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createWebinar.isPending || updateWebinar.isPending}>
                  {editingWebinar ? 'Save' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog with Registrations */}
        <WebinarDetailDialog
          webinar={detailWebinar}
          onClose={() => setDetailWebinar(null)}
          onEdit={(w) => { setDetailWebinar(null); openEditDialog(w); }}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete webinar?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{webinarToDelete?.title}"?
                All registrations will also be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}

// ─── Detail Dialog ───────────────────────────────────────────

function WebinarDetailDialog({
  webinar,
  onClose,
  onEdit,
}: {
  webinar: Webinar | null;
  onClose: () => void;
  onEdit: (w: Webinar) => void;
}) {
  const { data: registrations = [] } = useWebinarRegistrations(webinar?.id);

  if (!webinar) return null;

  const isUpcoming = isFuture(new Date(webinar.date));
  const attended = registrations.filter(r => r.attended).length;

  return (
    <Dialog open={!!webinar} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {webinar.title}
            <Badge className={STATUS_COLORS[webinar.status]} variant="secondary">
              {STATUS_LABELS[webinar.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Date</Label>
              <p className="font-medium">{format(new Date(webinar.date), 'PPP HH:mm')}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Duration</Label>
              <p className="font-medium">{webinar.duration_minutes} minutes</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Platform</Label>
              <p className="font-medium">{PLATFORM_LABELS[webinar.platform]}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Max Attendees</Label>
              <p className="font-medium">{webinar.max_attendees || 'Unlimited'}</p>
            </div>
          </div>

          {webinar.description && (
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="text-sm mt-1">{webinar.description}</p>
            </div>
          )}

          {webinar.agenda && (
            <div>
              <Label className="text-muted-foreground">Agenda</Label>
              <pre className="text-sm mt-1 whitespace-pre-wrap font-sans">{webinar.agenda}</pre>
            </div>
          )}

          {webinar.meeting_url && (
            <div>
              <Label className="text-muted-foreground">Meeting URL</Label>
              <a
                href={webinar.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary flex items-center gap-1 hover:underline mt-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {webinar.meeting_url}
              </a>
            </div>
          )}

          {/* Registrations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Registrations ({registrations.length})
                {!isUpcoming && (
                  <span className="text-muted-foreground font-normal">
                    — {attended} attended
                  </span>
                )}
              </h3>
            </div>
            {registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No registrations yet</p>
            ) : (
              <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                {registrations.map((reg) => (
                  <div key={reg.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{reg.name}</p>
                      <p className="text-muted-foreground">{reg.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {reg.attended && (
                        <Badge variant="secondary" className="bg-success/10 text-success">
                          Attended
                        </Badge>
                      )}
                      {reg.follow_up_sent && (
                        <Badge variant="outline">Follow-up sent</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(reg.registered_at), 'PP')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => onEdit(webinar)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
