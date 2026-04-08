import { useState, useEffect } from 'react';
import { BookMarked, RefreshCw, Settings2, ChevronRight, Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useHandbookConfig,
  useUpdateHandbookConfig,
  useHandbookChapters,
  useSyncHandbook,
  type HandbookConfig,
} from '@/hooks/useHandbook';
import ReactMarkdown from 'react-markdown';

export default function HandbookPage() {
  const { data: config } = useHandbookConfig();
  const updateConfig = useUpdateHandbookConfig();
  const { data: chapters = [], isLoading } = useHandbookChapters(config?.repoOwner, config?.repoName);
  const sync = useSyncHandbook();

  const [configOpen, setConfigOpen] = useState(false);
  const [form, setForm] = useState<HandbookConfig>({
    repoOwner: '',
    repoName: '',
    path: 'content/chapters',
    branch: 'main',
  });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const selectedChapter = chapters.find((c) => c.slug === selectedSlug) || chapters[0] || null;

  const handleSync = () => {
    if (config) sync.mutate(config);
  };

  const handleSaveConfig = () => {
    updateConfig.mutate(form);
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookMarked className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Handbook</h1>
              <p className="text-sm text-muted-foreground">
                Documentation synced from GitHub — {chapters.length} chapters
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigOpen(!configOpen)}
              className="gap-1.5"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Config
            </Button>
            <Button
              size="sm"
              onClick={handleSync}
              disabled={sync.isPending}
              className="gap-1.5"
            >
              {sync.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync
            </Button>
          </div>
        </div>

        {/* Config Panel */}
        <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
          <CollapsibleContent>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">GitHub Repository</CardTitle>
                <CardDescription>
                  Point to any public GitHub repo with markdown files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Owner</Label>
                    <Input
                      value={form.repoOwner}
                      onChange={(e) => setForm({ ...form, repoOwner: e.target.value })}
                      placeholder="magnusfroste"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Repository</Label>
                    <Input
                      value={form.repoName}
                      onChange={(e) => setForm({ ...form, repoName: e.target.value })}
                      placeholder="clawable"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Path</Label>
                    <Input
                      value={form.path}
                      onChange={(e) => setForm({ ...form, path: e.target.value })}
                      placeholder="content/chapters"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Branch</Label>
                    <Input
                      value={form.branch}
                      onChange={(e) => setForm({ ...form, branch: e.target.value })}
                      placeholder="main"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={handleSaveConfig} disabled={updateConfig.isPending}>
                  Save config
                </Button>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Reader */}
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            Loading chapters…
          </div>
        ) : chapters.length === 0 ? (
          <Card className="py-12 text-center">
            <CardContent>
              <p className="text-muted-foreground mb-3">No chapters synced yet.</p>
              <p className="text-sm text-muted-foreground">
                Configure the repository above and click <strong>Sync</strong>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-12 gap-4 min-h-[600px]">
            {/* TOC Sidebar */}
            <div className="col-span-3">
              <Card className="sticky top-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                    Chapters
                  </CardTitle>
                </CardHeader>
                <ScrollArea className="h-[560px]">
                  <div className="px-2 pb-2 space-y-0.5">
                    {chapters.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => setSelectedSlug(ch.slug)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedChapter?.slug === ch.slug
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted text-foreground/80'
                        }`}
                      >
                        <span className="truncate">{ch.title}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            </div>

            {/* Content */}
            <div className="col-span-9">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>{selectedChapter?.title}</CardTitle>
                    <Badge variant="outline" className="text-xs font-mono">
                      {selectedChapter?.file_path.split('/').pop()}
                    </Badge>
                  </div>
                  {selectedChapter?.frontmatter?.description && (
                    <CardDescription>
                      {selectedChapter.frontmatter.description as string}
                    </CardDescription>
                  )}
                </CardHeader>
                <Separator />
                <CardContent className="pt-6">
                  <ScrollArea className="h-[520px]">
                    <article className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{selectedChapter?.content || ''}</ReactMarkdown>
                    </article>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
