import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';

import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Send, Trash2, MessageSquare, Snowflake, Settings2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';

interface Peer {
  id: string;
  name: string;
  url: string | null;
  transport: string;
  gateway_token: string | null;
}

interface Session {
  id: string;
  peer_id: string | null;
  title: string;
  thread_key: string;
  agent_id: string | null;
  model: string;
  last_response_id: string | null;
  created_at: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export default function ClawablePage() {
  const { toast } = useToast();
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string>('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agentId, setAgentId] = useState('openclaw/main');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [peerModels, setPeerModels] = useState<Array<{ id: string; owned_by: string | null }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [peerDialogOpen, setPeerDialogOpen] = useState(false);
  const [peerForm, setPeerForm] = useState({ id: '', name: '', url: '', gateway_token: '' });
  const [savingPeer, setSavingPeer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    // shadcn ScrollArea forwards ref to the root; viewport is a child div with [data-radix-scroll-area-viewport]
    const viewport = el.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const target = viewport ?? el;
    target.scrollTop = target.scrollHeight;
  };

  useEffect(() => {
    // scroll on new messages, when sending starts/stops, or on session switch
    requestAnimationFrame(() => scrollToBottom());
  }, [messages, sending, selectedSessionId]);

  const reloadPeers = async () => {
    const { data, error } = await supabase
      .from('a2a_peers')
      .select('id, name, url, transport, gateway_token')
      .order('name');
    if (error) {
      toast({ title: 'Failed to load peers', description: error.message, variant: 'destructive' });
      return;
    }
    const list = (data || []) as Peer[];
    setPeers(list);
    if (list.length && !selectedPeerId) setSelectedPeerId(list[0].id);
  };

  // Load peers on mount
  useEffect(() => {
    reloadPeers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNewPeerDialog = () => {
    setPeerForm({ id: '', name: 'clawwink', url: 'https://clawwink.froste.eu', gateway_token: '' });
    setPeerDialogOpen(true);
  };

  const openEditPeerDialog = () => {
    if (!selectedPeer) return;
    setPeerForm({
      id: selectedPeer.id,
      name: selectedPeer.name,
      url: selectedPeer.url || '',
      gateway_token: selectedPeer.gateway_token || '',
    });
    setPeerDialogOpen(true);
  };

  const savePeer = async () => {
    if (!peerForm.name || !peerForm.url || !peerForm.gateway_token) {
      toast({ title: 'Missing fields', description: 'Name, URL and gateway_token are required', variant: 'destructive' });
      return;
    }
    setSavingPeer(true);
    const payload = {
      name: peerForm.name,
      url: peerForm.url.replace(/\/$/, ''),
      gateway_token: peerForm.gateway_token,
      transport: 'openresponses' as const,
      status: 'active' as const,
    };
    const { data, error } = peerForm.id
      ? await supabase.from('a2a_peers').update(payload).eq('id', peerForm.id).select().single()
      : await supabase.from('a2a_peers').insert(payload).select().single();
    setSavingPeer(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: peerForm.id ? 'Peer updated' : 'Peer added' });
    setPeerDialogOpen(false);
    await reloadPeers();
    if (data?.id) setSelectedPeerId(data.id);
  };

  // Load sessions for selected peer
  useEffect(() => {
    if (!selectedPeerId) return;
    supabase
      .from('clawable_sessions')
      .select('*')
      .eq('peer_id', selectedPeerId)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast({ title: 'Failed to load sessions', description: error.message, variant: 'destructive' });
          return;
        }
        const list = (data || []) as Session[];
        setSessions(list);
        if (list.length) setSelectedSessionId(list[0].id);
        else setSelectedSessionId('');
      });
  }, [selectedPeerId]);

  // Load messages for selected session
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }
    supabase
      .from('clawable_messages')
      .select('*')
      .eq('session_id', selectedSessionId)
      .order('created_at')
      .then(({ data, error }) => {
        if (error) {
          toast({ title: 'Failed to load messages', description: error.message, variant: 'destructive' });
          return;
        }
        setMessages((data || []) as Message[]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
      });
  }, [selectedSessionId]);

  const selectedPeer = useMemo(() => peers.find(p => p.id === selectedPeerId), [peers, selectedPeerId]);
  const selectedSession = useMemo(() => sessions.find(s => s.id === selectedSessionId), [sessions, selectedSessionId]);

  const handleNewSession = async () => {
    if (!selectedPeerId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('clawable_sessions')
      .insert({
        peer_id: selectedPeerId,
        title: `Session ${new Date().toLocaleString()}`,
        thread_key: 'main',
        agent_id: agentId || null,
        model: 'openclaw',
      })
      .select()
      .single();
    setCreating(false);
    if (error) {
      toast({ title: 'Failed to create session', description: error.message, variant: 'destructive' });
      return;
    }
    const sess = data as Session;
    setSessions([sess, ...sessions]);
    setSelectedSessionId(sess.id);
    setMessages([]);
  };

  const handleDeleteSession = async () => {
    if (!selectedSessionId) return;
    if (!confirm('Delete this session and all its messages?')) return;
    const { error } = await supabase.from('clawable_sessions').delete().eq('id', selectedSessionId);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    setSessions(sessions.filter(s => s.id !== selectedSessionId));
    setSelectedSessionId(sessions.find(s => s.id !== selectedSessionId)?.id || '');
  };

  const loadPeerModels = async () => {
    if (!selectedPeerId) return;
    setLoadingModels(true);
    setPeerModels([]);
    try {
      const { data, error } = await supabase.functions.invoke('clawable-list-models', {
        body: { peer_id: selectedPeerId },
      });
      if (error) throw error;
      const models = (data?.models ?? []) as Array<{ id: string; owned_by: string | null }>;
      setPeerModels(models);
      toast({
        title: `Loaded ${models.length} model${models.length === 1 ? '' : 's'}`,
        description: models.length ? 'Pick one in the Agent ID field below.' : 'Peer returned an empty list.',
      });
    } catch (e: any) {
      toast({ title: 'Failed to list models', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedSessionId) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    // Optimistic add
    const optimistic: Message = {
      id: 'tmp-' + Date.now(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(m => [...m, optimistic]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clawable-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ session_id: selectedSessionId, message: text }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');

      // Reload messages from server (replaces optimistic + adds assistant)
      const { data: msgs } = await supabase
        .from('clawable_messages')
        .select('*')
        .eq('session_id', selectedSessionId)
        .order('created_at');
      setMessages((msgs || []) as Message[]);
      // Refresh session to pick up new last_response_id
      const { data: sess } = await supabase
        .from('clawable_sessions')
        .select('*')
        .eq('id', selectedSessionId)
        .single();
      if (sess) {
        setSessions(prev => prev.map(s => s.id === sess.id ? sess as Session : s));
      }
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    } catch (e: any) {
      toast({ title: 'Chat failed', description: e.message, variant: 'destructive' });
      // Reload to remove optimistic
      const { data: msgs } = await supabase
        .from('clawable_messages')
        .select('*')
        .eq('session_id', selectedSessionId)
        .order('created_at');
      setMessages((msgs || []) as Message[]);
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>


        {/* Compact toolbar: peer + session controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-border/50">
          {peers.length === 0 ? (
            <Button size="sm" variant="outline" onClick={openNewPeerDialog}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add peer
            </Button>
          ) : (
            <>
              <Select value={selectedPeerId} onValueChange={setSelectedPeerId}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="Peer" />
                </SelectTrigger>
                <SelectContent>
                  {peers.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPeer && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={openEditPeerDialog}
                    title={selectedPeer.url || ''}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Badge variant="outline" className="text-[10px] font-mono">{agentId || 'openclaw/main'}</Badge>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {showAdvanced ? 'Hide' : 'Change agent'}
                  </button>
                </>
              )}

              <div className="flex-1" />

              <Select value={selectedSessionId} onValueChange={setSelectedSessionId} disabled={!sessions.length}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder={sessions.length ? 'Session' : 'No sessions yet'} />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} {s.agent_id ? `· ${s.agent_id}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                variant="outline"
                onClick={handleNewSession}
                disabled={!selectedPeerId || creating}
                className="h-8"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                New session
              </Button>

              {selectedSessionId && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDeleteSession} title="Delete session">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Advanced agent picker (collapsed by default) */}
        {showAdvanced && selectedPeer && (
          <div className="mb-3 p-3 rounded-md border border-border/50 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Agent ID / model slug</label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={loadPeerModels}
                disabled={!selectedPeerId || loadingModels}
                title="Fetch /v1/models from peer"
              >
                {loadingModels ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                List models
              </Button>
            </div>
            <Input
              list="peer-models-list"
              placeholder="openclaw/main"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-8 text-xs"
            />
            <datalist id="peer-models-list">
              {peerModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.owned_by ? `${m.id} — ${m.owned_by}` : m.id}
                </option>
              ))}
            </datalist>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Each session is isolated — picks the agent personality but does not join the peer's main conversation memory.
            </p>
          </div>
        )}

        {selectedPeer && !selectedPeer.gateway_token && (
          <div className="mb-3 text-xs text-destructive">
            Missing gateway_token on selected peer — click the gear icon to add it.
          </div>
        )}

        <Dialog open={peerDialogOpen} onOpenChange={setPeerDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{peerForm.id ? 'Edit peer' : 'Add peer'}</DialogTitle>
              <DialogDescription>
                Register a peer that exposes <code>/v1/responses</code> (e.g. Clawwink, OpenClaw).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={peerForm.name} onChange={e => setPeerForm({ ...peerForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Base URL</label>
                <Input
                  placeholder="https://clawwink.froste.eu"
                  value={peerForm.url}
                  onChange={e => setPeerForm({ ...peerForm, url: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Gateway token (Bearer)</label>
                <Input
                  type="password"
                  placeholder="Bearer token sent on outbound calls"
                  value={peerForm.gateway_token}
                  onChange={e => setPeerForm({ ...peerForm, gateway_token: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPeerDialogOpen(false)}>Cancel</Button>
              <Button onClick={savePeer} disabled={savingPeer}>
                {savingPeer && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Full-width chat */}
        <Card className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
          {selectedSession?.last_response_id && (
            <CardHeader className="border-b py-2">
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                chain: {selectedSession.last_response_id}
              </div>
            </CardHeader>
          )}


            <ScrollArea className="flex-1" ref={scrollRef as any}>
              <div className="p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-muted-foreground py-16">
                    <MessageSquare className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">{selectedSessionId ? 'Send a message to start' : 'Create a session to begin'}</p>
                  </div>
                ) : (
                  messages.map(m => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                          m.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : m.role === 'system'
                            ? 'bg-destructive/10 text-destructive border border-destructive/20'
                            : 'bg-muted'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      thinking…
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t p-3 flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={selectedSessionId ? 'Message…' : 'Create a session first'}
                disabled={!selectedSessionId || sending}
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <Button onClick={handleSend} disabled={!input.trim() || sending || !selectedSessionId}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
      </AdminPageContainer>
    </AdminLayout>
  );
}
