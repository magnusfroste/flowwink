import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useSupportPresence, AgentStatus } from '@/hooks/useSupportPresence';
import { useSupportConversations, useConversationMessages } from '@/hooks/useSupportConversations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Headphones, 
  Circle, 
  Send, 
  User, 
  Bot, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Loader2,
  UserCheck,
  Coffee,
  Moon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusConfig: Record<AgentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  online: { label: 'Online', color: 'bg-green-500', icon: <Circle className="h-2 w-2 fill-green-500 text-green-500" /> },
  away: { label: 'Away', color: 'bg-yellow-500', icon: <Coffee className="h-3 w-3 text-yellow-500" /> },
  busy: { label: 'Busy', color: 'bg-red-500', icon: <Circle className="h-2 w-2 fill-red-500 text-red-500" /> },
  offline: { label: 'Offline', color: 'bg-gray-400', icon: <Moon className="h-3 w-3 text-gray-400" /> },
};

const priorityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  urgent: { label: 'Urgent', variant: 'destructive' },
  high: { label: 'High', variant: 'destructive' },
  normal: { label: 'Normal', variant: 'secondary' },
  low: { label: 'Low', variant: 'outline' },
};

export default function LiveSupportPage() {
  const { 
    agentRecord, 
    agentLoading, 
    onlineAgents, 
    isConnected,
    goOnline, 
    goOffline,
    setAway,
    setBusy,
    isUpdating 
  } = useSupportPresence();

  const {
    assignedConversations,
    waitingConversations,
    escalatedConversations,
    isLoading: conversationsLoading,
    claimConversation,
    closeConversation,
  } = useSupportConversations();

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const { messages, isLoading: messagesLoading, sendMessage } = useConversationMessages(selectedConversationId);

  const currentStatus = agentRecord?.status || 'offline';
  const statusInfo = statusConfig[currentStatus as AgentStatus];

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;
    await sendMessage.mutateAsync(messageInput);
    setMessageInput('');
  };

  const handleStatusChange = async (status: AgentStatus) => {
    if (status === 'online') await goOnline();
    else if (status === 'offline') await goOffline();
    else if (status === 'away') await setAway();
    else if (status === 'busy') await setBusy();
  };

  const selectedConversation = [...assignedConversations, ...waitingConversations, ...escalatedConversations]
    .find(c => c.id === selectedConversationId);

  if (agentLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <AdminPageHeader 
          title="Live Support"
          description="Manage real-time customer conversations"
        >
          <div className="flex items-center gap-3">
            {/* Online agents count */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCheck className="h-4 w-4" />
              <span>{onlineAgents.length} agent{onlineAgents.length !== 1 ? 's' : ''} online</span>
            </div>

            {/* Status dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={isUpdating}>
                  {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    statusInfo.icon
                  )}
                  {statusInfo.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.entries(statusConfig).map(([status, config]) => (
                  <DropdownMenuItem 
                    key={status}
                    onClick={() => handleStatusChange(status as AgentStatus)}
                    className="gap-2"
                  >
                    {config.icon}
                    {config.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </AdminPageHeader>

        {currentStatus === 'offline' ? (
          <div className="flex-1 flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto p-4 rounded-full bg-muted mb-4">
                  <Headphones className="h-8 w-8 text-muted-foreground" />
                </div>
                <CardTitle>You're Offline</CardTitle>
                <CardDescription>
                  Go online to start receiving customer conversations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={goOnline} className="w-full" disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Go Online
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-12 gap-4 min-h-0 p-4">
            {/* Conversation list */}
            <div className="col-span-3 flex flex-col gap-4 min-h-0">
              {/* Assigned conversations */}
              <Card className="flex-1 flex flex-col min-h-0">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Active ({assignedConversations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0">
                  <ScrollArea className="h-full">
                    <div className="space-y-1 p-2">
                      {assignedConversations.map(conv => (
                        <ConversationItem
                          key={conv.id}
                          conversation={conv}
                          isSelected={selectedConversationId === conv.id}
                          onClick={() => setSelectedConversationId(conv.id)}
                        />
                      ))}
                      {assignedConversations.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No active conversations
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Waiting conversations */}
              <Card className="flex-1 flex flex-col min-h-0">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-500" />
                    Waiting ({waitingConversations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0">
                  <ScrollArea className="h-full">
                    <div className="space-y-1 p-2">
                      {waitingConversations.map(conv => (
                        <ConversationItem
                          key={conv.id}
                          conversation={conv}
                          isSelected={selectedConversationId === conv.id}
                          onClick={() => setSelectedConversationId(conv.id)}
                          showClaimButton
                          onClaim={() => claimConversation.mutate(conv.id)}
                        />
                      ))}
                      {waitingConversations.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No waiting conversations
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Escalated */}
              <Card className="flex flex-col">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Escalated ({escalatedConversations.length})
                  </CardTitle>
                </CardHeader>
                {escalatedConversations.length > 0 && (
                  <CardContent className="p-2">
                    <ScrollArea className="max-h-32">
                      <div className="space-y-1">
                        {escalatedConversations.slice(0, 5).map(conv => (
                          <ConversationItem
                            key={conv.id}
                            conversation={conv}
                            isSelected={selectedConversationId === conv.id}
                            onClick={() => setSelectedConversationId(conv.id)}
                            compact
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                )}
              </Card>
            </div>

            {/* Chat window */}
            <div className="col-span-6 flex flex-col min-h-0">
              <Card className="flex-1 flex flex-col min-h-0">
                {selectedConversation ? (
                  <>
                    {/* Header */}
                    <CardHeader className="py-3 px-4 border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {(selectedConversation.customer_name || 'U')[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <CardTitle className="text-sm">
                              {selectedConversation.customer_name || 'Anonymous User'}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {selectedConversation.customer_email || selectedConversation.session_id?.slice(0, 8)}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedConversation.priority && (
                            <Badge variant={priorityConfig[selectedConversation.priority]?.variant || 'secondary'}>
                              {priorityConfig[selectedConversation.priority]?.label || selectedConversation.priority}
                            </Badge>
                          )}
                          {selectedConversation.sentiment_score !== null && selectedConversation.sentiment_score > 7 && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Frustrated
                            </Badge>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => closeConversation.mutate(selectedConversation.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Close
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Messages */}
                    <CardContent className="flex-1 min-h-0 p-0">
                      <ScrollArea className="h-full p-4">
                        <div className="space-y-4">
                          {messages.map(message => (
                            <div
                              key={message.id}
                              className={cn(
                                'flex gap-3',
                                message.role === 'agent' && 'flex-row-reverse'
                              )}
                            >
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarFallback>
                                  {message.role === 'user' ? <User className="h-4 w-4" /> : 
                                   message.role === 'assistant' ? <Bot className="h-4 w-4" /> :
                                   <Headphones className="h-4 w-4" />}
                                </AvatarFallback>
                              </Avatar>
                              <div className={cn(
                                'rounded-lg px-3 py-2 max-w-[80%]',
                                message.role === 'user' ? 'bg-muted' :
                                message.role === 'agent' ? 'bg-primary text-primary-foreground' :
                                'bg-blue-100 dark:bg-blue-900/30'
                              )}>
                                {message.role !== 'user' && message.role !== 'agent' && (
                                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                                    AI Assistant
                                  </p>
                                )}
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                <time className="text-xs opacity-70 mt-1 block">
                                  {format(new Date(message.created_at), 'HH:mm')}
                                </time>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>

                    {/* Input */}
                    <div className="p-4 border-t">
                      <form 
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                        className="flex gap-2"
                      >
                        <Input
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          placeholder="Type your message..."
                          disabled={sendMessage.isPending}
                        />
                        <Button type="submit" disabled={sendMessage.isPending || !messageInput.trim()}>
                          {sendMessage.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </form>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Select a conversation to start chatting</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Customer info panel */}
            <div className="col-span-3 flex flex-col gap-4">
              {selectedConversation && (
                <>
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm">Customer Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Name</p>
                        <p>{selectedConversation.customer_name || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Email</p>
                        <p>{selectedConversation.customer_email || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Started</p>
                        <p>{formatDistanceToNow(new Date(selectedConversation.created_at), { addSuffix: true })}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedConversation.escalation_reason && (
                    <Card className="border-amber-200 dark:border-amber-800">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          Escalation Reason
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm">
                        <p>{selectedConversation.escalation_reason}</p>
                      </CardContent>
                    </Card>
                  )}

                  {selectedConversation.sentiment_score !== null && (
                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">Sentiment</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                'h-full transition-all',
                                selectedConversation.sentiment_score <= 3 ? 'bg-green-500' :
                                selectedConversation.sentiment_score <= 6 ? 'bg-yellow-500' :
                                'bg-red-500'
                              )}
                              style={{ width: `${selectedConversation.sentiment_score * 10}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">
                            {selectedConversation.sentiment_score}/10
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {selectedConversation.sentiment_score <= 3 ? 'Customer seems satisfied' :
                           selectedConversation.sentiment_score <= 6 ? 'Neutral sentiment' :
                           'Customer may be frustrated'}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// Conversation list item component
function ConversationItem({
  conversation,
  isSelected,
  onClick,
  showClaimButton,
  onClaim,
  compact,
}: {
  conversation: any;
  isSelected: boolean;
  onClick: () => void;
  showClaimButton?: boolean;
  onClaim?: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-2 rounded-lg transition-colors',
        isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted',
        compact && 'py-1'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={cn('font-medium truncate', compact ? 'text-xs' : 'text-sm')}>
            {conversation.customer_name || conversation.title || 'Anonymous'}
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground truncate">
              {conversation.customer_email || `Session: ${conversation.session_id?.slice(0, 8) || 'N/A'}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {conversation.priority === 'urgent' && (
            <Badge variant="destructive" className="h-5 px-1 text-xs">!</Badge>
          )}
          {showClaimButton && onClaim && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-6 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onClaim(); }}
            >
              Claim
            </Button>
          )}
        </div>
      </div>
    </button>
  );
}
