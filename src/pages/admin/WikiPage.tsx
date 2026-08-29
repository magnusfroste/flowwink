import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { useIsModuleEnabled } from '@/hooks/useModules';
import {
  HOME_SLUG,
  toWikiSlug,
  useDeleteWikiPage,
  useUpsertWikiPage,
  useWikiBacklinks,
  useWikiPage,
  useWikiPages,
  useWikiSearch,
} from '@/hooks/useWiki';
import { WikiMarkdown } from '@/components/admin/wiki/WikiMarkdown';
import { AIMarkdownToolbar } from '@/components/admin/AIMarkdownToolbar';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WikiTree } from '@/components/admin/wiki/WikiTree';
import { WikiTOC } from '@/components/admin/wiki/WikiTOC';
import { WikiHistorySheet } from '@/components/admin/wiki/WikiHistorySheet';

import {
  BookOpen,
  ChevronRight,
  Columns2,
  Copy,
  Edit3,
  Link2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';


/**
 * The tree's width, dragged by the reader.
 *
 * Wikin är på väg att bli navet — ett Enterprise Context System — och på en
 * mindre desktop äter en fast tredjedel av läsytan (Magnus 2026-08-29).
 *
 * Varför inte ResizablePanelGroup, som redan finns i projektet: den kräver båda
 * panelerna som direkta barn och delar alltid horisontellt. Den här sidan
 * STAPLAR på mobil och DÖLJER trädet helt i redigeringsläge, så biblioteket
 * hade tvingat fram två parallella JSX-träd med samma barn. En dragbar kant på
 * en flexrad behåller ett träd.
 *
 * Bredden sparas i localStorage och INTE i profiles.preferences, till skillnad
 * från ägarlinsen. Skillnaden är avsiktlig: linsen är ett sätt att arbeta och
 * följer människan mellan enheter, medan en kolumnbredd hör till skärmen man
 * sitter vid. En bredd som följde med från 34 tum till en laptop vore fel.
 */
const SIDEBAR_KEY = 'wiki-sidebar-width';
const SIDEBAR_DEFAULT = 288;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 560;

function readStoredWidth(): number {
  try {
    const raw = Number(localStorage.getItem(SIDEBAR_KEY));
    if (Number.isFinite(raw) && raw >= SIDEBAR_MIN && raw <= SIDEBAR_MAX) return raw;
  } catch {
    // Private mode / blocked storage: the default is a perfectly good answer.
  }
  return SIDEBAR_DEFAULT;
}

export default function WikiPage() {
  const enabled = useIsModuleEnabled('wiki');
  if (!enabled) {
    return (
      <AdminLayout>
        <AdminPageContainer>
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">Wiki is disabled</h2>
              <CardDescription className="max-w-md mx-auto">
                Enable the Wiki module to use the internal TEdit-style intranet.
                CamelCase or [[WikiWord]] links auto-create pages on click.
              </CardDescription>
              <Button asChild>
                <Link to="/admin/modules">Manage modules</Link>
              </Button>
            </CardContent>
          </Card>
        </AdminPageContainer>
      </AdminLayout>
    );
  }
  return <WikiPageInner />;
}

function WikiPageInner() {
  const { formatDateTime } = usePlatformFormat();
  const params = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const slug = params.slug || HOME_SLUG;

  const { user } = useAuth();
  const { data: page, isLoading } = useWikiPage(slug);
  const { data: pages = [] } = useWikiPages();
  const { data: backlinks = [] } = useWikiBacklinks(slug);
  const upsert = useUpsertWikiPage();
  const del = useDeleteWikiPage();

  const knownSlugs = useMemo(() => new Set(pages.map((p) => p.slug)), [pages]);
  const titleMap = useMemo(() => new Map(pages.map((p) => [p.slug, p.title])), [pages]);

  // Provenance: who wrote/last edited this page — human name (profiles) and/or
  // agent surface (created_by_agent). Same design language as the context
  // provenance lines: the answer to "var kommer detta ifrån" is always visible.
  const { data: authorNames } = useQuery({
    queryKey: ['wiki-authors', page?.created_by, page?.updated_by],
    enabled: !!page && (!!page.created_by || !!page.updated_by),
    queryFn: async () => {
      const ids = [...new Set([page?.created_by, page?.updated_by].filter(Boolean))] as string[];
      const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
      return new Map((data ?? []).map((r) => [r.id, r.full_name || r.email || 'Unknown']));
    },
  });
  const AGENT_LABEL: Record<string, string> = {
    flowwork: 'FlowWork', flowpilot: 'FlowPilot', flowchat: 'FlowChat', mcp: 'external agent', cron: 'scheduled run',
  };
  const provenanceOf = (userId?: string | null, agent?: string | null): string | null => {
    const human = userId ? authorNames?.get(userId) : null;
    const surface = agent ? (AGENT_LABEL[agent] ?? agent) : null;
    if (human && surface) return `${human} via ${surface}`;
    return human ?? surface ?? null;
  };

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [splitPreview, setSplitPreview] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: searchHits = [], isFetching: searching } = useWikiSearch(search);

  // Hydrate form when page loads / changes.
  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setBody(page.content_md);
      setEditing(false);
    } else if (!isLoading) {
      // Missing page — open in edit mode with empty body.
      setTitle(slug);
      setBody('');
      setEditing(true);
    }
  }, [page, isLoading, slug]);

  const dirty = editing && (title !== (page?.title ?? slug) || body !== (page?.content_md ?? ''));

  const handleSave = async () => {
    if (!title.trim()) return;
    await upsert.mutateAsync({ slug, title: title.trim(), content_md: body });
    setEditing(false);
    toast.success('Page saved');
  };

  const handleCancel = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    if (page) {
      setTitle(page.title);
      setBody(page.content_md);
      setEditing(false);
    } else {
      navigate(`/admin/wiki/${HOME_SLUG}`);
    }
  };

  // Keyboard: ⌘/Ctrl+S saves, Esc cancels, ⌘/Ctrl+K focuses search, "e" edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's' && editing) {
        e.preventDefault();
        void handleSave();
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && editing) {
        handleCancel();
      } else if (
        e.key === 'e' &&
        !editing &&
        !mod &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setEditing(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Warn on tab close with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const handleDelete = async () => {
    if (!page) return;
    if (!confirm(`Delete "${page.title}"? This cannot be undone.`)) return;
    await del.mutateAsync(slug);
    navigate(`/admin/wiki/${HOME_SLUG}`);
  };

  const handleNew = () => {
    const t = window.prompt('New page title (e.g. "Onboarding Checklist"):');
    if (!t?.trim()) return;
    const newSlug = toWikiSlug(t);
    if (!newSlug) return;
    navigate(`/admin/wiki/${newSlug}`);
  };

  /** Breadcrumb trail via parent_slug. */
  const trail = useMemo(() => {
    const map = new Map(pages.map((p) => [p.slug, p]));
    const out: { slug: string; title: string }[] = [];
    let cur = map.get(slug)?.parent_slug ?? null;
    let guard = 0;
    while (cur && guard++ < 20) {
      const p = map.get(cur);
      if (!p) break;
      out.unshift({ slug: p.slug, title: p.title });
      cur = p.parent_slug ?? null;
    }
    return out;
  }, [pages, slug]);

  const words = useMemo(
    () => (page?.content_md || '').trim().split(/\s+/).filter(Boolean).length,
    [page?.content_md],
  );

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(page?.content_md || body || '');
    toast.success('Markdown copied — paste it into any LLM or chat');
  };

  const searching2 = search.trim().length >= 2;

  // Sidebar width: dragged, clamped, remembered per device.
  const [sidebarWidth, setSidebarWidth] = useState<number>(readStoredWidth);
  const widthRef = useRef(sidebarWidth);
  widthRef.current = sidebarWidth;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { localStorage.setItem(SIDEBAR_KEY, String(widthRef.current)); } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Keyboard: a drag handle nobody can reach without a mouse is half a feature.
  const nudge = (delta: number) => {
    const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, widthRef.current + delta));
    setSidebarWidth(next);
    try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* ignore */ }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <div
          className="flex flex-col lg:flex-row gap-6"
          style={{ ['--wiki-sidebar' as string]: `${sidebarWidth}px` }}
        >
          {/* Sidebar — steps aside while WRITING an existing page: the moment
              full width is needed is known (edit mode), so no show/hide buttons.
              A NEW page auto-opens in edit mode — hiding the tree there made the
              whole wiki look empty (/admin/wiki lands on a not-yet-created
              HomePage, live 2026-08-20), so new-page editing keeps navigation. */}
          <aside className={editing && page ? 'hidden' : 'w-full lg:w-[var(--wiki-sidebar)] lg:shrink-0 min-w-0 space-y-3'}>
            {/* A reading surface, not a dashboard. A full-width filled button
                is the loudest thing a page can contain, and it was pointed at
                the rarest action here: most visits read, some edit, few create
                (Magnus 2026-08-29 — "fokus ska vara på content och läsbarhet").
                Creation moves to a quiet + beside the title, the Notion/Docs
                placement; search keeps the weight, because finding is what
                people actually came to do. */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="h-5 w-5 text-primary shrink-0" />
                <h1 className="font-serif text-lg font-bold text-foreground truncate">Wiki</h1>
                <span className="text-xs text-muted-foreground shrink-0">{pages.length}</span>
              </div>
              <Button
                onClick={handleNew}
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="New page"
                aria-label="New page"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search pages & content…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 pr-12 h-9"
              />
              <kbd className="pointer-events-none absolute right-2 top-2 rounded border bg-muted px-1 text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </div>
            <ScrollArea className="h-[calc(100vh-280px)] rounded-md border [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!w-full [&>[data-radix-scroll-area-viewport]>div]:!min-w-0">
              {searching2 ? (
                <div className="p-1">
                  <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {searching ? 'Searching…' : `${searchHits.length} results`}
                  </p>
                  {searchHits.map((h) => {
                    const idx = h.content_md
                      ?.toLowerCase()
                      .indexOf(search.trim().toLowerCase());
                    const snippet =
                      idx != null && idx >= 0
                        ? h.content_md.slice(Math.max(0, idx - 40), idx + 80)
                        : '';
                    return (
                      <Link
                        key={h.slug}
                        to={`/admin/wiki/${h.slug}`}
                        className="block rounded px-2 py-1.5 hover:bg-accent"
                      >
                        <div className="truncate text-sm">{h.title}</div>
                        {snippet && (
                          <div className="line-clamp-2 text-[11px] text-muted-foreground">
                            …{snippet}…
                          </div>
                        )}
                      </Link>
                    );
                  })}
                  {!searching && searchHits.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      No matches.
                    </p>
                  )}
                </div>
              ) : (
                <WikiTree pages={pages} activeSlug={slug} />
              )}
            </ScrollArea>
          </aside>

          {/* The drag handle. Hidden on small screens (the layout stacks) and in
              edit mode (the tree is gone), so it never offers a grip on nothing.
              Double-click restores the default — a reader who drags too far
              should not have to guess the original number. */}
          {!(editing && page) && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the page list"
              aria-valuenow={sidebarWidth}
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              tabIndex={0}
              onPointerDown={startResize}
              onDoubleClick={() => nudge(SIDEBAR_DEFAULT - sidebarWidth)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-16); }
                if (e.key === 'ArrowRight') { e.preventDefault(); nudge(16); }
              }}
              className="hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center rounded-full bg-transparent transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Drag to resize · double-click to reset"
            >
              <div className="h-8 w-0.5 rounded-full bg-border" />
            </div>
          )}

          {/* Main */}
          <main className={editing && page ? 'w-full space-y-4' : 'flex-1 min-w-0 space-y-4'}>
            {trail.length > 0 && (
              <nav className="flex items-center gap-1 text-xs text-muted-foreground">
                {trail.map((t) => (
                  <span key={t.slug} className="flex items-center gap-1">
                    <Link to={`/admin/wiki/${t.slug}`} className="hover:text-foreground">
                      {t.title}
                    </Link>
                    <ChevronRight className="h-3 w-3" />
                  </span>
                ))}
                <span className="text-foreground">{page?.title || slug}</span>
              </nav>
            )}

            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                {editing ? (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-2xl font-bold border-none px-0 focus-visible:ring-0 h-auto"
                    placeholder="Page title"
                  />
                ) : (
                  <h2 className="text-2xl font-bold tracking-tight">{page?.title || slug}</h2>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {slug}
                  </Badge>
                  {page && (
                    <span className="text-xs text-muted-foreground">
                      {provenanceOf(page.created_by, (page as any).created_by_agent)
                        ? `Created by ${provenanceOf(page.created_by, (page as any).created_by_agent)} · `
                        : ''}
                      Updated {formatDateTime(page.updated_at)}
                      {provenanceOf(page.updated_by, (page as any).updated_by_agent)
                        ? ` by ${provenanceOf(page.updated_by, (page as any).updated_by_agent)}`
                        : ''}
                      {' '}· {words} words · {Math.max(1, Math.round(words / 200))} min read
                    </span>
                  )}
                  {!page && !isLoading && <Badge variant="secondary">New page</Badge>}
                  {dirty && (
                    <Badge variant="secondary" className="text-[10px]">
                      Unsaved
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <AIMarkdownToolbar value={body} onChange={setBody} context={title || slug} />
                    <Toggle
                      size="sm"
                      pressed={splitPreview}
                      onPressedChange={setSplitPreview}
                      aria-label="Live preview"
                    >
                      <Columns2 className="h-3.5 w-3.5 mr-1.5" /> Preview
                    </Toggle>
                    <Button variant="ghost" size="sm" onClick={handleCancel}>
                      <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={upsert.isPending || !user}>
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      {upsert.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <>
                    {page && <WikiHistorySheet slug={slug!} />}
                    <Button variant="ghost" size="sm" onClick={copyMarkdown} title="Copy markdown">
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy MD
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                    {page && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDelete}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            <Separator />

            {editing ? (
              <div className="space-y-2">
                <div className={splitPreview ? 'grid gap-4 lg:grid-cols-2' : ''}>
                  <Textarea
                    data-ai-md-target
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[60vh] font-mono text-sm leading-relaxed"
                    placeholder={`# ${title || slug}\n\nWrite anything. Mention OtherPage to link to it.`}
                  />
                  {splitPreview && (
                    <div className="min-h-[60vh] overflow-auto rounded-md border bg-card p-6">
                      <WikiMarkdown content={body} knownSlugs={knownSlugs} titles={titleMap} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <code>[[OtherPage]]</code> or <code>CamelCase</code> links pages — missing ones
                  turn red and are created on click. <kbd>⌘S</kbd> save · <kbd>Esc</kbd> cancel.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-6">
                <div
                  onDoubleClick={() => setEditing(true)}
                  className="col-span-12 xl:col-span-9 rounded-md border bg-card p-6 cursor-text"
                  title="Double-click to edit (or press E)"
                >
                  {isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading…</div>
                  ) : (
                    <WikiMarkdown content={page?.content_md || ''} knownSlugs={knownSlugs} titles={titleMap} />
                  )}
                </div>
                <div className="hidden xl:block xl:col-span-3">
                  <WikiTOC content={page?.content_md || ''} />
                </div>
              </div>
            )}

            {/* Backlinks */}
            {!editing && backlinks.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Link2 className="h-3 w-3" /> Linked from
                </p>
                <ul className="flex flex-wrap gap-2">
                  {backlinks.map((b) => (
                    <li key={b.slug}>
                      <Link
                        to={`/admin/wiki/${b.slug}`}
                        className="inline-flex items-center rounded-full border px-3 py-1 text-xs hover:bg-accent"
                      >
                        {b.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </main>
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}

