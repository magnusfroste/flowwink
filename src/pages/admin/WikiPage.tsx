import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useIsModuleEnabled } from '@/hooks/useModules';
import {
  HOME_SLUG,
  toWikiSlug,
  useDeleteWikiPage,
  useUpsertWikiPage,
  useWikiBacklinks,
  useWikiPage,
  useWikiPages,
} from '@/hooks/useWiki';
import { WikiMarkdown } from '@/components/admin/wiki/WikiMarkdown';
import { BookOpen, Edit3, Eye, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

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

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');

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

  const filteredPages = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.toLowerCase();
    return pages.filter(
      (p) => p.slug.toLowerCase().includes(q) || p.title.toLowerCase().includes(q),
    );
  }, [pages, search]);

  const handleSave = async () => {
    if (!title.trim()) return;
    await upsert.mutateAsync({
      slug,
      title: title.trim(),
      content_md: body,
    });
    setEditing(false);
  };

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

  return (
    <AdminLayout>
      <AdminPageContainer>
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="col-span-12 lg:col-span-3 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Wiki</h1>
            </div>
            <Button onClick={handleNew} size="sm" className="w-full">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New page
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search pages…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-9"
              />
            </div>
            <ScrollArea className="h-[calc(100vh-260px)] rounded-md border">
              <ul className="p-1">
                {filteredPages.length === 0 && (
                  <li className="px-3 py-6 text-xs text-muted-foreground text-center">
                    No pages yet.
                  </li>
                )}
                {filteredPages.map((p) => (
                  <li key={p.slug}>
                    <Link
                      to={`/admin/wiki/${p.slug}`}
                      className={`block rounded px-2 py-1.5 text-sm hover:bg-accent ${
                        p.slug === slug ? 'bg-accent font-medium' : ''
                      }`}
                    >
                      <div className="truncate">{p.title}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {p.slug}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </aside>

          {/* Main */}
          <main className="col-span-12 lg:col-span-9 space-y-4">
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
                  <h2 className="text-2xl font-bold tracking-tight">
                    {page?.title || slug}
                  </h2>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {slug}
                  </Badge>
                  {page && (
                    <span className="text-xs text-muted-foreground">
                      Updated {format(new Date(page.updated_at), 'MMM d, yyyy HH:mm')}
                    </span>
                  )}
                  {!page && !isLoading && (
                    <Badge variant="secondary">New page</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (page) {
                          setTitle(page.title);
                          setBody(page.content_md);
                          setEditing(false);
                        } else {
                          navigate(`/admin/wiki/${HOME_SLUG}`);
                        }
                      }}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={upsert.isPending || !user}>
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      {upsert.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <>
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Edit3 className="h-3.5 w-3.5" /> Markdown
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Use <code>[[OtherPage]]</code> or <code>CamelCase</code> to link. Missing
                    pages turn red — click to create.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[55vh] font-mono text-sm"
                    placeholder={`# ${title || slug}\n\nWrite anything. Mention OtherPage to link to it.`}
                  />
                </CardContent>
              </Card>
            ) : (
              <div
                onDoubleClick={() => setEditing(true)}
                className="rounded-md border bg-card p-6 cursor-text"
                title="Double-click to edit"
              >
                {isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : (
                  <WikiMarkdown
                    content={page?.content_md || ''}
                    knownSlugs={knownSlugs}
                  />
                )}
              </div>
            )}

            {/* Backlinks */}
            {!editing && backlinks.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5" /> Linked from
                  </CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            )}
          </main>
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}
