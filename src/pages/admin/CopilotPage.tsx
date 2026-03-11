import { useState, useEffect } from 'react';
import { Zap, Plus, Trash2, MessageSquare, PanelLeftClose, PanelLeft, AlertTriangle, Users, Globe } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminContentHeader } from '@/components/admin/AdminContentHeader';
import { AdminSearchCommand, useAdminSearch, SearchButton } from '@/components/admin/AdminSearchCommand';
import { Button } from '@/components/ui/button';
import { UnifiedChat } from '@/components/chat/UnifiedChat';
import { ContextPanel } from '@/components/admin/copilot/ContextPanel';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { useExtensionRelay } from '@/hooks/useExtensionRelay';
import { useBrandingSettings, useChatSettings } from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

export default function CopilotPage() {
  const operate = useAgentOperate();
  const queryClient = useQueryClient();
  const [chatKey, setChatKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: branding } = useBrandingSettings();
  const { data: chatSettings } = useChatSettings();
  const { searchOpen, setSearchOpen } = useAdminSearch();
  const adminName = branding?.adminName || 'FlowWink';
  const showEscalations = chatSettings?.showEscalationsInCopilot ?? false;
  const showPublicChats = chatSettings?.showPublicChatsInCopilot ?? false;

  // Fetch unresolved escalations
  const { data: escalations = [] } = useQuery({
    queryKey: ['copilot-escalations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_escalations')
        .select('id, reason, priority, created_at, ai_summary, conversation_id')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: showEscalations,
    refetchInterval: 30_000,
  });

  // Fetch active public chat conversations
  const { data: publicChats = [] } = useQuery({
    queryKey: ['copilot-public-chats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id, title, customer_name, customer_email, updated_at, conversation_status, session_id')
        .not('session_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: showPublicChats,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    operate.loadSkills();
    operate.loadActivity();
    operate.loadConversations();
  }, []);

  const handleNewChat = () => {
    operate.clearMessages();
    setChatKey(k => k + 1);
    setTimeout(() => operate.loadConversations(), 500);
  };

  const handleSwitchConversation = (id: string) => {
    operate.switchConversation(id);
    setChatKey(k => k + 1);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await operate.deleteConversation(id);
  };

  const handleSendMessage = async (content: string) => {
    await operate.sendMessage(content);
    setTimeout(() => operate.loadConversations(), 1500);
  };

  const handleDeletePublicChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Hard delete: clean up messages + feedback first, then conversation
      await Promise.all([
        supabase.from('chat_messages').delete().eq('conversation_id', id),
        supabase.from('chat_feedback').delete().eq('conversation_id', id),
      ]);
      const { error } = await supabase.from('chat_conversations').delete().eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['copilot-public-chats'] });
      toast.success('Conversation deleted');
    } catch (err) {
      console.error('Failed to delete public chat:', err);
      toast.error('Failed to delete conversation');
    }
  };

  return (
    <AdminLayout>
      <AdminSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Chat history sidebar */}
      {sidebarOpen ? (
        <div className="w-64 shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          {/* Header */}
          <div className="flex items-center justify-between h-10 px-3 shrink-0 border-b border-sidebar-border">
            <span className="font-serif font-bold text-base truncate">{adminName}</span>
            <button onClick={() => setSidebarOpen(false)} className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Search Button */}
          <SearchButton onClick={() => setSearchOpen(true)} />

          {/* New chat button */}
          <div className="px-2 pt-1 pb-1">
            <Button onClick={handleNewChat} variant="ghost" className="w-full gap-2 justify-start text-sm h-8" size="sm">
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-auto px-2 pt-1 pb-2">
            <div className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-normal mb-1 px-2">
              Recent chats
            </div>
            {operate.conversations.map((conv) => (
              <div key={conv.id} className="group/chat relative">
                <button
                  onClick={() => handleSwitchConversation(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                    operate.conversationId === conv.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50'
                  )}
                >
                  <Zap className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm">{conv.title || 'Untitled'}</span>
                    <span className="block text-[10px] text-sidebar-foreground/50">
                      {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </button>
                <button
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/chat:opacity-100 transition-opacity p-1 rounded hover:bg-sidebar-accent"
                  title="Delete chat"
                >
                  <Trash2 className="h-3 w-3 text-sidebar-foreground/60" />
                </button>
              </div>
            ))}

            {operate.conversations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 px-4 text-sidebar-foreground/40">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs text-center">No previous chats</p>
              </div>
            )}
          </div>

          {/* Escalations section */}
          {showEscalations && escalations.length > 0 && (
            <div className="px-2 pb-2 border-t border-sidebar-border pt-2">
              <div className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-normal mb-1 px-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-warning" />
                Escalations ({escalations.length})
              </div>
              {escalations.map((esc) => (
                <button
                  key={esc.id}
                  onClick={() => {
                    if (esc.conversation_id) {
                      handleSwitchConversation(esc.conversation_id);
                    }
                  }}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors hover:bg-sidebar-accent/50"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm">{esc.reason}</span>
                    <span className="block text-[10px] text-sidebar-foreground/50">
                      {esc.priority} · {formatDistanceToNow(new Date(esc.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Public chats section */}
          {showPublicChats && publicChats.length > 0 && (
            <div className="px-2 pb-2 border-t border-sidebar-border pt-2">
              <div className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-normal mb-1 px-2 flex items-center gap-1.5">
                <Users className="h-3 w-3 text-primary" />
                Public chats ({publicChats.length})
              </div>
              {publicChats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    'group w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer',
                    operate.conversationId === chat.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50'
                  )}
                  onClick={() => handleSwitchConversation(chat.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/60" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm">
                      {chat.title && chat.title !== 'New conversation' ? chat.title : (chat.customer_name || chat.customer_email || 'Visitor')}
                    </span>
                    <span className="block text-[10px] text-sidebar-foreground/50">
                      {chat.conversation_status || 'active'} · {formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeletePublicChat(chat.id, e)}
                    className="opacity-0 group-hover:opacity-100 h-5 w-5 shrink-0 inline-flex items-center justify-center rounded text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2 text-sidebar-foreground/50">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-xs">{operate.skills.length} skills available</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <div className="flex items-center justify-center h-10 shrink-0 border-b border-sidebar-border">
            <button onClick={() => setSidebarOpen(true)} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Right column: header + chat + context */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminContentHeader />
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <ResizablePanel defaultSize={70} minSize={40}>
            <div className="h-full flex flex-col">
              <UnifiedChat
                key={chatKey}
                scope="admin"
                messages={operate.messages}
                skills={operate.skills}
                isLoading={operate.isLoading}
                onSendMessage={handleSendMessage}
                onReset={operate.clearMessages}
                onCancel={operate.cancelRequest}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle className="hidden lg:flex" />
          <ResizablePanel defaultSize={30} minSize={20} maxSize={45} className="hidden lg:flex">
            <div className="h-full flex flex-col bg-muted/30 overflow-hidden">
              <ContextPanel
                activities={operate.activities}
                onApprove={operate.approveAction}
                onRefresh={operate.loadActivity}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </AdminLayout>
  );
}
