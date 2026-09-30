/**
 * Meeting Poll block — a poll embedded on a page.
 *
 * The organizer creates the poll (admin panel, or FlowPilot through
 * create_meeting_poll) and the block puts its public face on a page: the
 * candidate times, who can make which, and the answer form. Same component the
 * /poll/:token page renders — one face, two doors.
 *
 * Why the block does not CREATE polls: the public chat only runs skills with
 * scope `external`, and create_meeting_poll is internal by design — an
 * anonymous visitor minting polls on someone else's calendar is a spam vector,
 * not a feature. Intent capture for "find a time for the five of us" lives in
 * FlowPilot's staff chat, where the skill is reachable. The block renders
 * (Law 3).
 *
 * Anon-safe by construction: everything goes through the two token RPCs.
 */
import { MeetingPollRespond } from '@/components/public/meeting-poll/MeetingPollRespond';
import { useUiText } from '@/lib/ui-text';
import type { MeetingPollBlockData } from '@/types/cms';

interface MeetingPollBlockProps {
  data: MeetingPollBlockData;
}

export function MeetingPollBlock({ data }: MeetingPollBlockProps) {
  const t = useUiText();
  const token = (data.shareToken ?? '').trim();

  return (
    <section className="space-y-6">
      {(data.title || data.description) && (
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          {data.title && <h2 className="text-3xl font-bold tracking-tight">{data.title}</h2>}
          {data.description && <p className="text-muted-foreground">{data.description}</p>}
        </div>
      )}
      {token ? (
        <MeetingPollRespond token={token} showRespondents={data.showRespondents ?? true} className="max-w-2xl mx-auto" />
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {t('meetingPoll.blockNoPoll', 'No poll is linked to this block yet.')}
        </p>
      )}
    </section>
  );
}
