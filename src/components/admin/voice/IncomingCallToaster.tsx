/**
 * Global incoming-call notifier. Mount once in AdminLayout; whenever a new
 * voice_calls row arrives with status=ringing we surface a toast whose
 * action *answers* the active softphone session directly (no navigation
 * required — the floating Softphone widget is always mounted).
 */
import { useEffect } from 'react';
import { Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRingingCallSubscription, type VoiceCallRow } from '@/hooks/useVoice';
import { useModules } from '@/hooks/useModules';
import { ToastAction } from '@/components/ui/toast';

export function IncomingCallToaster() {
  const { toast } = useToast();
  const { data: modules } = useModules();
  const enabled = !!modules?.voice?.enabled;

  useRingingCallSubscription((call: VoiceCallRow) => {
    if (!enabled) return;
    toast({
      title: 'Incoming call',
      description: `${call.from_number} → ${call.to_number}`,
      action: (
        <ToastAction
          altText="Answer"
          onClick={() => window.dispatchEvent(new CustomEvent('softphone:answer'))}
        >
          <Phone className="h-3 w-3 mr-1" />Answer
        </ToastAction>
      ),
    });
  });

  useEffect(() => {
    // intentionally empty — subscription lives inside hook
  }, [enabled]);

  return null;
}
