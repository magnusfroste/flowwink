import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ALL_WORKSPACE_SOURCES,
  useWorkspaceChat,
  type WorkspaceSource,
  type ChatDocument,
} from '@/hooks/useWorkspaceChat';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import { toPersistableStaged } from '@/lib/staged-action-outcome';
import { useCoworkSettings } from '@/hooks/useCoworkSettings';
import { CitationsDrawer } from '@/components/admin/workspace/CitationsDrawer';
import { CoworkSettingsPanel } from '@/components/admin/workspace/CoworkSettingsPanel';
import { SessionPicker } from '@/components/admin/workspace/SessionPicker';
import { SessionsAside } from '@/components/admin/workspace/SessionsAside';
import { ChatShell } from '@/components/admin/chat/ChatShell';
import { ChatSidePanel } from '@/components/admin/chat/ChatSidePanel';
import { DocumentPanel } from '@/components/admin/chat/DocumentPanel';
import { ChatComposer } from '@/components/admin/chat/ChatComposer';
import {
  AttachmentChip,
  type CoworkAttachment,
} from '@/components/admin/workspace/AttachmentChip';
import { MessageBubble } from '@/components/admin/workspace/MessageBubble';
import { StagedActionCard } from '@/components/admin/workspace/StagedActionCard';
import {
  Sparkles,
  Workflow,
  MessageSquarePlus,
  Globe,
  Database,
  Brain,
  PanelRight,
  FileText,
  BookOpen,
  Loader2,
  Gauge,
  GitPullRequestArrow,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import {
  buildAttachmentContext,
  detectKind,
  parseAttachment,
} from '@/lib/cowork-attachments';
import { supabase } from '@/integrations/supabase/client';
import { StartVideoCallButton } from '@/components/meet/StartVideoCallButton';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const SOURCES_LS_KEY = 'flowwork.sources.v1';

export default function WorkspaceChatPage() {
  const { toast } = useToast();
  const enabled = useIsModuleEnabled('workspaceChat');
  const { data: settings } = useCoworkSettings();
  // The source selection is the user's own dial — it survives reloads. A
  // saved choice beats the admin default; RLS decides what each source can
  // actually show this person.
  const [sources, setSourcesState] = useState<WorkspaceSource[]>(() => {
    try {
      const raw = localStorage.getItem(SOURCES_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((s): s is WorkspaceSource => ALL_WORKSPACE_SOURCES.includes(s));
        }
      }
    } catch { /* fall through to default */ }
    return ALL_WORKSPACE_SOURCES;
  });
  const setSources = (next: WorkspaceSource[]) => {
    setSourcesState(next);
    try { localStorage.setItem(SOURCES_LS_KEY, JSON.stringify(next)); } catch { /* */ }
  };
  const [input, setInput] = useState('');
  // Per-session mode override — the saved admin default is the starting point.
  const [modeOverride, setModeOverride] = useState<'strict' | 'cowork' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The right panel's tab: sessions by default, sources when a citation is
  // opened. On phones (no panel) sources open in the sheet instead.
  // An opened output fills the right panel; otherwise it shows the overview.
  const [docFocus, setDocFocus] = useState(false);
  // The document beside the chat (write_document). `docSaved` is the text as
  // last saved — dirty is a comparison, not a flag to forget to reset.
  const [doc, setDoc] = useState<ChatDocument | null>(null);
  const [docSaved, setDocSaved] = useState<string | null>(null);
  const [docUndo, setDocUndo] = useState<ChatDocument[]>([]);
  const docRef = useRef<ChatDocument | null>(null);
  docRef.current = doc;
  const handleDocument = useCallback((d: ChatDocument) => {
    const prev = docRef.current;
    if (prev) setDocUndo((u) => [...u.slice(-9), prev]);
    // A revision of a saved page stays that page.
    setDoc({ ...d, slug: d.slug ?? prev?.slug ?? null });
    setDocFocus(true);
  }, []);
  const clearDocument = () => { setDoc(null); setDocSaved(null); setDocUndo([]); setDocFocus(false); };
  const openSources = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) setDocFocus(false);
    else setSheetOpen(true);
  };
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<CoworkAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sessions
  const {
    sessions,
    refresh: refreshSessions,
    createSession,
    renameSession,
    deleteSession,
    loadMessages,
    appendMessage,
  } = useWorkspaceSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  useEffect(() => { activeSessionRef.current = activeSessionId; }, [activeSessionId]);

  // Apply the admin default the first time settings load — but never over a
  // choice this user already made and saved.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !settings?.defaultSources?.length) return;
    hydrated.current = true;
    try {
      if (localStorage.getItem(SOURCES_LS_KEY)) return;
    } catch { /* */ }
    setSourcesState(settings.defaultSources);
  }, [settings?.defaultSources]);

  const effectiveMode: 'strict' | 'cowork' = modeOverride ?? settings?.mode ?? 'cowork';

  const { messages, isStreaming, send, stop, reset, loadHistory, lastContextMeta, regenerate, resolveStaged } = useWorkspaceChat({
    sources,
    mode: effectiveMode,
    document: doc,
    onDocument: handleDocument,
    onError: (msg) =>
      toast({ title: 'Flowwork', description: msg, variant: 'destructive' }),
    onFirstMessage: async (text) => {
      if (activeSessionRef.current) return activeSessionRef.current;
      const id = await createSession(text);
      if (id) {
        setActiveSessionId(id);
        activeSessionRef.current = id;
      }
      return id;
    },
    onPersistUser: async (text) => {
      const id = activeSessionRef.current;
      if (id) await appendMessage(id, 'user', text);
    },
    onPersistAssistant: async (text, citations, staged, grounding) => {
      const id = activeSessionRef.current;
      if (id) {
        // Only the IDENTITY of the staged actions is stored here. Their outcome
        // belongs to pending_operations and is re-read on load — see
        // src/lib/staged-action-outcome.ts.
        const persistable = toPersistableStaged(staged as unknown as Record<string, unknown>[]);
        await appendMessage(id, 'assistant', text, {
          citations,
          // The receipt knowledge_gap_report reads — same field as the public chat.
          ...(grounding ? { grounding } : {}),
          ...(persistable.length ? { staged: persistable } : {}),
        });
        await refreshSessions();
      }
    },
  });

  const handleSelectSession = async (id: string) => {
    if (id === activeSessionId) return;
    const msgs = await loadMessages(id);
    setActiveSessionId(id);
    activeSessionRef.current = id;
    loadHistory(msgs);
    clearDocument();
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    activeSessionRef.current = null;
    setAttachments([]);
    reset();
    clearDocument();
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (id === activeSessionId) handleNewChat();
  };

  // Auto-open a session when arriving via /admin/flowwork?session=<id>
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const wanted = searchParams.get('session');
    if (!wanted || wanted === activeSessionId) return;
    // Wait until sessions are loaded so we don't select a phantom id
    if (!sessions.some((s) => s.id === wanted)) return;
    handleSelectSession(wanted);
    searchParams.delete('session');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sessions]);



  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const citations = lastAssistant?.citations || [];

  // ── File upload handling ───────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (attachments.length + list.length > MAX_ATTACHMENTS) {
        toast({
          title: 'Too many files',
          description: `Maximum ${MAX_ATTACHMENTS} files per message.`,
          variant: 'destructive',
        });
        return;
      }

      for (const file of list) {
        if (file.size > MAX_FILE_BYTES) {
          toast({
            title: 'File too large',
            description: `${file.name} exceeds 20 MB.`,
            variant: 'destructive',
          });
          continue;
        }

        const kind = detectKind(file);
        const id = crypto.randomUUID();
        const placeholder: CoworkAttachment = {
          id,
          name: file.name,
          size: file.size,
          kind,
          status: kind === 'image' || kind === 'other' ? 'error' : 'parsing',
          startedAt: Date.now(),
          error:
            kind === 'image'
              ? 'Images not supported yet'
              : kind === 'other'
                ? 'Unsupported file type'
                : undefined,
        };
        setAttachments((prev) => [...prev, placeholder]);

        if (placeholder.status === 'error') {
          toast({
            title: 'Skipped',
            description: `${file.name}: ${placeholder.error}`,
            variant: 'destructive',
          });
          continue;
        }

        try {
          const result = await parseAttachment(file);
          if (result.pending) {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      documentId: result.documentId,
                      status: 'parsing',
                    }
                  : a,
              ),
            );
            continue;
          }
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, status: 'ready', text: result.text, documentId: result.documentId }
                : a,
            ),
          );
          if (result.truncated) {
            toast({
              title: 'Trimmed',
              description: `${file.name} was truncated to fit context window.`,
            });
          }
        } catch (e: any) {
          const msg = e?.message || 'Failed to read file';
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: 'error', error: msg } : a)),
          );
          toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
        }
      }
    },
    [attachments.length, toast],
  );

  useEffect(() => {
    const pendingDocs = attachments.filter(
      (a) => a.status === 'parsing' && a.documentId,
    );
    if (pendingDocs.length === 0) return;

    const interval = window.setInterval(async () => {
      const ids = pendingDocs
        .map((a) => a.documentId)
        .filter((id): id is string => Boolean(id));
      if (ids.length === 0) return;

      const { data, error } = await supabase
        .from('documents')
        .select('id, content_md, extraction_status, extraction_error')
        .in('id', ids);

      if (error || !data) return;

      setAttachments((prev) =>
        prev.map((attachment) => {
          if (!attachment.documentId || attachment.status !== 'parsing') return attachment;
          const doc = data.find((row) => row.id === attachment.documentId);
          if (!doc) return attachment;
          if (doc.extraction_status === 'success' && doc.content_md) {
            return {
              ...attachment,
              status: 'ready',
              text: doc.content_md,
              error: undefined,
            };
          }
          if (doc.extraction_status === 'failed' || doc.extraction_status === 'unsupported') {
            return {
              ...attachment,
              status: 'error',
              error: doc.extraction_error || 'Failed to extract text from PDF',
            };
          }
          return attachment;
        }),
      );
    }, 2000);

    return () => window.clearInterval(interval);
  }, [attachments]);

  const handlePickFiles = () => fileInputRef.current?.click();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStreaming) return;
    const ready = attachments.filter((a) => a.status === 'ready');
    const hasParsing = attachments.some((a) => a.status === 'parsing');
    if (hasParsing) {
      toast({
        title: 'Wait',
        description: 'Files are still being processed.',
      });
      return;
    }
    if (!input.trim() && ready.length === 0) return;

    const ctx = buildAttachmentContext(ready);
    const final = ctx
      ? `${ctx}${input.trim() || 'Please summarize the attached file(s).'}`
      : input.trim();

    send(final);
    setInput('');
    setAttachments([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  if (!enabled) {
    return (
      <AdminLayout>
        <div className="container mx-auto max-w-2xl py-12">
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">Flowwork is disabled</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Enable the Flowwork module to ask questions about your
                workspace data combined with the model's own knowledge.
              </p>
              <Button asChild>
                <Link to="/admin/modules">Manage modules</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const mode = effectiveMode;
  const worldOn = mode === 'cowork' && settings?.allowWorldKnowledge !== false;
  const webOn = mode === 'cowork' && settings?.allowWebSearch !== false;

  const isEmpty = messages.length === 0;

  return (
    <AdminLayout>
      <ChatShell
        icon={<Sparkles className="h-4 w-4 text-primary" />}
        title="Flowwork"
        onDrop={handleDrop}
        mobileSessions={
          <SessionPicker
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={handleSelectSession}
            onNew={handleNewChat}
            onRename={renameSession}
            onDelete={handleDeleteSession}
          />
        }
        sessions={
          <SessionsAside
            side="left"
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={handleSelectSession}
            onNew={handleNewChat}
            onRename={renameSession}
            onDelete={handleDeleteSession}
            viewAllHref="/admin/flowwork/sessions"
          />
        }
        aside={
          <ChatSidePanel
            focus={doc && docFocus ? {
              title: doc.title || 'Document',
              content: (
                <DocumentPanel
                  doc={doc}
                  onChange={setDoc}
                  canUndo={docUndo.length > 0}
                  onUndo={() => {
                    const last = docUndo[docUndo.length - 1];
                    if (!last) return;
                    setDocUndo((u) => u.slice(0, -1));
                    setDoc({ ...last, slug: last.slug ?? doc.slug });
                  }}
                  dirty={docSaved === null || docSaved !== doc.content_md}
                  onSaved={(slug) => { setDoc({ ...doc, slug }); setDocSaved(doc.content_md); }}
                />
              ),
            } : null}
            onCloseFocus={() => setDocFocus(false)}
            sections={[
              {
                id: 'running',
                title: 'Running',
                icon: Loader2,
                hidden: !isStreaming,
                content: <p className="text-muted-foreground">Working on your message…</p>,
              },
              {
                id: 'outputs',
                title: 'Outputs',
                icon: FileText,
                hidden: !doc,
                content: doc ? (
                  <button type="button" onClick={() => setDocFocus(true)} className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 text-left hover:border-primary/40">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{doc.title || 'Document'}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {doc.slug ? (docSaved === doc.content_md ? `Wiki ${doc.slug} · saved` : `Wiki ${doc.slug} · unsaved changes`) : 'Draft — not saved'}
                      </span>
                    </span>
                  </button>
                ) : null,
              },
              {
                id: 'changes',
                title: 'Changes',
                icon: GitPullRequestArrow,
                hidden: !messages.some((m) => m.staged?.length),
                meta: (() => {
                  const open = messages.flatMap((m) => m.staged ?? []).filter((a) => !a.resolution).length;
                  return open ? `${open} waiting` : undefined;
                })(),
                content: (
                  <ul className="space-y-1">
                    {messages.flatMap((m) => m.staged ?? []).map((a) => (
                      <li key={a.operation_id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{a.skill.replace(/_/g, ' ')}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">{a.resolution ?? 'awaiting approval'}</span>
                      </li>
                    ))}
                    <li className="pt-1"><Link to="/admin/approvals" className="text-primary hover:underline">Approvals →</Link></li>
                  </ul>
                ),
              },
              {
                id: 'context',
                title: 'Context',
                icon: Gauge,
                meta: lastContextMeta?.window_tokens && lastContextMeta.prompt_tokens_est != null
                  ? `${Math.round((lastContextMeta.prompt_tokens_est / lastContextMeta.window_tokens) * 100)}%`
                  : undefined,
                content: (
                  <div className="space-y-1 text-muted-foreground">
                    <p>{mode === 'strict' ? 'Grounded — workspace data only' : `Cowork — workspace${worldOn ? ', model' : ''}${webOn ? ', web' : ''}`}</p>
                    {lastContextMeta ? (
                      <>
                        <p>{(lastContextMeta.tokens_used / 1000).toFixed(1)}k of {(lastContextMeta.tokens_budget / 1000).toFixed(0)}k tokens of workspace context · {lastContextMeta.sources_active} sources</p>
                        {lastContextMeta.sources_truncated.length > 0 && <p className="text-warning">Truncated: {lastContextMeta.sources_truncated.join(', ')}</p>}
                        {lastContextMeta.history_distilled && <p>Older turns are summarized to fit the model window.</p>}
                      </>
                    ) : <p>Shown after the first answer.</p>}
                  </div>
                ),
              },
              {
                id: 'sources',
                title: 'Sources',
                icon: BookOpen,
                meta: citations.length > 0 ? `${citations.length} cited` : undefined,
                content: (
                  <CitationsDrawer
                    citations={citations}
                    sources={sources}
                    onSourcesChange={setSources}
                    onResetSources={() =>
                      setSources(settings?.defaultSources || ALL_WORKSPACE_SOURCES)
                    }
                    activeCitation={activeCitation}
                    onActiveCitationChange={setActiveCitation}
                  />
                ),
              },
            ]}
          />
        }
        actions={
          <>
            {/* Pull a colleague into what you are working on: the room is named after this chat. */}
            <StartVideoCallButton
              iconOnly
              label="Start video call"
              variant="ghost"
              className="h-8 w-8"
              roomName={sessions.find((s) => s.id === activeSessionId)?.title ?? null}
            />
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Database className="h-3 w-3" /> Workspace
            </Badge>
            {worldOn && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Brain className="h-3 w-3" /> Model
              </Badge>
            )}
            {webOn && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Globe className="h-3 w-3" /> Web
              </Badge>
            )}
            {mode === 'strict' && (
              <Badge variant="outline" className="text-[10px]">Strict</Badge>
            )}
            {lastContextMeta && (
              <Badge
                variant={lastContextMeta.sources_truncated.length > 0 ? 'destructive' : 'outline'}
                className="text-[10px]"
                title={`Truncated: ${lastContextMeta.sources_truncated.join(', ') || 'none'}`}
              >
                {(lastContextMeta.tokens_used / 1000).toFixed(1)}k tok
              </Badge>
            )}
            {lastContextMeta?.window_tokens && lastContextMeta.prompt_tokens_est != null && (() => {
              const meta = lastContextMeta;
              const pct = meta.prompt_tokens_est! / meta.window_tokens!;
              const level: 'green' | 'amber' | 'red' = pct >= 0.85 ? 'red' : pct >= 0.7 ? 'amber' : 'green';
              const approx = meta.window_known === false ? '~' : '';
              const label = `${approx}${Math.round(pct * 100)}% window`;
              const title =
                level === 'green'
                  ? `Estimated prompt ${approx}${Math.round(meta.prompt_tokens_est! / 1000)}k of ${Math.round(meta.window_tokens! / 1000)}k token window`
                  : level === 'amber'
                    ? 'Long session — a new session keeps answers sharp'
                    : `Near the model's context window — older turns are ${meta.history_distilled ? 'being summarized' : 'trimmed'} to keep the session alive. A new session keeps answers sharp.`;
              return (
                <Badge
                  variant={level === 'red' ? 'destructive' : 'outline'}
                  className={
                    level === 'amber'
                      ? 'text-[10px] border-warning/50 text-warning'
                      : 'text-[10px]'
                  }
                  title={title}
                >
                  {label}
                  {meta.history_distilled ? ' · distilled' : ''}
                </Badge>
              );
            })()}
            <CoworkSettingsPanel />
            <Button variant="ghost" size="sm" className="gap-1.5 hidden md:inline-flex" onClick={() => setDocFocus(false)}>
              <PanelRight className="h-4 w-4" />
              <span className="text-xs">
                Sources{citations.length > 0 ? ` · ${citations.length} cited` : ''}
              </span>
            </Button>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 md:hidden">
                  <PanelRight className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">
                    Sources{citations.length > 0 ? ` · ${citations.length} cited` : ''}
                  </span>
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[340px] sm:w-[400px] overflow-y-auto">
                <SheetHeader className="mb-4">
                  <SheetTitle>Sources & citations</SheetTitle>
                </SheetHeader>
                <CitationsDrawer
                  citations={citations}
                  sources={sources}
                  onSourcesChange={setSources}
                  onResetSources={() =>
                    setSources(settings?.defaultSources || ALL_WORKSPACE_SOURCES)
                  }
                  activeCitation={activeCitation}
                  onActiveCitationChange={setActiveCitation}
                />
              </SheetContent>
            </Sheet>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={isStreaming || messages.length === 0}
              className="gap-1.5"
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">New</span>
            </Button>
          </>
        }
      >
        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0">
          {isEmpty ? (
            // ── Hero (Grok-style centered intro) ─────────────────────────
            <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-16">
              <div className="w-full max-w-2xl space-y-8 text-center">
                <div className="space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                    <Workflow className="h-7 w-7 text-primary" strokeWidth={1.75} />
                  </div>
                  <h1 className="font-serif text-2xl font-bold text-foreground md:text-4xl">
                    What do you want to work on?
                  </h1>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Ask about your workspace data, attach a file to dig into,
                    {webOn ? ' or pull live info from the web.' : ' or chat with the model.'}
                  </p>
                </div>

                <CoworkComposer
                  input={input}
                  setInput={setInput}
                  attachments={attachments}
                  removeAttachment={(id) =>
                    setAttachments((prev) => prev.filter((a) => a.id !== id))
                  }
                  onSubmit={handleSubmit}
                  isStreaming={isStreaming}
                  onStop={stop}
                  onPickFiles={handlePickFiles}
                  fileInputRef={fileInputRef}
                  onFiles={handleFiles}
                  mode={mode}
                  onModeChange={setModeOverride}
                  sources={sources}
                  onSourcesChange={setSources}
                  onResetSources={() =>
                    setSources(settings?.defaultSources || ALL_WORKSPACE_SOURCES)
                  }
                  webAvailable={settings?.allowWebSearch !== false}
                  large
                />

                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  {[
                    'Which contracts renew in the next 60 days?',
                    'Summarize my top 5 leads by score.',
                    webOn ? 'What are competitors doing this week?' : 'What KB articles cover onboarding?',
                  ].map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="text-xs rounded-full"
                      onClick={() => setInput(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // ── Conversation view ─────────────────────────────────────────
            <>
              <ScrollArea className="flex-1 min-h-0" ref={scrollRef as any}>
                <div className="px-4 py-6 max-w-3xl mx-auto w-full space-y-6">
                  {messages.map((m, idx) => {
                    const isLast = idx === messages.length - 1;
                    return (
                      <div key={m.id} className="space-y-2">
                      <MessageBubble
                        role={m.role}
                        content={m.content}
                        consulted={m.consulted}
                        isStreaming={isStreaming && isLast && m.role === 'assistant'}
                        canRegenerate={
                          m.role === 'assistant' &&
                          isLast &&
                          !isStreaming
                        }
                        onRegenerate={regenerate}
                        statusLabel={
                          isStreaming && isLast && m.role === 'assistant'
                            ? m.consulted?.length
                              ? 'Consulting live data…'
                              : 'Searching your workspace…'
                            : undefined
                        }
                        activeCitation={activeCitation}
                        onCitationHover={setActiveCitation}
                        onCitationClick={(ref) => {
                          setActiveCitation(ref);
                          openSources();
                        }}
                      />
                      {m.document && (
                        <button
                          type="button"
                          onClick={() => setDocFocus(true)}
                          className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-left text-sm hover:border-primary/40 transition-colors"
                        >
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="min-w-0">
                            <span className="block font-medium truncate">{m.document.title}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              Document{m.document.slug ? ` · wiki ${m.document.slug}` : ' · draft'} — open beside the chat
                            </span>
                          </span>
                        </button>
                      )}
                      {m.staged?.map((a) => (
                        <StagedActionCard
                          key={a.operation_id}
                          action={a}
                          onResolved={(resolution, note) =>
                            resolveStaged(m.id, a.operation_id, resolution, note)
                          }
                        />
                      ))}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="border-t border-border/40 bg-background/80 backdrop-blur px-4 py-3">
                <div className="max-w-3xl mx-auto w-full">
                  <CoworkComposer
                    input={input}
                    setInput={setInput}
                    attachments={attachments}
                    removeAttachment={(id) =>
                      setAttachments((prev) => prev.filter((a) => a.id !== id))
                    }
                    onSubmit={handleSubmit}
                    isStreaming={isStreaming}
                    onStop={stop}
                    onPickFiles={handlePickFiles}
                    fileInputRef={fileInputRef}
                    onFiles={handleFiles}
                    mode={mode}
                    onModeChange={setModeOverride}
                    sources={sources}
                    onSourcesChange={setSources}
                    onResetSources={() =>
                      setSources(settings?.defaultSources || ALL_WORKSPACE_SOURCES)
                    }
                    webAvailable={settings?.allowWebSearch !== false}
                  />
                  {sources.length === 0 && mode === 'strict' && (
                    <Alert className="mt-2">
                      <AlertDescription className="text-xs">
                        No sources selected — strict mode will refuse most questions.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ChatShell>
    </AdminLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Composer (shared between hero and conversation modes)
// ─────────────────────────────────────────────────────────────────────────

interface ComposerProps {
  input: string;
  setInput: (v: string) => void;
  attachments: CoworkAttachment[];
  removeAttachment: (id: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isStreaming: boolean;
  onStop: () => void;
  onPickFiles: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFiles: (files: FileList | File[]) => void;
  mode: 'strict' | 'cowork';
  onModeChange: (m: 'strict' | 'cowork') => void;
  sources: WorkspaceSource[];
  onSourcesChange: (next: WorkspaceSource[]) => void;
  onResetSources: () => void;
  webAvailable: boolean;
  large?: boolean;
}

const SOURCE_LABEL: Record<WorkspaceSource, string> = {
  documents: 'Documents',
  contracts: 'Contracts',
  kb: 'Knowledge Base',
  pages: 'Pages',
  crm: 'CRM',
  employees: 'Employees',
  wiki: 'Wiki',
  handbook: 'Handbook',
  flowtable: 'Flowtable',
};

function CoworkComposer({
  input,
  setInput,
  attachments,
  removeAttachment,
  onSubmit,
  isStreaming,
  onStop,
  onPickFiles,
  fileInputRef,
  onFiles,
  mode,
  onModeChange,
  sources,
  onSourcesChange,
  onResetSources,
  webAvailable,
  large,
}: ComposerProps) {
  const ready = attachments.filter((a) => a.status === 'ready').length;
  const canSend = (input.trim().length > 0 || ready > 0) && !isStreaming;

  return (
    <>
      <ChatComposer
        value={input}
        onChange={setInput}
        onSend={() => onSubmit({ preventDefault() {} } as React.FormEvent)}
        placeholder={
          mode === 'strict'
            ? 'Ask about your workspace data…'
            : 'Ask anything — or drop a file to dig into…'
        }
        disabled={isStreaming}
        busy={isStreaming}
        canSend={canSend}
        onStop={onStop}
        onAttach={onPickFiles}
        large={large}
        above={attachments.length > 0 ? attachments.map((a) => (
          <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
        )) : undefined}
        chips={
          <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Layers className="h-3 w-3" />
            {sources.length === ALL_WORKSPACE_SOURCES.length
              ? `${ALL_WORKSPACE_SOURCES.length} sources`
              : `${sources.length} of ${ALL_WORKSPACE_SOURCES.length} sources`}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-2">
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs font-medium">Sources</span>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                onClick={() => onSourcesChange([...ALL_WORKSPACE_SOURCES])}
              >
                All
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                onClick={() => onSourcesChange([])}
              >
                None
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                onClick={onResetSources}
                title="Reset to workspace default"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            {ALL_WORKSPACE_SOURCES.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`composer-src-${key}`}
                  checked={sources.includes(key)}
                  onCheckedChange={() =>
                    onSourcesChange(
                      sources.includes(key)
                        ? sources.filter((k) => k !== key)
                        : [...sources, key],
                    )
                  }
                />
                <Label
                  htmlFor={`composer-src-${key}`}
                  className="flex-1 cursor-pointer text-xs font-normal"
                >
                  {SOURCE_LABEL[key]}
                </Label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Grounded (strict) ⇄ Cowork (blended) */}
      <div className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 p-0.5">
        {([
          { key: 'strict' as const, label: 'Grounded', hint: 'Workspace data only' },
          { key: 'cowork' as const, label: 'Cowork', hint: 'Blend workspace, model & web' },
        ]).map((o) => (
          <button
            key={o.key}
            type="button"
            title={o.hint}
            onClick={() => onModeChange(o.key)}
            className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
              mode === o.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {webAvailable && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
            mode === 'cowork'
              ? 'border-border/60 bg-muted/30 text-muted-foreground'
              : 'border-dashed border-border/60 text-muted-foreground/60'
          }`}
          title={
            mode === 'cowork'
              ? 'Web search available — the assistant uses it only when the workspace has no answer'
              : 'Web search is off in Grounded mode'
          }
        >
          <Globe className="h-3 w-3" />
          Web {mode === 'cowork' ? 'on' : 'off'}
        </span>
      )}
          </>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.txt,.md,.markdown,.csv,.json,.log,.xml,.yml,.yaml,.html,.htm,.tsv,application/pdf,text/*,application/json"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
