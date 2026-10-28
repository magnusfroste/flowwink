import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useSeoSettings } from '@/hooks/useSiteSettings';
import { useAuth } from '@/hooks/useAuth';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { usePublicFeedbackPost, usePublicFeedbackWrite, voterKey } from '@/hooks/useFeedbackBoard';
import { FEEDBACK_BOARD_LABELS, FEEDBACK_STATUS_LABELS } from '@/lib/feedback-endpoint';
import { cn } from '@/lib/utils';

/** One post on the public board: the text, the vote, the comments, a reply box. */
export default function FeedbackPostPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePublicFeedbackPost(id);
  const { data: seo } = useSeoSettings();
  const { user } = useAuth();
  const t = useUiText();
  const { formatDate } = useCustomerFormat();
  const { vote, comment } = usePublicFeedbackWrite();
  const myKey = useMemo(() => voterKey(user?.id ?? null), [user?.id]);
  const [voted, setVoted] = useState<boolean>(() => { try { return !!JSON.parse(localStorage.getItem('fw_feedback_voted') || '{}')[id ?? '']; } catch { return false; } });
  const [reply, setReply] = useState({ author_name: '', body: '' });

  const toggleVote = async () => {
    if (!id) return;
    try {
      await vote.mutateAsync({ post_id: id, voter_key: myKey, remove: voted });
      setVoted(!voted);
      try { const all = JSON.parse(localStorage.getItem('fw_feedback_voted') || '{}'); all[id] = !voted; localStorage.setItem('fw_feedback_voted', JSON.stringify(all)); } catch { /* private mode */ }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  const send = async () => {
    if (!id || !reply.body.trim()) return;
    try {
      await comment.mutateAsync({ post_id: id, body: reply.body, author_name: reply.author_name || undefined });
      setReply({ ...reply, body: '' });
      toast.success(t('feedback.commentPosted', 'Comment posted'));
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const post = data?.post;
  return (
    <>
      <Helmet><title>{post?.title ?? t('feedback.title', 'Feedback')} | {seo?.siteTitle || t('feedback.title', 'Feedback')}</title></Helmet>
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <div className="container mx-auto max-w-3xl px-6 py-8">
          <Link to="/feedback" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t('feedback.back', 'All feedback')}</Link>
          {isLoading ? <p className="mt-6 text-sm text-muted-foreground">{t('feedback.loading', 'Loading…')}</p> : !post ? <p className="mt-6">{t('feedback.notFound', 'That post is gone.')}</p> : (
            <>
              <div className="mt-4 flex gap-4">
                <button type="button" onClick={toggleVote} aria-pressed={voted}
                  className={cn('flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-md border', voted ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                  <ChevronUp className="h-4 w-4" />{post.votes_count}
                </button>
                <div className="min-w-0">
                  <h1 className="font-serif text-2xl font-bold md:text-3xl">{post.title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={post.status === 'done' ? 'default' : 'outline'} className="text-[10px]">{FEEDBACK_STATUS_LABELS[post.status] ?? post.status}</Badge>
                    <span>{FEEDBACK_BOARD_LABELS[post.board]}</span>
                    <span>· {post.author_name || t('feedback.anonymous', 'Anonymous')}</span>
                    <span>· {formatDate(post.created_at)}</span>
                  </div>
                </div>
              </div>
              {post.body && <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed">{post.body}</p>}
              <section className="mt-10 space-y-4">
                <h2 className="text-lg font-semibold">{t('feedback.comments', 'Comments')} ({data?.comments.length ?? 0})</h2>
                {(data?.comments ?? []).map((c) => (
                  <div key={c.id} className={cn('rounded-md border p-3', c.is_staff && 'border-primary/40 bg-primary/5')}>
                    <p className="text-xs text-muted-foreground">{c.author_name || t('feedback.anonymous', 'Anonymous')}{c.is_staff ? ` · ${t('feedback.staff', 'Staff')}` : ''} · {formatDate(c.created_at)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                  </div>
                ))}
                <div className="space-y-2 rounded-md border p-3">
                  <Input placeholder={t('feedback.name', 'Name')} value={reply.author_name} onChange={(e) => setReply({ ...reply, author_name: e.target.value })} />
                  <Textarea rows={3} placeholder={t('feedback.writeComment', 'Write a comment…')} value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} />
                  <Button size="sm" onClick={send} disabled={comment.isPending || !reply.body.trim()}>{t('feedback.comment', 'Comment')}</Button>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
