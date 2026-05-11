/**
 * VisitorSessionsTab — admin view of public visitor chat sessions.
 *
 * Surfaces conversations with `scope='visitor'` (anonymous + identified
 * leads coming through `/chat` and the chat widget). Internal admin/operator
 * threads (FlowChat, Cowork) live under their own surfaces and are excluded
 * here on purpose — this tab is the audit/log view for the public widget.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { MessageSquare, Trash2, RefreshCw, Search, User, Globe, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VisitorSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  session_id: string | null;
  user_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  conversation_status: string | null;
  message_count?: number;
}

interface ChatMsg {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export function VisitorSessionsTab() {
  const [sessions, setSessions] = useState<VisitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at, updated_at, session_id, user_id, customer_email, customer_name, conversation_status')
      .eq('scope', 'visitor')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) {
      toast.error('Failed to load sessions');
      setLoading(false);
      return;
    }
    // Fetch message counts in one query
    const ids = (data || []).map((s) => s.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('conversation_id')
        .in('conversation_id', ids);
      counts = (msgs || []).reduce<Record<string, number>>((acc, m: any) => {
        acc[m.conversation_id] = (acc[m.conversation_id] || 0) + 1;
        return acc;
      }, {});
    }
    setSessions((data || []).map((s) => ({ ...s, message_count: counts[s.id] || 0 })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openSession = async (id: string) => {
    setActiveId(id);
    setLoadingMsgs(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoadingMsgs(false);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session and all its messages?')) return;
    await Promise.all([
      supabase.from('chat_messages').delete().eq('conversation_id', id),
      supabase.from('chat_feedback').delete().eq('conversation_id', id),
    ]);
    const { error } = await supabase.from('chat_conversations').delete().eq('id', id);
    if (error) {
      toast.error('Delete failed');
      return;
    }
    toast.success('Session deleted');
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const filtered = sessions.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.title || '').toLowerCase().includes(q) ||
      (s.customer_email || '').toLowerCase().includes(q) ||
      (s.customer_name || '').toLowerCase().includes(q) ||
      (s.session_id || '').toLowerCase().includes(q)
    );
  });

  const activeSession = sessions.find((s) => s.id === activeId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Public Sessions
            </CardTitle>
            <CardDescription>
              Visitor chat sessions from <code className="text-xs">/chat</code> and the chat widget.
              Internal operator threads live in FlowChat and Cowork.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, email, name, session id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <Badge variant="secondary" className="ml-auto">
            {filtered.length} of {sessions.length}
          </Badge>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            No visitor sessions yet.
          </p>
        ) : (
          <ScrollArea className="h-[520px] rounded-md border">
            <div className="divide-y">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center gap-3 group"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {s.title || 'Untitled'}
                      </span>
                      {s.user_id ? (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <User className="h-3 w-3" />
                          identified
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          anonymous
                        </Badge>
                      )}
                      {s.conversation_status && s.conversation_status !== 'active' && (
                        <Badge variant="outline" className="text-[10px]">
                          {s.conversation_status}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {s.customer_email && <span className="truncate">{s.customer_email}</span>}
                      {s.customer_name && !s.customer_email && (
                        <span className="truncate">{s.customer_name}</span>
                      )}
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                      </span>
                      <span className="shrink-0">{s.message_count ?? 0} msg</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={(e) => deleteSession(s.id, e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <Dialog open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">
              {activeSession?.title || 'Session'}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
              {activeSession?.customer_email && <span>{activeSession.customer_email}</span>}
              {activeSession?.customer_name && <span>· {activeSession.customer_name}</span>}
              {activeSession && (
                <span>
                  · started {formatDistanceToNow(new Date(activeSession.created_at), { addSuffix: true })}
                </span>
              )}
              {activeSession?.session_id && (
                <code className="text-[10px] px-1 py-0.5 rounded bg-muted">
                  {activeSession.session_id.slice(0, 12)}…
                </code>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            {loadingMsgs ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No messages.</p>
            ) : (
              <div className="space-y-3 py-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-lg p-3 text-sm whitespace-pre-wrap break-words',
                      m.role === 'user'
                        ? 'bg-primary/5 border border-primary/10'
                        : m.role === 'assistant'
                          ? 'bg-muted/50'
                          : 'bg-muted/20 text-xs text-muted-foreground italic',
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {m.role} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </div>
                    {m.content}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
