import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { findMeetLink } from '@/lib/meet-link';

/**
 * "Join video call" under any text that carries a meeting link — a started
 * call, an unanswered ring, a link an agent pasted. The URL stays visible in
 * the text (see LinkifiedText); this is the one-tap way in.
 */
export function JoinCallLink({ text, className }: { text: string | null | undefined; className?: string }) {
  const link = findMeetLink(text);
  if (!link) return null;
  return (
    <Button asChild size="sm" className={className} data-testid="join-video-call">
      <a href={`/meet/${link.slug}`} target="_blank" rel="noopener noreferrer">
        <Video className="h-3.5 w-3.5 mr-1.5" /> Join video call
      </a>
    </Button>
  );
}
