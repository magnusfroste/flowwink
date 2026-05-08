import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Zap, Plus, Trash2, MessageSquare, AlertTriangle, Users, Globe, Cpu, ExternalLink,
  ChevronDown, Save, Loader2, Timer, Info, MessagesSquare,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminContentHeader } from '@/components/admin/AdminContentHeader';
import { AdminSearchCommand, useAdminSearch, SearchButton } from '@/components/admin/AdminSearchCommand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UnifiedChat } from '@/components/chat/UnifiedChat';
import { ContextPanel } from '@/components/admin/copilot/ContextPanel';
import { ObjectivesPanel } from '@/components/admin/skills/ObjectivesPanel';
import { EvolutionPanel } from '@/components/admin/skills/EvolutionPanel';
import { DistilledProposalsPanel } from '@/components/admin/skills/DistilledProposalsPanel';
import { SelfHealingAlert } from '@/components/admin/skills/SelfHealingAlert';
import { AutonomyScheduleTab } from '@/components/admin/AutonomyScheduleTab';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { useExtensionRelay } from '@/hooks/useExtensionRelay';
import { useBrandingSettings, useChatSettings } from '@/hooks/useSiteSettings';
import { useProactiveMessages } from '@/hooks/useProactiveMessages';
import { useSkills } from '@/hooks/useSkillHub';
import {
  useAutonomyScheduleSettings,
  useUpdateAutonomyScheduleSettings,
  AutonomyScheduleSettings,
  defaultAutonomyScheduleSettings,
} from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

type FlowPilotTab =
  | 'chat'
  | 'objectives'
  | 'evolution'
  | 'autonomy';

const ENGINE_TABS: { id: FlowPilotTab; label: string; icon?: typeof MessagesSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessagesSquare },
  { id: 'objectives', label: 'Objectives' },
  { id: 'evolution', label: 'Evolution' },
  { id: 'autonomy', label: 'Autonomy' },
];

export default function CopilotPage() {
  const operate = useAgentOperate();
  const relay = useExtensionRelay();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [chatKey, setChatKey] = useState(0);
  const { data: branding } = useBrandingSettings();
  const { data: chatSettings } = useChatSettings();
  const { searchOpen, setSearchOpen } = useAdminSearch();
  const adminName = branding?.adminName || 'FlowWink';
  const showEscalations = chatSettings?.showEscalationsInCopilot ?? false;
  const showPublicChats = chatSettings?.showPublicChatsInCopilot ?? false;
  const { messages: proactiveMessages } = useProactiveMessages(operate.conversationId ?? undefined);
  const promptSentRef = useRef(false);

  // Active tab (chat by default). Persist via ?tab= query param.
  const tabParam = (searchParams.get('tab') as FlowPilotTab) || 'chat';
  const activeTab: FlowPilotTab = ENGINE_TABS.some(t => t.id === tabParam) ? tabParam : 'chat';

  const setActiveTab = (tab: FlowPilotTab) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'chat') params.delete('tab');
    else params.set('tab', tab);
    setSearchParams(params, { replace: true });
  };

  // Skills count badge for header
  const { data: skills = [] } = useSkills();
  const exposedCount = useMemo(() => skills.filter((s) => s.mcp_exposed).length, [skills]);

  // Autonomy schedule (lazy: only when autonomy tab is active)
  const { data: autonomySettings } = useAutonomyScheduleSettings();
  const updateAutonomy = useUpdateAutonomyScheduleSettings();
  const [autonomyData, setAutonomyData] = useState<AutonomyScheduleSettings>(defaultAutonomyScheduleSettings);
  const [autonomySaving, setAutonomySaving] = useState(false);

  useEffect(() => {
    if (autonomySettings) setAutonomyData(autonomySettings);
  }, [autonomySettings]);

  const handleSaveAutonomy = async () => {
    setAutonomySaving(true);
    try {
      await updateAutonomy.mutateAsync(autonomyData);
      await supabase.functions.invoke('update-autonomy-cron');
      toast.success('Autonomy schedule saved');
    } catch {
      toast.error('Failed to save autonomy schedule');
    } finally {
      setAutonomySaving(false);
    }
  };

  // Auto-send prompt from URL query param (e.g. ?prompt=Clone+my+website)
  useEffect(() => {
    const prompt = searchParams.get('prompt');
    if (prompt && !promptSentRef.current && operate.sendMessage) {
      promptSentRef.current = true;
      const params = new URLSearchParams(searchParams);
      params.delete('prompt');
      setSearchParams(params, { replace: true });
      // Force chat tab when a prompt arrives
      setActiveTab('chat');
      setTimeout(() => operate.sendMessage(prompt), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, operate.sendMessage]);

  useEffect(() => { relay.detectExtension(); }, []);

  useEffect(() => {
    operate.setRelayHandler(async (url: string) => {
      const detected = relay.extensionStatus.installed || await relay.detectExtension();
      if (!detected) return { error: 'Chrome Extension not detected. Install the Signal Capture extension and set the extension ID in settings.' };
      const result = await relay.navigateAndScrape(url);
      if (result.success) {
        return { title: result.title || '', content: result.content || '', html: result.html || '', url: result.url || url };
      }
      return { error: result.error || 'Relay failed' };
    });
  }, [relay.extensionStatus.installed]);

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
    setActiveTab('chat');
    setTimeout(() => operate.loadConversations(), 500);
  };

  const handleSwitchConversation = (id: string) => {
    operate.switchConversation(id);
    setChatKey(k => k + 1);
    setActiveTab('chat');
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

  // Group conversations for the dropdown
  const groupedConvs = useMemo(() => {
    const today: typeof operate.conversations = [];
    const yesterday: typeof operate.conversations = [];
    const thisWeek: typeof operate.conversations = [];
    const older: typeof operate.conversations = [];
    for (const conv of operate.conversations) {
      const d = new Date(conv.created_at);
      if (isToday(d)) today.push(conv);
      else if (isYesterday(d)) yesterday.push(conv);
      else if (isThisWeek(d)) thisWeek.push(conv);
      else older.push(conv);
    }
    const groups: { label: string; convs: typeof operate.conversations }[] = [];
    if (today.length) groups.push({ label: 'Today', convs: today });
    if (yesterday.length) groups.push({ label: 'Yesterday', convs: yesterday });
    if (thisWeek.length) groups.push({ label: 'This week', convs: thisWeek });
    if (older.length) groups.push({ label: 'Older', convs: older });
    return groups;
  }, [operate.conversations]);

  const activeConv = operate.conversations.find(c => c.id === operate.conversationId);
  const sessionLabel = activeConv?.title || 'New chat';

  return (
    <AdminLayout>
      <AdminSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Full-width column: header + cockpit toolbar + tab content */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminContentHeader />

        {/* Cockpit toolbar */}
        <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3 px-4 py-2 flex-wrap">
            {/* Sessions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 max-w-[280px]">
                  <Zap className="h-4 w-4 shrink-0" />
                  <span className="truncate">{sessionLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <DropdownMenuItem onClick={handleNewChat} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New chat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSearchOpen(true)} className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Search…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ScrollArea className="max-h-[60vh]">
                  {groupedConvs.length === 0 && (
                    <div className="text-xs text-muted-foreground py-6 text-center">
                      No previous chats
                    </div>
                  )}
                  {groupedConvs.map(group => (
                    <div key={group.label} className="px-1 pb-1">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-normal py-1">
                        {group.label}
                      </DropdownMenuLabel>
                      {group.convs.map((conv) => (
                        <div key={conv.id} className="group/item relative">
                          <DropdownMenuItem
                            onClick={() => handleSwitchConversation(conv.id)}
                            className={cn(
                              'gap-2 pr-8',
                              operate.conversationId === conv.id && 'bg-accent'
                            )}
                          >
                            <Zap className="h-3.5 w-3.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-sm">{conv.title || 'Untitled'}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                              </div>
                            </div>
                          </DropdownMenuItem>
                          <button
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                            title="Delete chat"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}

                  {showEscalations && escalations.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-normal py-1 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-warning" />
                        Escalations ({escalations.length})
                      </DropdownMenuLabel>
                      {escalations.map((esc) => (
                        <DropdownMenuItem
                          key={esc.id}
                          onClick={() => esc.conversation_id && handleSwitchConversation(esc.conversation_id)}
                          className="gap-2"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-sm">{esc.reason}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {esc.priority} · {formatDistanceToNow(new Date(esc.created_at), { addSuffix: true })}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}

                  {showPublicChats && publicChats.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-normal py-1 flex items-center gap-1.5">
                        <Users className="h-3 w-3 text-primary" />
                        Public chats ({publicChats.length})
                      </DropdownMenuLabel>
                      {publicChats.map((chat) => (
                        <div key={chat.id} className="group/item relative">
                          <DropdownMenuItem
                            onClick={() => handleSwitchConversation(chat.id)}
                            className={cn(
                              'gap-2 pr-8',
                              operate.conversationId === chat.id && 'bg-accent'
                            )}
                          >
                            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-sm">
                                {chat.title && chat.title !== 'New conversation' ? chat.title : (chat.customer_name || chat.customer_email || 'Visitor')}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {chat.conversation_status || 'active'} · {formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true })}
                              </div>
                            </div>
                          </DropdownMenuItem>
                          <button
                            onClick={(e) => handleDeletePublicChat(chat.id, e)}
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                            title="Delete conversation"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* FlowPilot cockpit tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FlowPilotTab)} className="flex-1 min-w-0">
              <TabsList className="h-9">
                {ENGINE_TABS.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5">
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {tab.label}
                      {tab.id === 'autonomy' && <Timer className="h-3 w-3 opacity-60" />}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            {/* Right utilities */}
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="secondary" className="text-[10px]">
                {exposedCount} skills exposed
              </Badge>
              <Button variant="ghost" size="sm" className="gap-1.5 h-8" asChild>
                <Link to="/admin/developer?tab=mcp-skills">
                  <Cpu className="h-3.5 w-3.5" />
                  MCP
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && (
            <ResizablePanelGroup direction="horizontal" className="h-full">
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
                    proactiveMessages={proactiveMessages}
                    onApproveAction={operate.approveAction}
                    onRejectAction={operate.rejectAction}
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
          )}

          {activeTab !== 'chat' && (
            <ScrollArea className="h-full">
              <div className="p-6 space-y-6 max-w-7xl mx-auto">
                <SelfHealingAlert />

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle className="text-sm">Platform tools live elsewhere</AlertTitle>
                  <AlertDescription className="text-xs">
                    Skills & MCP exposure: <Link to="/admin/developer?tab=mcp-skills" className="underline font-medium">Developer → MCP Skills</Link>.
                    Automations, Workflows, Events & Health: <Link to="/admin/automations" className="underline font-medium">Automations</Link>.
                    FlowPilot is one consumer among many — these run even when FlowPilot is disabled.
                  </AlertDescription>
                </Alert>

                {activeTab === 'objectives' && <ObjectivesPanel />}
                {activeTab === 'evolution' && (
                  <div className="space-y-4">
                    <DistilledProposalsPanel />
                    <EvolutionPanel />
                  </div>
                )}
                {activeTab === 'autonomy' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">Autonomy Schedule</h2>
                        <p className="text-sm text-muted-foreground">Configure when FlowPilot runs its autonomous loops.</p>
                      </div>
                      <Button onClick={handleSaveAutonomy} disabled={autonomySaving} size="sm">
                        {autonomySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save schedule
                      </Button>
                    </div>
                    <AutonomyScheduleTab data={autonomyData} onChange={setAutonomyData} />
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Extension status footer (compact, only on chat) */}
        {activeTab === 'chat' && (
          <div className="border-t px-4 py-1.5 text-[11px] text-muted-foreground flex items-center gap-2">
            <Globe className="h-3 w-3" />
            <span>
              Extension: {relay.extensionStatus.installed
                ? <span className="text-green-500">v{relay.extensionStatus.version || '?'}</span>
                : 'not detected'}
            </span>
            <span className="ml-auto opacity-60">{adminName} · FlowPilot Cockpit</span>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
