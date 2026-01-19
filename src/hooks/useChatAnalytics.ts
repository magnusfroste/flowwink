import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays, format, eachDayOfInterval } from 'date-fns';

interface ChatAnalytics {
  totalConversations: number;
  totalMessages: number;
  aiResolvedCount: number;
  escalatedCount: number;
  abandonedCount: number;
  aiResolutionRate: number;
  averageMessagesPerConversation: number;
  conversationsToday: number;
  conversationsThisWeek: number;
}

interface DailyStats {
  date: string;
  conversations: number;
  messages: number;
  escalated: number;
  resolved: number;
}

export function useChatAnalytics(days = 30) {
  return useQuery({
    queryKey: ['chat-analytics', days],
    queryFn: async (): Promise<ChatAnalytics> => {
      const startDate = subDays(new Date(), days).toISOString();
      const today = startOfDay(new Date()).toISOString();
      const weekAgo = subDays(new Date(), 7).toISOString();

      // Get all conversations within the period
      const { data: conversations, error: convError } = await supabase
        .from('chat_conversations')
        .select('id, conversation_status, escalated_at, created_at')
        .gte('created_at', startDate);

      if (convError) throw convError;

      // Get message count
      const { data: messages, error: msgError } = await supabase
        .from('chat_messages')
        .select('id, conversation_id')
        .gte('created_at', startDate);

      if (msgError) throw msgError;

      const totalConversations = conversations?.length || 0;
      const totalMessages = messages?.length || 0;

      // Calculate status breakdown
      const escalatedCount = conversations?.filter(c => 
        c.escalated_at || c.conversation_status === 'escalated' || c.conversation_status === 'agent_assigned'
      ).length || 0;

      const resolvedCount = conversations?.filter(c => 
        c.conversation_status === 'resolved' || c.conversation_status === 'closed'
      ).length || 0;

      const activeCount = conversations?.filter(c => 
        c.conversation_status === 'active' || !c.conversation_status
      ).length || 0;

      // AI resolved = resolved without escalation
      const aiResolvedCount = conversations?.filter(c => 
        (c.conversation_status === 'resolved' || c.conversation_status === 'closed') && 
        !c.escalated_at
      ).length || 0;

      // Abandoned = active conversations older than 24h without recent activity
      const abandonedCount = totalConversations - escalatedCount - resolvedCount - activeCount;

      // Conversations today and this week
      const conversationsToday = conversations?.filter(c => c.created_at >= today).length || 0;
      const conversationsThisWeek = conversations?.filter(c => c.created_at >= weekAgo).length || 0;

      return {
        totalConversations,
        totalMessages,
        aiResolvedCount,
        escalatedCount,
        abandonedCount: Math.max(0, abandonedCount),
        aiResolutionRate: totalConversations > 0 
          ? Math.round((aiResolvedCount / totalConversations) * 100) 
          : 0,
        averageMessagesPerConversation: totalConversations > 0 
          ? Math.round((totalMessages / totalConversations) * 10) / 10 
          : 0,
        conversationsToday,
        conversationsThisWeek,
      };
    },
  });
}

export function useChatAnalyticsTrend(days = 30) {
  return useQuery({
    queryKey: ['chat-analytics-trend', days],
    queryFn: async (): Promise<DailyStats[]> => {
      const startDate = subDays(new Date(), days);
      const endDate = new Date();

      // Get all conversations within the period
      const { data: conversations, error: convError } = await supabase
        .from('chat_conversations')
        .select('id, conversation_status, escalated_at, created_at')
        .gte('created_at', startDate.toISOString());

      if (convError) throw convError;

      // Get all messages within the period
      const { data: messages, error: msgError } = await supabase
        .from('chat_messages')
        .select('id, created_at')
        .gte('created_at', startDate.toISOString());

      if (msgError) throw msgError;

      // Create daily buckets
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      
      const dailyStats: DailyStats[] = dateRange.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const nextDate = format(subDays(date, -1), 'yyyy-MM-dd');

        const dayConversations = conversations?.filter(c => {
          const created = format(new Date(c.created_at), 'yyyy-MM-dd');
          return created === dateStr;
        }) || [];

        const dayMessages = messages?.filter(m => {
          const created = format(new Date(m.created_at), 'yyyy-MM-dd');
          return created === dateStr;
        }) || [];

        const escalated = dayConversations.filter(c => 
          c.escalated_at || c.conversation_status === 'escalated'
        ).length;

        const resolved = dayConversations.filter(c => 
          (c.conversation_status === 'resolved' || c.conversation_status === 'closed') && !c.escalated_at
        ).length;

        return {
          date: format(date, 'MMM d'),
          conversations: dayConversations.length,
          messages: dayMessages.length,
          escalated,
          resolved,
        };
      });

      return dailyStats;
    },
  });
}

export function useChatAnalyticsSummary() {
  return useQuery({
    queryKey: ['chat-analytics-summary'],
    queryFn: async () => {
      const today = startOfDay(new Date()).toISOString();
      const weekAgo = subDays(new Date(), 7).toISOString();

      // Quick stats for dashboard widget
      const { data: todayConvs } = await supabase
        .from('chat_conversations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today);

      const { data: weekConvs, count: weekCount } = await supabase
        .from('chat_conversations')
        .select('id, escalated_at, conversation_status', { count: 'exact' })
        .gte('created_at', weekAgo);

      const weekEscalated = weekConvs?.filter(c => 
        c.escalated_at || c.conversation_status === 'escalated'
      ).length || 0;

      const weekResolved = weekConvs?.filter(c => 
        (c.conversation_status === 'resolved' || c.conversation_status === 'closed') && !c.escalated_at
      ).length || 0;

      const total = weekCount || 0;
      const aiResolutionRate = total > 0 ? Math.round((weekResolved / total) * 100) : 0;

      return {
        todayCount: todayConvs?.length || 0,
        weekCount: total,
        weekEscalated,
        weekResolved,
        aiResolutionRate,
      };
    },
  });
}
