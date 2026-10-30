import { Link } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import { ArrowUp, Loader2, Terminal, RotateCcw, Wrench, Sparkles, X, Paperclip, FileText, ChevronRight } from 'lucide-react';
import { stepSummary } from '@/lib/step-summary';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChatComposer } from '@/components/admin/chat/ChatComposer';
import { ChatHero, ChatComposerBar } from '@/components/admin/chat/ChatShell';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { OperateMessage } from '@/hooks/useAgentOperate';

/**
 * The operator's prose, as it should read. Two things the raw stream carries
 * that a person should not see verbatim: the traceability markers the prompt
 * asks for ("[ACTION:skill]", "[RESULT:success]") become small inline chips,
 * and GitHub-flavoured markdown is enabled so a table of consultants IS a
 * table — without remark-gfm it rendered as one long paragraph of pipes
 * (Magnus, 2026-09-02).
 */
function presentAssistant(content: string): string {
  return content
    .replace(/\[ACTION:([^\]]+)\]\s*/g, (_m, skill: string) => `\`⚙ ${skill.replace(/_/g, ' ')}\` `)
    .replace(/\[RESULT:(success|partial|failed)[^\]]*\]\s*/gi, (_m, s: string) => {
      const glyph = s.toLowerCase() === 'success' ? '✓' : s.toLowerCase() === 'partial' ? '◐' : '✗';
      return `\`${glyph} ${s.toLowerCase()}\` `;
    });
}
import type { AgentSkill } from '@/types/agent';

interface OperateChatProps {
  messages: OperateMessage[];
  skills: AgentSkill[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onReset: () => void;
  onCancel?: () => void;
  /** Pre-filled (not sent) input — the skill catalog's "Try in FlowChat" arrives with one. */
  initialInput?: string;
}

interface AttachedFile {
  name: string;
  url: string;
  storagePath: string;
  size: number;
}

const QUICK_ACTIONS = [
  { label: 'Write KB article', action: 'Write a knowledge base article about how to reset a customer password. Draft the question and answer yourself, then publish it.' },
  { label: 'Draft blog post', action: 'Draft and publish a short blog post about our latest product update. You write the body — pick a sensible angle.' },
  { label: 'Add a lead', action: 'Add a new lead: Anna Eriksson, anna@example.com, source=referral, status=new.' },
  { label: 'Recent activity', action: 'Summarize what has happened on the site in the last 7 days — leads, orders, traffic.' },
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

export function OperateChat({ messages, skills, isLoading, onSendMessage, onReset, onCancel, initialInput }: OperateChatProps) {
  const [input, setInput] = useState('');
  useEffect(() => {
    if (initialInput && !input) setInput(initialInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);
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

  // The same text box Flowwork uses (ChatComposer): centred in the hero
  // when the chat is empty, in the bar under a running conversation.
  const composer = (large?: boolean) => (
    <ChatComposer
      value={input}
      onChange={setInput}
      onSend={handleSend}
      placeholder={attachedFile ? 'Add a message about this file…' : 'Tell FlowChat what to do — be specific about the outcome…'}
      disabled={isLoading}
      busy={isLoading}
      canSend={!!input.trim() || !!attachedFile}
      onStop={onCancel}
      onAttach={() => fileInputRef.current?.click()}
      attaching={isUploading}
      large={large}
      above={attachedFile ? (
        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted text-xs">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span className="truncate max-w-[200px]">{attachedFile.name}</span>
          <span className="text-muted-foreground">({(attachedFile.size / 1024).toFixed(0)} KB)</span>
          <button type="button" onClick={() => setAttachedFile(null)} className="ml-1 hover:text-destructive" aria-label="Remove file">
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : undefined}
    />
  );

  const getSkillResults = (msg: OperateMessage) => {
    if (msg.skillResults?.length) return msg.skillResults;
    if (msg.skillResult) return [msg.skillResult];
    return [];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col">
        {isEmpty ? (
          <ChatHero
            icon={<Terminal className="h-7 w-7 text-primary" strokeWidth={1.75} />}
            heading="What should I do?"
            lead={<>I draft content, run skills, chain actions and report back — {skills.length} skills within reach. Attach a PDF, CSV or notes and I act on them.</>}
          >
            {composer(true)}
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map((qa) => (
                <Button
                  key={qa.label}
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-full"
                  onClick={() => onSendMessage(qa.action)}
                >
                  {qa.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center max-w-sm mx-auto">
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
          </ChatHero>
        ) : (
          <div className="py-6 px-4 space-y-4 max-w-3xl mx-auto w-full">
            {messages.map((msg) => {
              const results = getSkillResults(msg);
              const isStreaming = msg.role === 'assistant' && msg.toolStatus && msg.toolStatus.phase !== 'done';
              const showCursor = isStreaming && msg.toolStatus?.phase === 'streaming';

              // Hallucination guard: assistant claims success but every tool call failed.
              const successWords = /\b(added|created|sent|published|saved|updated|posted|scheduled|done|completed)\b/i;
              const claimsSuccess = msg.role === 'assistant' && !isStreaming && successWords.test(msg.content || '');
              const allFailed = results.length > 0 && results.every(r => {
                const s = String((r as any).status || '');
                return s === 'error' || s === 'failed' || Boolean((r as any).result?.error);
              });
              const showHallucinationWarning = claimsSuccess && allFailed;

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
                          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_th]:whitespace-nowrap [&_code]:text-[11px] [&_code]:font-medium [&_code]:before:content-none [&_code]:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{presentAssistant(msg.content) + (showCursor ? '▍' : '')}</ReactMarkdown>
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

                        {showHallucinationWarning && (
                          <div className="mt-2 pt-2 border-t border-destructive/30 text-xs text-destructive flex items-start gap-1.5">
                            <span>⚠️</span>
                            <span>
                              <strong>Hallucination risk:</strong> the response claims success, but every tool call in this turn failed. Verify the result before trusting it.
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}

                    {results.length > 0 && (
                      // One line for the turn's steps — "4 steps · 1 failed ·
                      // 1 refused ▸" — that opens in place, the way Claude shows
                      // its tool calls. Four chips under every answer pushed the
                      // answer itself out of view (2026-10-30). Open by default
                      // only when something waits for an approval.
                      <details
                        className="group/steps mt-2 pt-2 border-t border-border/30"
                        open={results.some((r) => r.status === 'pending_approval' || (r.result as { staged?: boolean } | null)?.staged === true)}
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronRight className="h-3 w-3 transition-transform group-open/steps:rotate-90" />
                          Ran {stepSummary(results)}
                        </summary>
                      <div className="mt-1.5 space-y-1.5 pl-4">
                        {/* Hopfällda som default: sju sid-stora JSON-svar i rad
                            dränkte samtalet — frågan i toppen scrollade bort och
                            detaljerna är ändå inget att agera på i chatten
                            (Magnus, nordbrygg 2026-09-01). Chippen bär utfallet;
                            detaljerna finns bakom ett klick för felsökning. */}
                        {results.map((sr, i) => (
                          <details key={i} className="group">
                            <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                              <Badge variant={
                                sr.status === 'success' ? 'default' :
                                sr.status === 'pending_approval' || sr.status === 'refused' ? 'secondary' : 'destructive'
                              } className="text-xs">
                                {sr.skill.replace(/_/g, ' ')} — {sr.status}
                              </Badge>
                              {sr.result && (
                                <span className="text-[10px] text-muted-foreground opacity-60 group-open:hidden">details</span>
                              )}
                              {(sr.status === 'pending_approval' || (sr.result as { staged?: boolean } | null)?.staged === true) && (
                                <Link
                                  to={sr.status === 'pending_approval' ? '/admin/approvals' : '/admin/approvals?tab=staged'}
                                  className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Review in Approvals →
                                </Link>
                              )}
                            </summary>
                            {sr.result && (
                              <pre className="mt-1 text-xs opacity-70 overflow-auto max-h-64 rounded bg-muted/40 p-2">
                                {JSON.stringify(sr.result, null, 2)}
                              </pre>
                            )}
                          </details>
                        ))}
                      </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
        onChange={handleFileSelect}
        className="hidden"
      />
      {!isEmpty && <ChatComposerBar>{composer()}</ChatComposerBar>}
    </div>
  );
}
