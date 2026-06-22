/**
 * Global incoming-call notifier. Mount once in AdminLayout; whenever a new
 * voice_calls row arrives with status=ringing we surface a toast with
 * an action that jumps to /admin/voice (or directly answers via Softphone
 * which is already listening over WebRTC if open).
 *
 * Re-uses Supabase realtime — no new edge function required.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRingingCallSubscription, type VoiceCallRow } from '@/hooks/useVoice';
import { useModules } from '@/hooks/useModules';
import { ToastAction } from '@/components/ui/toast';

export function IncomingCallToaster() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: modules } = useModules();
  const enabled = !!modules?.voice?.enabled;

  useRingingCallSubscription((call: VoiceCallRow) => {
    if (!enabled) return;
    toast({
      title: 'Incoming call',
      description: `${call.from_number} → ${call.to_number}`,
      action: (
        <ToastAction altText="Open" onClick={() => navigate('/admin/voice?tab=softphone')}>
          <Phone className="h-3 w-3 mr-1" />Open
        </ToastAction>
      ),
    });
  });

  // No-op when realtime is disabled or module is off
  useEffect(() => {
    // intentionally empty — subscription lives inside hook
  }, [enabled]);

  return null;
}
