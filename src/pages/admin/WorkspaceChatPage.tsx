import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { Link } from 'react-router-dom';
import {
  ALL_WORKSPACE_SOURCES,
  useWorkspaceChat,
  type WorkspaceSource,
} from '@/hooks/useWorkspaceChat';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import { useCoworkSettings } from '@/hooks/useCoworkSettings';
import { CitationsDrawer } from '@/components/admin/workspace/CitationsDrawer';
import { CoworkSettingsPanel } from '@/components/admin/workspace/CoworkSettingsPanel';
import { SessionPicker } from '@/components/admin/workspace/SessionPicker';
import {
  AttachmentChip,
  type CoworkAttachment,
} from '@/components/admin/workspace/AttachmentChip';
import { MessageBubble } from '@/components/admin/workspace/MessageBubble';
import { AgentFeed } from '@/components/admin/workspace/AgentFeed';
import {
  Send,
  Square,
  Sparkles,
  MessageSquarePlus,
  Globe,
  Database,
  Brain,
  Paperclip,
  PanelRight,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import {
  buildAttachmentContext,
  detectKind,
  parseAttachment,
} from '@/lib/cowork-attachments';
import { supabase } from '@/integrations/supabase/client';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export default function WorkspaceChatPage() {
  const { toast } = useToast();
  const enabled = useIsModuleEnabled('workspaceChat');
  const { data: settings } = useCoworkSettings();
  const [sources, setSources] = useState<WorkspaceSource[]>(ALL_WORKSPACE_SOURCES);
  const [input, setInput] = useState('');
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

  // Apply saved defaults the first time settings load
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current && settings?.defaultSources?.length) {
      setSources(settings.defaultSources);
      hydrated.current = true;
    }
  }, [settings?.defaultSources]);

  const { messages, isStreaming, send, stop, reset, loadHistory, lastContextMeta, regenerate } = useWorkspaceChat({
    sources,
    mode: settings?.mode,
    onError: (msg) =>
      toast({ title: 'Cowork Chat', description: msg, variant: 'destructive' }),
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
    onPersistAssistant: async (text, citations) => {
      const id = activeSessionRef.current;
      if (id) {
        await appendMessage(id, 'assistant', text, { citations });
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
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    activeSessionRef.current = null;
    setAttachments([]);
    reset();
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (id === activeSessionId) handleNewChat();
  };

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
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
              <h2 className="text-xl font-semibold">Cowork Chat is disabled</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Enable the Cowork Chat module to ask questions about your
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

  const mode = settings?.mode ?? 'cowork';
  const worldOn = mode === 'cowork' && settings?.allowWorldKnowledge !== false;
  const webOn = mode === 'cowork' && settings?.allowWebSearch !== false;

  const isEmpty = messages.length === 0;

  return (
    <AdminLayout>
      <div
        className="h-[calc(100vh-4rem)] flex flex-col bg-background"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* ── Slim header ─────────────────────────────────────────────── */}
        <div className="border-b border-border/40 px-4 md:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Cowork</span>
            </div>
            <SessionPicker
              sessions={sessions}
              activeId={activeSessionId}
              onSelect={handleSelectSession}
              onNew={handleNewChat}
              onRename={renameSession}
              onDelete={handleDeleteSession}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
            <CoworkSettingsPanel />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
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
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0">
          {isEmpty ? (
            // ── Hero (Grok-style centered intro) ─────────────────────────
            <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-16">
              <div className="w-full max-w-2xl space-y-8 text-center">
                <AgentFeed />
                <div className="space-y-3">
                  <Sparkles className="h-10 w-10 mx-auto text-primary/80" />
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
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
                  onKeyDown={handleKeyDown}
                  isStreaming={isStreaming}
                  onStop={stop}
                  onPickFiles={handlePickFiles}
                  fileInputRef={fileInputRef}
                  onFiles={handleFiles}
                  mode={mode}
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
                  <AgentFeed />
                  {messages.map((m, idx) => {
                    const isLast = idx === messages.length - 1;
                    return (
                      <MessageBubble
                        key={m.id}
                        role={m.role}
                        content={m.content}
                        isStreaming={isStreaming && isLast && m.role === 'assistant'}
                        canRegenerate={
                          m.role === 'assistant' &&
                          isLast &&
                          !isStreaming
                        }
                        onRegenerate={regenerate}
                      />
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
                    onKeyDown={handleKeyDown}
                    isStreaming={isStreaming}
                    onStop={stop}
                    onPickFiles={handlePickFiles}
                    fileInputRef={fileInputRef}
                    onFiles={handleFiles}
                    mode={mode}
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
      </div>
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
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;
  onStop: () => void;
  onPickFiles: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFiles: (files: FileList | File[]) => void;
  mode: 'strict' | 'cowork';
  large?: boolean;
}

function CoworkComposer({
  input,
  setInput,
  attachments,
  removeAttachment,
  onSubmit,
  onKeyDown,
  isStreaming,
  onStop,
  onPickFiles,
  fileInputRef,
  onFiles,
  mode,
  large,
}: ComposerProps) {
  const ready = attachments.filter((a) => a.status === 'ready').length;
  const canSend = (input.trim().length > 0 || ready > 0) && !isStreaming;

  return (
    <form onSubmit={onSubmit}>
      <div
        className={`rounded-2xl border border-border/60 bg-card shadow-sm focus-within:border-primary/40 focus-within:shadow-md transition-shadow ${
          large ? 'p-3' : 'p-2'
        }`}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-2 border-b border-border/40 mb-2">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => removeAttachment(a.id)}
              />
            ))}
          </div>
        )}

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            mode === 'strict'
              ? 'Ask about your workspace data…'
              : 'Ask anything — or drop a file to dig into…'
          }
          className={`border-0 shadow-none focus-visible:ring-0 resize-none px-2 ${
            large ? 'min-h-[64px] max-h-40 text-base' : 'min-h-[44px] max-h-32 text-sm'
          }`}
          disabled={isStreaming}
        />

        <div className="flex items-center justify-between pt-1.5 px-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPickFiles}
            disabled={isStreaming}
            className="text-muted-foreground gap-1.5 h-8"
          >
            <Paperclip className="h-4 w-4" />
            <span className="text-xs hidden sm:inline">Attach</span>
          </Button>

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

          {isStreaming ? (
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onStop}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="h-8 w-8 rounded-lg" disabled={!canSend}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
