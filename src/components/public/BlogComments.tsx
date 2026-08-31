import { useState } from 'react';
import { useUiText } from '@/lib/ui-text';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useApprovedComments, useSubmitComment } from '@/hooks/useBlogComments';

interface Props {
  postId: string;
}

export function BlogComments({ postId }: Props) {
  const t = useUiText();
  const { data: comments = [], isLoading } = useApprovedComments(postId);
  const submit = useSubmitComment();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await submit.mutateAsync({
        post_id: postId,
        author_name: name,
        author_email: email,
        body,
        honeypot: website,
      });
      setName('');
      setEmail('');
      setBody('');
      setWebsite('');
      toast({
        title: 'Comment submitted',
        description: res.skipped
          ? 'Thanks for your comment.'
          : 'Your comment is awaiting moderation and will appear once approved.',
      });
    } catch (err) {
      toast({
        title: 'Could not submit',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <section className="mt-12" aria-label="Comments">
      <h3 className="text-lg font-semibold mb-4">
        Comments {comments.length > 0 && <span className="text-muted-foreground">({comments.length})</span>}
      </h3>

      <div className="space-y-4 mb-8">
        {isLoading && <p className="text-sm text-muted-foreground">{t('comments.loading', 'Loading comments...')}</p>}
        {!isLoading && comments.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('comments.empty', 'Be the first to comment.')}</p>
        )}
        {comments.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="font-medium text-sm">{c.author_name}</p>
                <time className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </time>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <h4 className="font-medium mb-4">{t('comments.leave', 'Leave a comment')}</h4>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blog-comment-name">Name</Label>
                <Input
                  id="blog-comment-name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-comment-email">Email</Label>
                <Input
                  id="blog-comment-email"
                  type="email"
                  required
                  maxLength={200}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blog-comment-body">Comment</Label>
              <Textarea
                id="blog-comment-body"
                required
                minLength={2}
                maxLength={4000}
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            {/* Honeypot — must remain empty */}
            <div className="hidden" aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? 'Submitting…' : 'Post comment'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Comments are moderated before they appear.
            </p>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
