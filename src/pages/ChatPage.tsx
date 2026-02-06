import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: settings, isLoading: settingsLoading } = useChatSettings();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Get initial message from navigation state (from ChatLauncherBlock)
  const initialMessage = (location.state as { initialMessage?: string })?.initialMessage;
  const initialMessageProcessed = useRef(false);

  // Check if landing page is enabled
  useEffect(() => {
    if (!settingsLoading && !settings?.landingPageEnabled) {
      navigate('/');
    }
  }, [settings, settingsLoading, navigate]);

  // Load conversations
  useEffect(() => {
    const loadConversations = async () => {
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
      if (data) {
        setConversations(data);
      }
    };

    loadConversations();
  }, [user?.id]);

  const handleNewConversation = () => {
    setActiveConversationId(undefined);
  };

  const handleConversationCreated = (id: string) => {
    setActiveConversationId(id);
    // Reload conversations
    const sessionId = localStorage.getItem('chat-session-id');
    supabase
      .from('chat_conversations')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setConversations(data);
      });
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('chat_conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(undefined);
    }
  };

  if (settingsLoading || !settings?.enabled || !settings?.landingPageEnabled) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <PublicNavigation />
      
      <main className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className={cn(
          'w-72 border-r bg-muted/30 flex flex-col transition-all flex-shrink-0',
          !sidebarOpen && 'w-0 overflow-hidden'
        )}>
          <div className="p-4 border-b">
            <Button 
              onClick={handleNewConversation}
              className="w-full gap-2"
            >
              <Plus className="h-4 w-4" />
              New conversation
            </Button>
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
                  No previous conversations
                </p>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <ChatConversation
            mode="landing"
            conversationId={activeConversationId}
            onNewConversation={handleConversationCreated}
            className="flex-1 min-h-0"
            initialMessage={!initialMessageProcessed.current ? initialMessage : undefined}
            onInitialMessageSent={() => {
              initialMessageProcessed.current = true;
              // Clear the location state so refreshing doesn't resend
              navigate(location.pathname, { replace: true, state: {} });
            }}
          />
        </div>
      </main>
    </div>
  );
}
