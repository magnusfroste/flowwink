/**
 * Flowwork — full sessions list (overflow from SessionsAside).
 * Opens a chat by navigating to /admin/flowwork?session=<id> which
 * WorkspaceChatPage picks up and switches to.
 */
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SessionsListTable } from '@/components/admin/workspace/SessionsListTable';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';

export default function FlowworkSessionsPage() {
  const navigate = useNavigate();
  const { sessions, renameSession, deleteSession } = useWorkspaceSessions();

  return (
    <AdminLayout>
      <SessionsListTable
        title="All Flowwork sessions"
        backHref="/admin/flowwork"
        sessions={sessions}
        onOpen={(id) => navigate(`/admin/flowwork?session=${id}`)}
        onNew={() => navigate('/admin/flowwork')}
        onRename={renameSession}
        onDelete={deleteSession}
      />
    </AdminLayout>
  );
}
