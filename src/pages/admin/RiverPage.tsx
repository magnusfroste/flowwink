import { useMemo, useRef, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  ImagePlus,
  Loader2,
  MessageCircle,
  Pin,
  PinOff,
  Send,
  Smile,
  Trash2,
  Waves,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  type RiverPost,
  type RiverAuthor,
  uploadRiverMedia,
  useCreateRiverPost,
  useDeleteRiverPost,
  useRiverFeed,
  useRiverReactions,
  useRiverReplies,
  useRiverAuthors,
  useToggleReaction,
  useTogglePin,
} from '@/hooks/useRiver';
import { cn } from '@/lib/utils';

const QUICK_EMOJIS = ['👍', '❤️', '🎉', '🚀', '🔥', '👀', '💡', '😂'];

function initialsFor(author: RiverAuthor | undefined, id: string) {
  const name = author?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
  }
  return id.slice(0, 2).toUpperCase();
}

function displayName(author: RiverAuthor | undefined, id: string) {
  return author?.full_name?.trim() || id.slice(0, 8);
}

function autoLink(text: string) {
  // Linkify URLs and #tags
  const parts = text.split(/(\bhttps?:\/\/\S+|#[\w-]+)/g);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return (
        <a
          key={i}
          href={p}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-2 hover:underline break-all"
        >
          {p}
        </a>
      );
    }
    if (/^#[\w-]+$/.test(p)) {
      return (
        <span key={i} className="text-primary font-medium">
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function Composer({
  parentId,
  onPosted,
  placeholder = "What's flowing?",
  compact = false,
}: {
  parentId?: string | null;
  onPosted?: () => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateRiverPost();
  const { toast } = useToast();

  const submit = async () => {
    if (!body.trim() && media.length === 0) return;
    try {
      await create.mutateAsync({
        body: body.trim(),
        media_urls: media,
        parent_id: parentId ?? null,
      });
      setBody('');
      setMedia([]);
      onPosted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Could not post',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(
        Array.from(files).slice(0, 4).map(uploadRiverMedia),
      );
      setMedia((m) => [...m, ...urls].slice(0, 4));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Upload failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-card',
        compact ? 'p-3' : 'p-4',
      )}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        className="resize-none border-0 px-0 shadow-none focus-visible:ring-0 text-base"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
      />
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {media.map((url) => (
            <div key={url} className="relative group rounded-lg overflow-hidden border">
              <img src={url} alt="" className="w-full h-32 object-cover" />
              <button
                type="button"
                onClick={() => setMedia((m) => m.filter((u) => u !== url))}
                className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || media.length >= 4}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            {body.length}/2000 · ⌘↵
          </span>
        </div>
        <Button
          size="sm"
          onClick={submit}
          disabled={create.isPending || (!body.trim() && media.length === 0)}
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {parentId ? 'Reply' : 'Post'}
        </Button>
      </div>
    </div>
  );
}

function ReactionBar({
  postId,
  reactions,
  currentUserId,
}: {
  postId: string;
  reactions: { emoji: string; user_id: string }[];
  currentUserId: string | undefined;
}) {
  const toggle = useToggleReaction();
  const [openPicker, setOpenPicker] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = m.get(r.emoji) || { count: 0, mine: false };
      cur.count += 1;
      if (r.user_id === currentUserId) cur.mine = true;
      m.set(r.emoji, cur);
    }
    return Array.from(m.entries());
  }, [reactions, currentUserId]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {grouped.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          onClick={() => toggle.mutate({ post_id: postId, emoji })}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
            mine
              ? 'bg-primary/10 border-primary/40'
              : 'bg-muted/40 hover:bg-muted',
          )}
        >
          <span>{emoji}</span>
          <span className="text-muted-foreground">{count}</span>
        </button>
      ))}
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => setOpenPicker((o) => !o)}
        >
          <Smile className="h-3.5 w-3.5" />
        </Button>
        {openPicker && (
          <div className="absolute z-20 left-0 mt-1 bg-popover border rounded-lg shadow-lg p-1 flex gap-1">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  toggle.mutate({ post_id: postId, emoji: e });
                  setOpenPicker(false);
                }}
                className="hover:bg-muted rounded p-1 text-base"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RepliesThread({ parentId }: { parentId: string }) {
  const { data: replies = [] } = useRiverReplies(parentId);
  const ids = replies.map((r) => r.id);
  const { data: reactions = [] } = useRiverReactions(ids);
  const { data: authors = {} } = useRiverAuthors(replies.map((r) => r.author_id));
  const { user } = useAuth();
  const del = useDeleteRiverPost();

  return (
    <div className="mt-3 ml-4 pl-4 border-l space-y-3">
      {replies.map((r) => {
        const reacts = reactions.filter((x) => x.post_id === r.id);
        const author = authors[r.author_id];
        return (
          <div key={r.id} className="flex gap-3">
            <Avatar className="h-7 w-7 mt-0.5">
              {author?.avatar_url && <AvatarImage src={author.avatar_url} alt="" />}
              <AvatarFallback className="text-[10px]">
                {initialsFor(author, r.author_id)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {displayName(author, r.author_id)}
                </span>
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
                {r.author_id === user?.id && (
                  <button
                    onClick={() => del.mutate(r.id)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="text-sm whitespace-pre-wrap break-words mt-0.5">
                {autoLink(r.body)}
              </div>
              {Array.isArray(r.media_urls) && r.media_urls.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-2 max-w-md">
                  {r.media_urls.map((u) => (
                    <img
                      key={u}
                      src={u}
                      alt=""
                      className="rounded-md border w-full h-32 object-cover"
                    />
                  ))}
                </div>
              )}
              <div className="mt-1.5">
                <ReactionBar
                  postId={r.id}
                  reactions={reacts}
                  currentUserId={user?.id}
                />
              </div>
            </div>
          </div>
        );
      })}
      <Composer parentId={parentId} placeholder="Reply…" compact />
    </div>
  );
}

function PostCard({
  post,
  reactions,
  isAdmin,
  author,
}: {
  post: RiverPost;
  reactions: { emoji: string; user_id: string; post_id: string }[];
  isAdmin: boolean;
  author?: RiverAuthor;
}) {
  const { user } = useAuth();
  const [showReplies, setShowReplies] = useState(false);
  const del = useDeleteRiverPost();
  const togglePin = useTogglePin();
  const myReacts = reactions.filter((r) => r.post_id === post.id);
  const canDelete = post.author_id === user?.id || isAdmin;

  return (
    <Card className={cn(post.pinned && 'border-primary/50 bg-primary/5')}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-9 w-9 mt-0.5">
            {author?.avatar_url && <AvatarImage src={author.avatar_url} alt="" />}
            <AvatarFallback className="text-xs">
              {initialsFor(author, post.author_id)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">{displayName(author, post.author_id)}</span>
              <span className="text-muted-foreground text-xs">
                · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </span>
              {post.pinned && (
                <Badge variant="secondary" className="gap-1 h-5 px-1.5 text-[10px]">
                  <Pin className="h-2.5 w-2.5" /> Pinned
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-1">
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      togglePin.mutate({ id: post.id, pinned: !post.pinned })
                    }
                    title={post.pinned ? 'Unpin' : 'Pin'}
                  >
                    {post.pinned ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => del.mutate(post.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="text-[15px] whitespace-pre-wrap break-words mt-1 leading-relaxed">
              {autoLink(post.body)}
            </div>
            {Array.isArray(post.media_urls) && post.media_urls.length > 0 && (
              <div
                className={cn(
                  'mt-3 grid gap-2 rounded-lg overflow-hidden',
                  post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                )}
              >
                {post.media_urls.map((u) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={u}
                      alt=""
                      className="w-full max-h-96 object-cover rounded-md border hover:opacity-95 transition"
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <ReactionBar
                postId={post.id}
                reactions={myReacts}
                currentUserId={user?.id}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setShowReplies((s) => !s)}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {post.reply_count > 0 ? post.reply_count : 'Reply'}
              </Button>
            </div>
            {showReplies && <RepliesThread parentId={post.id} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RiverPage() {
  const enabled = useIsModuleEnabled('river');
  const { isAdmin } = useAuth();
  const { data: posts = [], isLoading } = useRiverFeed(50);
  const ids = posts.map((p) => p.id);
  const { data: reactions = [] } = useRiverReactions(ids);
  const { data: authors = {} } = useRiverAuthors(posts.map((p) => p.author_id));

  if (!enabled) {
    return (
      <AdminLayout>
        <AdminPageContainer>
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <Waves className="h-10 w-10 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">River is disabled</h2>
              <CardDescription className="max-w-md mx-auto">
                Enable the River module to use the internal team social feed.
              </CardDescription>
            </CardContent>
          </Card>
        </AdminPageContainer>
      </AdminLayout>
    );
  }

  const pinnedPosts = posts.filter((p) => p.pinned);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <div className="grid grid-cols-12 gap-6">
          {/* Main feed — left */}
          <main className="col-span-12 lg:col-span-9 order-2 lg:order-1">
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Waves className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">River</h1>
                  <p className="text-sm text-muted-foreground">
                    The team's social stream — short messages, images, threads.
                  </p>
                </div>
              </div>

              <Composer />

              <Separator className="my-2" />

              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : posts.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Nothing yet. Be the first to post something to the team 🌊
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {posts.map((p) => (
                    <div key={p.id} id={`river-post-${p.id}`}>
                      <PostCard
                        post={p}
                        reactions={reactions}
                        isAdmin={isAdmin}
                        author={authors[p.author_id]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* Pinned — right */}
          <aside className="col-span-12 lg:col-span-3 order-1 lg:order-2 space-y-3">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Pinned</h2>
              <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                {pinnedPosts.length}
              </Badge>
            </div>
            {pinnedPosts.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">
                Nothing pinned yet. Admins can pin posts from the feed.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {pinnedPosts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        document
                          .getElementById(`river-post-${p.id}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="w-full text-left rounded-md border bg-primary/5 hover:bg-primary/10 px-2.5 py-2 transition"
                    >
                      <div className="text-xs font-medium line-clamp-2">
                        {p.body || '(no text)'}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

      </AdminPageContainer>
    </AdminLayout>
  );
}
