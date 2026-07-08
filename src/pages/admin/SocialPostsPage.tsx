import { useState } from 'react';
import { format } from 'date-fns';
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
import {
  useSocialPosts,
  useCreateSocialPost,
  useMarkSocialPostPosted,
  useDeleteSocialPost,
  type SocialChannel,
  type SocialPostStatus,
} from '@/hooks/useSocialPosts';

const CHANNELS: SocialChannel[] = ['linkedin', 'x', 'instagram', 'facebook', 'other'];

const STATUS_VARIANT: Record<SocialPostStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  scheduled: 'outline',
  posted: 'default',
  failed: 'destructive',
  cancelled: 'secondary',
};

export default function SocialPostsPage() {
  const [filter, setFilter] = useState<SocialPostStatus | 'all'>('all');
  const { data: posts = [], isLoading } = useSocialPosts(filter === 'all' ? undefined : filter);
  const create = useCreateSocialPost();
  const markPosted = useMarkSocialPostPosted();
  const del = useDeleteSocialPost();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState<SocialChannel>('linkedin');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState('');

  const submit = async () => {
    if (!content.trim()) {
      toast({ title: 'Content required', variant: 'destructive' });
      return;
    }
    try {
      await create.mutateAsync({
        content: content.trim(),
        channel,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        link_url: linkUrl.trim() || null,
      });
      setContent('');
      setScheduledAt('');
      setLinkUrl('');
      setOpen(false);
      toast({ title: 'Post created' });
    } catch (e) {
      toast({
        title: 'Could not create post',
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

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New post
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule a social post</DialogTitle>
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
                <Button onClick={submit} disabled={create.isPending}>
                  {create.isPending ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AdminPageHeader>

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
                        {format(new Date(p.scheduled_at), 'PP p')}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
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
