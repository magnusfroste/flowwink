import { useState } from 'react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ProvenanceLine } from '@/components/ui/provenance-line';
import {
  useSocialPosts,
  useUpdateSocialPost,
  useCreateSocialPost,
  useMarkSocialPostPosted,
  useDeleteSocialPost,
  type SocialPost,
  type SocialChannel,
  type SocialPostStatus,
} from '@/hooks/useSocialPosts';
import { useBusinessClock } from '@/hooks/useBusinessClock';

const CHANNELS: SocialChannel[] = ['linkedin', 'x', 'instagram', 'facebook', 'other'];

const STATUS_VARIANT: Record<SocialPostStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  scheduled: 'outline',
  posted: 'default',
  failed: 'destructive',
  cancelled: 'secondary',
};

export default function SocialPostsPage() {
  const { toInstant, toWallClock } = useBusinessClock();
  const { formatDateTime } = usePlatformFormat();
  const [filter, setFilter] = useState<SocialPostStatus | 'all'>('all');
  const { data: posts = [], isLoading } = useSocialPosts(filter === 'all' ? undefined : filter);
  const create = useCreateSocialPost();
  const update = useUpdateSocialPost();
  const markPosted = useMarkSocialPostPosted();
  const del = useDeleteSocialPost();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  // Set while editing an existing post — the same dialog serves both verbs, so
  // there is one place where a post's fields are defined.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState<SocialChannel>('linkedin');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setContent('');
    setScheduledAt('');
    setLinkUrl('');
  };

  /** datetime-local holds the business's wall clock, not the browser's. */
  const toLocalInput = (iso: string | null) => toWallClock(iso);

  const openEdit = (p: SocialPost) => {
    setEditingId(p.id);
    setContent(p.content);
    setChannel(p.channel);
    setScheduledAt(toLocalInput(p.scheduled_at));
    setLinkUrl(p.link_url ?? '');
    setOpen(true);
  };

  const submit = async () => {
    if (!content.trim()) {
      toast({ title: 'Content required', variant: 'destructive' });
      return;
    }
    const payload = {
      content: content.trim(),
      channel,
      scheduled_at: toInstant(scheduledAt),
      link_url: linkUrl.trim() || null,
    };
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      const scheduled = !!payload.scheduled_at;
      resetForm();
      setOpen(false);
      toast({
        title: editingId ? 'Post updated' : 'Post created',
        description: scheduled
          ? 'Scheduled — the publisher picks it up on the next sweep (every 15 min).'
          : 'Saved as draft — set a time to schedule it.',
      });
    } catch (e) {
      toast({
        title: editingId ? 'Could not update post' : 'Could not create post',
        description: e instanceof Error ? e.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Social posts"
          description="Schedule and track organic social posts."
        >
          <Select value={filter} onValueChange={(v) => setFilter(v as SocialPostStatus | 'all')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetForm}>
                <Plus className="h-4 w-4 mr-1" />
                New post
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit post' : 'Schedule a social post'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as SocialChannel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Link URL (optional)</Label>
                  <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Schedule at (leave blank for draft)</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={create.isPending || update.isPending}>
                  {create.isPending || update.isPending ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AdminPageHeader>

        {/* The queue is honest about what happens next: without a connected
            channel publisher the 15-minute sweep marks due posts failed
            ("No channel publisher configured") instead of letting them linger
            as scheduled. Magnus hit exactly this — scheduled a post, nothing
            said it would never leave the building. */}
        <p className="text-xs text-yellow-600 bg-yellow-500/10 rounded-md px-3 py-2">
          Scheduled posts are stored and queued here, but publishing to the channel
          requires a connected publisher (e.g. LinkedIn via Composio under
          Settings&nbsp;→&nbsp;Integrations). Until one is connected, due posts are
          marked <span className="font-medium">failed</span> by the scheduler —
          post manually and use &ldquo;Mark posted&rdquo; to record the URL.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && posts.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No posts. Create one, or generate variants with the <code>generate_social_post</code> skill.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {p.channel}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[p.status]} className="capitalize">
                      {p.status}
                    </Badge>
                    {p.scheduled_at && (
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(p.scheduled_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {p.status !== 'posted' && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        {p.status === 'draft' || p.status === 'failed' ? 'Edit / schedule' : 'Edit'}
                      </Button>
                    )}
                    {p.status !== 'posted' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => markPosted.mutate({ id: p.id })}
                        disabled={markPosted.isPending}
                      >
                        Mark posted
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => del.mutate(p.id)}
                      disabled={del.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{p.content}</p>
                {p.link_url && (
                  <a
                    href={p.link_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> {p.link_url}
                  </a>
                )}
                {/* #97 C2: fan-out stamps campaign_id — say where the post
                    was born instead of letting it look hand-written. */}
                {p.campaign_id && (
                  <ProvenanceLine to="/admin/campaigns" linkLabel="View campaigns">
                    Born from a campaign fan-out.
                  </ProvenanceLine>
                )}
                {p.error && (
                  <p className="text-xs text-destructive">{p.error}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}
