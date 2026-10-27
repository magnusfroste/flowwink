import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronUp, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFeedbackSettings, useSeoSettings } from '@/hooks/useSiteSettings';
import { useAuth } from '@/hooks/useAuth';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { useUiText } from '@/lib/ui-text';
import { usePublicFeedbackPosts, usePublicFeedbackWrite, voterKey, type FeedbackBoard } from '@/hooks/useFeedbackBoard';
import { cn } from '@/lib/utils';
import { FEEDBACK_BOARD_LABELS, FEEDBACK_STATUS_LABELS } from '@/lib/feedback-endpoint';

/**
 * The public feedback board (/feedback) of a RECEIVING instance: boards on the
 * side, posts with status, votes and comments, "Create post". Reads and writes
 * go through content-api with the anon key — the public-block rule.
 */
export default function FeedbackBoardPage() {
  const [params, setParams] = useSearchParams();
  const board = params.get('board') || '';
  const sort = params.get('sort') === 'top' ? 'top' : 'newest';
  const [q, setQ] = useState('');
  const { data: settings } = useFeedbackSettings();
  const { data: seo } = useSeoSettings();
  const { user } = useAuth();
  const t = useUiText();
  const { formatDate } = useCustomerFormat();
  const { data: posts = [], isLoading } = usePublicFeedbackPosts({ board: board || undefined, sort, q: q.trim() || undefined });
  const { create, vote } = usePublicFeedbackWrite();
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ board: (board || 'feature') as FeedbackBoard, title: '', body: '', author_name: '', author_email: '', website: '' });
  const myKey = useMemo(() => voterKey(user?.id ?? null), [user?.id]);
  const [voted, setVoted] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('fw_feedback_voted') || '{}'); } catch { return {}; } });

  const title = settings?.board_title || t('feedback.title', 'Feedback');
  const toggleVote = async (id: string) => {
    const remove = !!voted[id];
    try {
      await vote.mutateAsync({ post_id: id, voter_key: myKey, remove });
      const next = { ...voted, [id]: !remove };
      setVoted(next);
      try { localStorage.setItem('fw_feedback_voted', JSON.stringify(next)); } catch { /* private mode */ }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  const submit = async () => {
    if (form.title.trim().length < 3) { toast.error(t('feedback.titleRequired', 'Give it a title (3–200 characters).')); return; }
    try {
      await create.mutateAsync({ ...form, author_name: form.author_name || undefined, author_email: form.author_email || undefined });
      toast.success(t('feedback.posted', 'Posted. Thank you!'));
      setForm({ ...form, title: '', body: '' });
      setComposing(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <>
      <Helmet>
        <title>{title} | {seo?.siteTitle || title}</title>
        <meta name="description" content={settings?.board_intro || t('feedback.intro', 'Bug reports, feature requests and questions.')} />
      </Helmet>
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <section className="border-b bg-muted/30">
          <div className="container mx-auto px-6 py-12">
            <h1 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
            {settings?.board_intro && <p className="mt-2 max-w-2xl text-muted-foreground">{settings.board_intro}</p>}
          </div>
        </section>
        <section className="container mx-auto grid gap-8 px-6 py-8 md:grid-cols-[14rem_1fr]">
          <aside className="space-y-1">
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{t('feedback.boards', 'Boards')}</p>
            {[['', t('feedback.all', 'All posts')], ...Object.entries(FEEDBACK_BOARD_LABELS)].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('board', id); else n.delete('board'); return n; })}
                className={cn('block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted', board === id && 'bg-muted font-medium')}>
                {label}
              </button>
            ))}
          </aside>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-xs" placeholder={t('feedback.search', 'Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
              <Select value={sort} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set('sort', v); return n; })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="newest">{t('feedback.newest', 'Newest')}</SelectItem><SelectItem value="top">{t('feedback.top', 'Most voted')}</SelectItem></SelectContent>
              </Select>
              <div className="flex-1" />
              <Button onClick={() => setComposing((c) => !c)}><Plus className="mr-1 h-4 w-4" /> {t('feedback.create', 'Create post')}</Button>
            </div>
            {composing && (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>{t('feedback.board', 'Board')}</Label>
                    <Select value={form.board} onValueChange={(v) => setForm({ ...form, board: v as FeedbackBoard })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(FEEDBACK_BOARD_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>{t('feedback.name', 'Name')}</Label><Input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} /></div>
                  <div className="space-y-1"><Label>{t('feedback.email', 'E-mail (optional)')}</Label><Input type="email" value={form.author_email} onChange={(e) => setForm({ ...form, author_email: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>{t('feedback.postTitle', 'Title')}</Label><Input maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('feedback.details', 'Details')}</Label><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
                {/* Honeypot: a field a person never sees and a bot fills in. */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} aria-hidden="true" />
                <p className="text-xs text-muted-foreground">{t('feedback.privacy', 'Your name and e-mail are stored with the post so the team can answer you. Nothing else is collected.')}</p>
                <div className="flex gap-2">
                  <Button onClick={submit} disabled={create.isPending}>{t('feedback.post', 'Post')}</Button>
                  <Button variant="ghost" onClick={() => setComposing(false)}>{t('feedback.cancel', 'Cancel')}</Button>
                </div>
              </div>
            )}
            {isLoading ? <p className="text-sm text-muted-foreground">{t('feedback.loading', 'Loading…')}</p>
              : posts.length === 0 ? <p className="py-12 text-center text-muted-foreground">{t('feedback.empty', 'Nothing here yet — be the first.')}</p>
              : posts.map((p) => (
                <article key={p.id} className="flex gap-4 rounded-lg border p-4">
                  <button type="button" onClick={() => toggleVote(p.id)} aria-pressed={!!voted[p.id]}
                    className={cn('flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-md border text-sm', voted[p.id] ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                    <ChevronUp className="h-4 w-4" />{p.votes_count}
                  </button>
                  <div className="min-w-0 flex-1">
                    <Link to={`/feedback/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                    {p.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.body}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={p.status === 'done' ? 'default' : 'outline'} className="text-[10px]">{FEEDBACK_STATUS_LABELS[p.status] ?? p.status}</Badge>
                      <span>{FEEDBACK_BOARD_LABELS[p.board]}</span>
                      <span>· {p.author_name || t('feedback.anonymous', 'Anonymous')}</span>
                      <span>· {formatDate(p.created_at)}</span>
                      <span className="inline-flex items-center gap-1">· <MessageSquare className="h-3 w-3" /> {p.comments_count}</span>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
