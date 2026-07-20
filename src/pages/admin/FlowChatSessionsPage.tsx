/**
 * FlowChat — full sessions list (overflow from SessionsAside).
 * Reuses useAgentOperate so a click opens the exact same conversation in /admin/flowchat.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SessionsListTable } from '@/components/admin/workspace/SessionsListTable';
import { useAgentOperate } from '@/hooks/useAgentOperate';
import { supabase } from '@/integrations/supabase/client';
import type { WorkspaceSession } from '@/hooks/useWorkspaceSessions';

export default function FlowChatSessionsPage() {
  const navigate = useNavigate();
  const {
    conversations,
    loadConversations,
    switchConversation,
    deleteConversation,
    clearMessages,
  } = useAgentOperate();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const sessions = useMemo<WorkspaceSession[]>(
    () =>
      conversations.map((c) => ({
        id: c.id,
        title: c.title || 'Untitled',
        updatedAt: c.updated_at,
      })),
    [conversations],
  );

  const handleOpen = (id: string) => {
    switchConversation(id);
    navigate('/admin/flowchat');
  };

  const handleNew = () => {
    clearMessages();
    navigate('/admin/flowchat');
  };

  const handleRename = async (id: string, title: string) => {
    await supabase.from('chat_conversations').update({ title }).eq('id', id);
    loadConversations();
  };

  return (
    <AdminLayout>
      <SessionsListTable
        title="All FlowChat sessions"
        backHref="/admin/flowchat"
        sessions={sessions}
        onOpen={handleOpen}
        onNew={handleNew}
        onRename={handleRename}
        onDelete={deleteConversation}
      />
    </AdminLayout>
  );
}
