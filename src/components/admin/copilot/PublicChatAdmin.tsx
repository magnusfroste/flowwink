import { useState, useCallback } from 'react';
import { Plus, MessageSquare, Trash2, Globe } from 'lucide-react';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export function PublicChatAdmin() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [chatKey, setChatKey] = useState(0);

  const loadConversations = useCallback(async () => {
    const sessionId = localStorage.getItem('chat-session-id');
    const query = supabase
      .from('chat_conversations')
      .select('id, title, created_at')
      .order('created_at', { ascending: false });

    if (user?.id) {
      query.eq('user_id', user.id);
    } else if (sessionId) {
      query.eq('session_id', sessionId);
    }

    const { data } = await query;
    if (data) setConversations(data);
  }, [user?.id]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleNewConversation = () => {
    localStorage.removeItem('chat-conversation-id');
    setActiveConversationId(undefined);
    setChatKey(k => k + 1);
  };

  const handleConversationCreated = (id: string) => {
    setActiveConversationId(id);
    loadConversations();
    setTimeout(() => loadConversations(), 1500);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Clean up related data before deleting conversation
    await Promise.all([
      supabase.from('chat_messages').delete().eq('conversation_id', id),
      supabase.from('chat_feedback').delete().eq('conversation_id', id),
    ]);
    await supabase.from('chat_conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(undefined);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Conversation sidebar */}
      <aside className="w-72 border-r bg-muted/30 flex flex-col flex-shrink-0">
        <div className="p-4 border-b flex items-center gap-2">
          <Button onClick={handleNewConversation} className="flex-1 gap-2" size="sm">
            <Plus className="h-4 w-4" />
            New conversation
          </Button>
        </div>

        <div className="px-4 py-2 border-b">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span>Testing as public visitor</span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm',
                  'hover:bg-muted group transition-colors',
                  activeConversationId === conv.id && 'bg-muted'
                )}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{conv.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </button>
            ))}

            {conversations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8 px-4">
                No conversations yet
              </p>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <ChatConversation
          key={chatKey}
          mode="landing"
          conversationId={activeConversationId}
          onNewConversation={handleConversationCreated}
          skipRestore={chatKey > 0}
          className="flex-1 min-h-0"
        />
      </div>
    </div>
  );
}