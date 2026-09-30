/**
 * /poll/:token — the share link a respondent opens.
 *
 * Same idiom as /s/:token (surveys) and /quote/:token: a public page keyed by
 * a token, reading through a SECURITY DEFINER RPC granted to anon, never a
 * table. The whole UI is MeetingPollRespond; this page is the frame.
 */
import { useParams } from 'react-router-dom';
import { MeetingPollRespond } from '@/components/public/meeting-poll/MeetingPollRespond';
import { Card, CardContent } from '@/components/ui/card';
import { useUiText } from '@/lib/ui-text';

export default function PublicMeetingPollPage() {
  const { token } = useParams<{ token: string }>();
  const t = useUiText();

  return (
    <div className="min-h-screen bg-muted/30 p-4 flex items-start sm:items-center justify-center">
      <div className="w-full max-w-2xl py-8">
        {token ? (
          <MeetingPollRespond token={token} />
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t('meetingPoll.notFound', 'This poll does not exist or the link is wrong.')}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
