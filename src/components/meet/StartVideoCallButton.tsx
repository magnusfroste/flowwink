import { useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

/**
 * One tap from where the team already is to a call: a WebMeet room with the
 * defaults, the link on the clipboard, the room open in a new tab so the page
 * you were on stays. Where it lands the link (a River post, nothing) is the
 * caller's business via `onStarted`. Hidden when the WebMeet module is off.
 */
export function StartVideoCallButton({
  roomName,
  onStarted,
  label = 'Start video call',
  variant = 'outline',
  size = 'sm',
  className,
  iconOnly = false,
}: {
  /** Shown as the meeting's title to everyone who joins. */
  roomName?: string | null;
  /** Called with the room once it exists — leave the link where it belongs. */
  onStarted?: (room: { slug: string; url: string }) => Promise<void> | void;
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  iconOnly?: boolean;
}) {
  const enabled = useIsModuleEnabled('webmeet');
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;

  const start = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('create_webmeet_room', { p_name: roomName?.trim().slice(0, 120) || null });
      if (error || !data) throw error ?? new Error('no room');
      const slug = (data as { slug: string }).slug;
      const url = `${window.location.origin}/meet/${slug}`;
      await navigator.clipboard?.writeText(url).catch(() => { /* clipboard is a convenience */ });
      await onStarted?.({ slug, url });
      window.open(`/meet/${slug}`, '_blank', 'noopener');
      toast({ title: 'Video call started', description: 'Link copied — the room opened in a new tab.' });
    } catch (err) {
      logger.error('[meet] could not start a call', err);
      toast({ title: 'Could not start a video call', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={iconOnly ? 'icon' : size} className={className} onClick={start} disabled={busy} aria-label={label} title={label} data-testid="start-video-call">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
      {!iconOnly && <span className="ml-1.5">{label}</span>}
    </Button>
  );
}
