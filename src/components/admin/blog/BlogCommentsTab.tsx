import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminComments,
  useModerateComment,
  useDeleteComment,
  type BlogCommentStatus,
} from '@/hooks/useBlogComments';

const STATUS_LABEL: Record<BlogCommentStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  spam: 'Spam',
  rejected: 'Rejected',
};

export default function BlogCommentsTab() {
  const [status, setStatus] = useState<BlogCommentStatus>('pending');
  const { data: comments = [], isLoading } = useAdminComments(status);
  const moderate = useModerateComment();
  const del = useDeleteComment();
  const { toast } = useToast();

  const counts = useMemo(() => comments.length, [comments]);

  const act = async (id: string, newStatus: BlogCommentStatus) => {
    try {
      await moderate.mutateAsync({ id, status: newStatus });
      toast({ title: `Comment marked ${STATUS_LABEL[newStatus].toLowerCase()}` });
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={status} onValueChange={(v) => setStatus(v as BlogCommentStatus)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="spam">Spam</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && counts === 0 && (
        <p className="text-sm text-muted-foreground">No {STATUS_LABEL[status].toLowerCase()} comments.</p>
      )}

      <div className="space-y-3">
        {comments.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">
                    {c.author_name}{' '}
                    <span className="text-muted-foreground font-normal">&lt;{c.author_email}&gt;</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })} · post{' '}
                    <code className="bg-muted px-1 rounded">{c.post_id.slice(0, 8)}</code>
                  </p>
                </div>
                <Badge variant="secondary">{STATUS_LABEL[c.status]}</Badge>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              <div className="flex flex-wrap gap-2">
                {c.status !== 'approved' && (
                  <Button size="sm" onClick={() => act(c.id, 'approved')} disabled={moderate.isPending}>
                    Approve
                  </Button>
                )}
                {c.status !== 'spam' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(c.id, 'spam')}
                    disabled={moderate.isPending}
                  >
                    Mark spam
                  </Button>
                )}
                {c.status !== 'rejected' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(c.id, 'rejected')}
                    disabled={moderate.isPending}
                  >
                    Reject
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => del.mutate(c.id)}
                  disabled={del.isPending}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
