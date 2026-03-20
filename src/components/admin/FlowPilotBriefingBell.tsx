import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUnreadProactiveCount } from '@/hooks/useProactiveMessages';
import { useUnreadBriefings } from '@/hooks/useFlowPilotBriefings';

/**
 * FlowPilotBriefingBell
 * 
 * Simplified to an unread-count badge that deep-links to the cockpit chat.
 * FlowPilot's voice lives in the chat — the bell just signals new messages.
 */
export function FlowPilotBriefingBell() {
  const navigate = useNavigate();
  const proactiveCount = useUnreadProactiveCount();
  const { data: unreadBriefings = [] } = useUnreadBriefings();

  const count = Math.max(proactiveCount, unreadBriefings.length);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-8 w-8"
      onClick={() => navigate('/admin/flowpilot')}
      title={count > 0 ? `${count} unread FlowPilot message${count > 1 ? 's' : ''}` : 'FlowPilot Chat'}
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center animate-in zoom-in-50 duration-200">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Button>
  );
}
