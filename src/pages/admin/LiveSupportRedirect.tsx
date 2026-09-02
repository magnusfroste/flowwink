import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Live Support retired 2026-09-02: its queue is FlowBox's queue, its
 * presence is FlowBox's toggle, its callbacks and voicemail are FlowBox's
 * Calls tab, and a chat is answered inline on its row. Old addresses keep
 * landing right: ?conversation=<id> opens that row's reply,
 * ?tab=callbacks|voicemail opens Calls.
 */
export default function LiveSupportRedirect() {
  const [params] = useSearchParams();
  const conversation = params.get('conversation');
  const tab = params.get('tab');
  if (conversation) return <Navigate to={`/admin/flowbox?open=chat:${conversation}`} replace />;
  if (tab === 'callbacks' || tab === 'voicemail') return <Navigate to="/admin/flowbox?tab=calls" replace />;
  return <Navigate to="/admin/flowbox" replace />;
}
