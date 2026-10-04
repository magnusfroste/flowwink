import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useChatSettings } from '@/hooks/useSiteSettings';
import { ChatConversation } from '@/components/chat/ChatConversation';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUiText } from '@/lib/ui-text';
import { logger } from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatPage() {
  const t = useUiText();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const checkinId = searchParams.get('mode') === 'checkin' ? (searchParams.get('id') ?? undefined) : undefined;
  const { data: settings, isLoading: settingsLoading } = useChatSettings();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [chatKey, setChatKey] = useState(0);
  
  
  // Initial message: prefer ?q= (shareable/refresh-safe), fall back to router state.
  const initialMessage =
    searchParams.get('q') ??
    (location.state as { initialMessage?: string } | null)?.initialMessage;
  const initialMessageProcessed = useRef(false);

  // Check if landing page is enabled
  useEffect(() => {
    if (!checkinId && !settingsLoading && !settings?.landingPageEnabled) {
      navigate('/');
    }
  }, [settings, settingsLoading, navigate, checkinId]);

  const loadConversations = useCallback(async () => {
    // /chat is the visitor surface. Anonymous threads are tied to this
    // browser's session_id — but a LOGGED-IN user's /chat threads get
    // user_id instead (useChat stamps one or the other, never both), so the
    // list must match either. Found when Magnus and Svante tested /chat
    // signed in and saw an empty history (2026-08-17). Admin history still
    // lives in /admin/flowchat (operator) and /admin/cowork (workspace Q&A);
    // this only lists scope='visitor' threads.
    const sessionId = localStorage.getItem('chat-session-id');
    const identityFilters = [
      sessionId ? `session_id.eq.${sessionId}` : null,
      user?.id ? `user_id.eq.${user.id}` : null,
    ].filter(Boolean);
    if (identityFilters.length === 0) {
      setConversations([]);
      return;
    }
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at')
      .eq('scope', 'visitor')
      .or(identityFilters.join(','))
      .order('created_at', { ascending: false });
    if (data) setConversations(data);
  }, [user?.id]);

  // Load conversations on mount
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
    // Reload immediately to show the new conversation
    loadConversations();
    // Reload again after a short delay so the title update from useChat has time to persist
    setTimeout(() => loadConversations(), 1500);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Messages and feedback cascade from the conversation (FK ON DELETE CASCADE);
    // the old explicit pre-deletes were refused by RLS for visitors (admin-only
    // delete policies on those tables) and silently ignored. The conversation
    // row itself is the visitor's to delete (session header / user_id policy).
    const { error } = await supabase.from('chat_conversations').delete().eq('id', id);
    if (error) {
      logger.error('[ChatPage] delete conversation failed:', error.message);
      await loadConversations(); // show what is actually there, not what we hoped
      return;
    }
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(undefined);
    }
  };

  if (!checkinId && (settingsLoading || !settings?.landingPageEnabled)) return null;
  if (settingsLoading) return null;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <PublicNavigation />
      {checkinId && (
        <div className="bg-primary/5 border-b px-4 py-2 text-sm text-center text-muted-foreground">
          ✦ Check-in mode — your profile will be updated
        </div>
      )}

      <main className="pt-[var(--overlay-header-offset,0px)] flex-1 flex min-h-0">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <ChatConversation
            key={chatKey}
            mode="landing"
            conversationId={activeConversationId}
            onNewConversation={handleConversationCreated}
            skipRestore={chatKey > 0}
            className="flex-1 min-h-0"
            initialMessage={!initialMessageProcessed.current ? initialMessage : undefined}
            onInitialMessageSent={() => {
              initialMessageProcessed.current = true;
              navigate(location.pathname, { replace: true, state: {} });
            }}
            checkinId={checkinId}
          />
        </div>
        {/* Right-side conversation history — permanent on desktop, hidden on mobile */}
        <aside className="hidden md:flex w-72 border-l bg-muted/20 flex-col flex-shrink-0">
          <div className="flex items-center justify-between gap-1 px-3 py-2 border-b">
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground truncate">{t('chat.conversations', 'Conversations')}</span>
            </div>
            <Button
              onClick={handleNewConversation}
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title={t('chat.newConversation', 'New conversation')}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* fitWidth: without it Radix lays the list out as a table that grows to
              the longest title, and the delete button lands past the aside's edge
              — the row looked undeletable even after the button was moved out of
              the title button (synclairvision, 2026-10-04). */}
          <ScrollArea className="flex-1 min-h-0" fitWidth>
            {conversations.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Your conversations will appear here.
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {conversations.map((conv) => (
                  // Two siblings, not a button inside a button: the nested form was
                  // invalid HTML and the title span had no min-w-0, so a long title
                  // pushed the delete past the aside's right edge where the scroll
                  // area clipped it — the row looked undeletable (synclairvision,
                  // 2026-10-02). The delete stays faintly visible, not hover-only:
                  // a touch screen has no hover.
                  <div
                    key={conv.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-lg pr-1 hover:bg-muted transition-colors',
                      activeConversationId === conv.id && 'bg-muted'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveConversationId(conv.id)}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left text-sm"
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 min-w-0 truncate">{conv.title}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t('chat.deleteConversation', 'Delete conversation')}
                      title={t('chat.deleteConversation', 'Delete conversation')}
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>
      </main>

    </div>
  );
}
