import { useState, useEffect } from 'react';
import { Zap, Plus, Trash2, MessageSquare, PanelLeftClose, PanelLeft } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminContentHeader } from '@/components/admin/AdminContentHeader';
import { AdminSearchCommand, useAdminSearch, SearchButton } from '@/components/admin/AdminSearchCommand';
import { Button } from '@/components/ui/button';
import { UnifiedChat } from '@/components/chat/UnifiedChat';
import { ContextPanel } from '@/components/admin/copilot/ContextPanel';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { useBrandingSettings } from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

export default function CopilotPage() {
  const operate = useAgentOperate();
  const [chatKey, setChatKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: branding } = useBrandingSettings();
  const { searchOpen, setSearchOpen } = useAdminSearch();
  const adminName = branding?.adminName || 'FlowWink';

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

  return (
    <AdminLayout>
      <AdminSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Chat history sidebar — mirrors AdminSidebar structure */}
      <Sidebar collapsible="none" className="border-r border-sidebar-border">
        {/* Header — matches AdminSidebar header */}
        <SidebarHeader className="flex !flex-row !gap-0 !py-0 !px-3 h-10 items-center justify-between shrink-0 border-b border-sidebar-border">
          <span className="font-serif font-bold text-base truncate">{adminName}</span>
          <SidebarTrigger className="h-7 w-7 shrink-0" />
        </SidebarHeader>

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
        <SidebarContent className="px-2 pt-1 pb-2">
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-normal mb-1">
              Recent chats
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {operate.conversations.map((conv) => (
                  <SidebarMenuItem key={conv.id} className="group/chat">
                    <SidebarMenuButton
                      isActive={operate.conversationId === conv.id}
                      onClick={() => handleSwitchConversation(conv.id)}
                      className="w-full"
                    >
                      <Zap className="h-4 w-4" />
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm">
                          {conv.title || 'Untitled'}
                        </span>
                        <span className="block text-[10px] text-sidebar-foreground/50">
                          {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                    </SidebarMenuButton>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/chat:opacity-100 transition-opacity p-1 rounded hover:bg-sidebar-accent"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3 w-3 text-sidebar-foreground/60" />
                    </button>
                  </SidebarMenuItem>
                ))}

                {operate.conversations.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 px-4 text-sidebar-foreground/40">
                    <MessageSquare className="h-8 w-8 opacity-30" />
                    <p className="text-xs text-center">No previous chats</p>
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer — matches AdminSidebar footer spacing */}
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 text-sidebar-foreground/50">
            <Zap className="h-3.5 w-3.5" />
            <span className="text-xs">{operate.skills.length} skills available</span>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Right column: header + chat + context */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminContentHeader />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0 border-r flex flex-col">
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
          <div className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col bg-muted/30 overflow-hidden">
            <ContextPanel
              activities={operate.activities}
              onApprove={operate.approveAction}
              onRefresh={operate.loadActivity}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
