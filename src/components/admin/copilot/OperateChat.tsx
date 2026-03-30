import { useRef, useEffect, useState } from 'react';
import { ArrowUp, Loader2, Terminal, RotateCcw, Wrench, Sparkles, X, Paperclip, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import type { OperateMessage } from '@/hooks/useAgentOperate';
import type { AgentSkill } from '@/types/agent';

interface OperateChatProps {
  messages: OperateMessage[];
  skills: AgentSkill[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onReset: () => void;
  onCancel?: () => void;
}

interface AttachedFile {
  name: string;
  url: string;
  storagePath: string;
  size: number;
}

const QUICK_ACTIONS = [
  { label: 'Analyze this week', action: 'Analyze my site traffic for this week' },
  { label: 'Write a blog post', action: 'Write a blog post about our latest product update' },
  { label: 'Check leads', action: 'Show me recent lead activity' },
];

function ToolStatusIndicator({ toolStatus }: { toolStatus: OperateMessage['toolStatus'] }) {
  if (!toolStatus || toolStatus.phase === 'done') return null;

  const completedSteps = toolStatus.completedSteps ?? [];
  const uniqueSteps = completedSteps.filter((s, i, arr) =>
    arr.findIndex(x => x.tool === s.tool && x.iteration === s.iteration) === i
  );

  return (
    <div className="space-y-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {uniqueSteps.map((step, i) => (
        <div key={`${step.tool}-${step.iteration}-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground/70">
          <Sparkles className="h-3 w-3 text-primary/60 shrink-0" />
          <span>{step.tool.replace(/_/g, ' ')}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {toolStatus.phase === 'thinking' && (
          <>
            <Sparkles className="h-3 w-3 animate-pulse text-primary" />
            <span>Thinking…{toolStatus.iteration ? ` (step ${toolStatus.iteration})` : ''}</span>
          </>
        )}
        {toolStatus.phase === 'executing' && (
          <>
            <Wrench className="h-3 w-3 animate-spin text-primary" />
            <span>
              Running {toolStatus.tools?.map(t => t.replace(/_/g, ' ')).join(', ')}
              {toolStatus.iteration ? ` (step ${toolStatus.iteration})` : ''}
            </span>
          </>
        )}
        {toolStatus.phase === 'streaming' && (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span>Writing response…</span>
          </>
        )}
      </div>
    </div>
  );
}

export function OperateChat({ messages, skills, isLoading, onSendMessage, onReset, onCancel }: OperateChatProps) {
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      toast.error('File too large (max 20MB)');
      return;
    }

    const allowedTypes = [
      'application/pdf',
      'text/plain', 'text/markdown', 'text/csv',
      'application/json',
    ];
    const isAllowed = allowedTypes.includes(file.type) || 
      file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.csv');

    if (!isAllowed) {
      toast.error('Unsupported file type. Use PDF, TXT, MD, CSV, or JSON.');
      return;
    }

    setIsUploading(true);
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `uploads/flowpilot/${timestamp}_${safeName}`;

      const { error } = await supabase.storage
        .from('cms-images')
        .upload(storagePath, file, { contentType: file.type, upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('cms-images')
        .getPublicUrl(storagePath);

      setAttachedFile({
        name: file.name,
        url: urlData.publicUrl,
        storagePath: `cms-images/${storagePath}`,
        size: file.size,
      });
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = () => {
    if ((!input.trim() && !attachedFile) || isLoading) return;

    let message = input.trim();

    // Append file context to the message
    if (attachedFile) {
      const fileContext = `\n\n[Attached file: ${attachedFile.name}]\nFile URL: ${attachedFile.url}\nStorage path: ${attachedFile.storagePath}`;
      message = (message || `I've attached a file: ${attachedFile.name}`) + fileContext;
      setAttachedFile(null);
    }

    onSendMessage(message);
    setInput('');
  };

  const isEmpty = messages.length === 0;

  const getSkillResults = (msg: OperateMessage) => {
    if (msg.skillResults?.length) return msg.skillResults;
    if (msg.skillResult) return [msg.skillResult];
    return [];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-6">
            <div className="p-3 rounded-2xl bg-primary/10">
              <Terminal className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-lg font-semibold">Operate Mode</h2>
              <p className="text-sm text-muted-foreground">
                Tell me what you need — I can write blog posts, add leads, analyze traffic, 
                send newsletters, and more. I have access to <strong>{skills.length}</strong> skills.
              </p>
              <p className="text-xs text-muted-foreground">
                📎 Attach PDF resumes or documents — I'll extract and process the content automatically.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map((qa) => (
                <Button
                  key={qa.label}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => onSendMessage(qa.action)}
                >
                  {qa.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
              {skills.slice(0, 8).map(s => (
                <Badge key={s.id} variant="secondary" className="text-xs font-normal">
                  {s.name.replace(/_/g, ' ')}
                </Badge>
              ))}
              {skills.length > 8 && (
                <Badge variant="secondary" className="text-xs font-normal">
                  +{skills.length - 8} more
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="py-4 px-4 space-y-4">
            {messages.map((msg) => {
              const results = getSkillResults(msg);
              const isStreaming = msg.role === 'assistant' && msg.toolStatus && msg.toolStatus.phase !== 'done';
              const showCursor = isStreaming && msg.toolStatus?.phase === 'streaming';

              return (
                <div key={msg.id} className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}>
                  <div className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}>
                    {msg.role === 'assistant' ? (
                      <>
                        {msg.content ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                            <ReactMarkdown>{msg.content + (showCursor ? '▍' : '')}</ReactMarkdown>
                          </div>
                        ) : isStreaming ? (
                          <ToolStatusIndicator toolStatus={msg.toolStatus} />
                        ) : null}

                        {/* Show tool status below content when executing */}
                        {msg.content && isStreaming && msg.toolStatus?.phase !== 'streaming' && (
                          <div className="mt-2 pt-2 border-t border-border/30">
                            <ToolStatusIndicator toolStatus={msg.toolStatus} />
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}

                    {results.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
                        {results.map((sr, i) => (
                          <div key={i}>
                            <Badge variant={
                              sr.status === 'success' ? 'default' :
                              sr.status === 'pending_approval' ? 'secondary' : 'destructive'
                            } className="text-xs">
                              {sr.skill.replace(/_/g, ' ')} — {sr.status}
                            </Badge>
                            {sr.result && (
                              <pre className="mt-1 text-xs opacity-70 overflow-auto max-h-24">
                                {JSON.stringify(sr.result, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attached file indicator */}
      {attachedFile && (
        <div className="px-4 pb-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-xs">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span className="truncate max-w-[200px]">{attachedFile.name}</span>
            <span className="text-muted-foreground">({(attachedFile.size / 1024).toFixed(0)} KB)</span>
            <button onClick={() => setAttachedFile(null)} className="ml-1 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={onReset} className="shrink-0" title="Clear conversation">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="shrink-0"
            title="Attach file (PDF, TXT, MD, CSV, JSON)"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={attachedFile ? "Add a message about this file..." : "Tell FlowPilot what to do..."}
            disabled={isLoading}
            className="rounded-full"
          />
          {isLoading && onCancel ? (
            <Button
              size="icon"
              variant="outline"
              onClick={onCancel}
              className="shrink-0 rounded-full"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={(!input.trim() && !attachedFile) || isLoading}
              className="shrink-0 rounded-full"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
