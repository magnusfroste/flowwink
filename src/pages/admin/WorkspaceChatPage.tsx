import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { Link } from 'react-router-dom';
import {
  ALL_WORKSPACE_SOURCES,
  useWorkspaceChat,
  type WorkspaceSource,
} from '@/hooks/useWorkspaceChat';
import { SourceFilterPanel } from '@/components/admin/workspace/SourceFilterPanel';
import { CitationsDrawer } from '@/components/admin/workspace/CitationsDrawer';
import { Send, Square, Sparkles, Loader2, MessageSquarePlus } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';

export default function WorkspaceChatPage() {
  const { toast } = useToast();
  const enabled = useIsModuleEnabled('workspaceChat');
  const [sources, setSources] = useState<WorkspaceSource[]>(ALL_WORKSPACE_SOURCES);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming, send, stop, reset } = useWorkspaceChat({
    sources,
    onError: (msg) =>
      toast({ title: 'Workspace Chat', description: msg, variant: 'destructive' }),
  });

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const citations = lastAssistant?.citations || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    send(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  if (!enabled) {
    return (
      <div className="container mx-auto max-w-2xl py-12">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Sparkles className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Workspace Chat is disabled</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Enable the Workspace Chat module to ask questions about your
              internal documents, contracts, KB, CRM and employee data.
            </p>
            <Button asChild>
              <Link to="/admin/modules">Manage modules</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between bg-background">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Workspace Chat
          </h1>
          <p className="text-xs text-muted-foreground">
            Ask questions about your own data — read-only, with source citations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset} disabled={isStreaming || messages.length === 0}>
          <MessageSquarePlus className="h-4 w-4 mr-1.5" /> New chat
        </Button>
      </div>

      {/* Body: 3-column layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr_300px] gap-4 p-4 min-h-0">
        {/* Left: source filter */}
        <aside className="hidden md:block min-h-0">
          <SourceFilterPanel
            selected={sources}
            onChange={setSources}
            onReset={() => setSources(ALL_WORKSPACE_SOURCES)}
          />
        </aside>

        {/* Center: chat */}
        <main className="flex flex-col min-h-0 min-w-0">
          <Card className="flex-1 flex flex-col min-h-0 border-border/60">
            <ScrollArea className="flex-1 min-h-0" ref={scrollRef as any}>
              <div className="p-6 space-y-6 max-w-3xl mx-auto w-full">
                {messages.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <Sparkles className="h-8 w-8 text-muted-foreground mx-auto" />
                    <h3 className="text-base font-medium">
                      What do you want to know?
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Ask about contracts expiring soon, top-scoring leads,
                      yesterday's deal moves, or any document in your vault.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center pt-3">
                      {[
                        'Which contracts renew in the next 60 days?',
                        'Summarize my top 5 leads by score.',
                        'What KB articles cover onboarding?',
                      ].map((s) => (
                        <Button
                          key={s}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setInput(s)}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        m.role === 'user'
                          ? 'flex justify-end'
                          : 'flex justify-start'
                      }
                    >
                      <div
                        className={
                          m.role === 'user'
                            ? 'max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5'
                            : 'max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 prose prose-sm dark:prose-invert max-w-none'
                        }
                      >
                        {m.role === 'user' ? (
                          <p className="whitespace-pre-wrap m-0 text-sm">{m.content}</p>
                        ) : m.content ? (
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="border-t border-border/60 p-3 bg-background/50">
              <form onSubmit={handleSubmit} className="flex gap-2 items-end max-w-3xl mx-auto w-full">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your documents, contracts, leads..."
                  className="min-h-[44px] max-h-32 resize-none"
                  disabled={isStreaming}
                />
                {isStreaming ? (
                  <Button type="button" variant="outline" size="icon" onClick={stop}>
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" disabled={!input.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </form>
              {sources.length === 0 && (
                <Alert className="mt-2 max-w-3xl mx-auto">
                  <AlertDescription className="text-xs">
                    No sources selected — answers will be ungrounded.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </Card>
        </main>

        {/* Right: citations */}
        <aside className="hidden md:block min-h-0">
          <CitationsDrawer citations={citations} />
        </aside>
      </div>
    </div>
  );
}
