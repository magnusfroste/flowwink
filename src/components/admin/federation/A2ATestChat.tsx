import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageCircle, Send, Loader2, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ChatMessage {
  id: string;
  role: 'user' | 'peer';
  text: string;
  timestamp: Date;
  durationMs?: number;
  raw?: unknown;
}

interface A2ATestChatProps {
  peer: {
    id: string;
    name: string;
    url: string;
    status: string;
  };
}

export function A2ATestChat({ peer }: A2ATestChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const start = Date.now();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/a2a-outbound`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            peer_id: peer.id,
            skill: 'message',
            message: text,
          }),
        }
      );
      const durationMs = Date.now() - start;
      const data = await res.json();

      // Extract response text from various A2A response formats
      let responseText = '';
      if (data?.result?.status?.message?.parts) {
        responseText = data.result.status.message.parts
          .map((p: any) => p.text)
          .filter(Boolean)
          .join('\n');
      } else if (data?.result?.artifacts) {
        responseText = data.result.artifacts
          .flatMap((a: any) => a.parts || [])
          .map((p: any) => p.text)
          .filter(Boolean)
          .join('\n');
      } else if (typeof data?.raw === 'string') {
        responseText = data.raw;
      } else if (data?.error) {
        responseText = `⚠️ ${typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)}`;
      } else if (data?.message) {
        responseText = data.message;
      } else if (data?.status === 'peer_unavailable') {
        responseText = '⚠️ Peer is currently offline or unreachable.';
      } else {
        responseText = JSON.stringify(data, null, 2);
      }

      const peerMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'peer',
        text: responseText,
        timestamp: new Date(),
        durationMs,
        raw: data,
      };
      setMessages(prev => [...prev, peerMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'peer',
          text: `❌ Error: ${err.message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={peer.status === 'revoked'}
      >
        <MessageCircle className="h-3 w-3 mr-1" />
        Chat
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MessageCircle className="h-4 w-4 text-primary" />
              A2A Test Chat — {peer.name}
              <Badge variant="outline" className="text-[10px] ml-auto font-mono">
                {peer.url}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 px-4 py-2" style={{ maxHeight: '50vh' }}>
            <div className="space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-8">
                  Send a message to test the A2A connection
                </p>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted border border-border/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {msg.role === 'user' ? (
                        <ArrowUpRight className="h-3 w-3 opacity-60" />
                      ) : (
                        <ArrowDownLeft className="h-3 w-3 opacity-60" />
                      )}
                      <span className="text-[10px] opacity-60 font-mono">
                        {msg.role === 'user' ? 'You' : peer.name}
                      </span>
                      {msg.durationMs && (
                        <span className="text-[10px] opacity-40 flex items-center gap-0.5 ml-auto">
                          <Clock className="h-2.5 w-2.5" />
                          {msg.durationMs}ms
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border/50 rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="border-t px-4 py-3 flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message..."
              disabled={sending}
              className="text-sm"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
