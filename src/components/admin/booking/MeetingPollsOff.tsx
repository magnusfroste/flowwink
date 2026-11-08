import { Link } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The Meeting polls tab when its module is off (it is off by default).
 *
 * The tab lives under Bookings, but Meeting Polls is its own module: with it
 * off, /poll/<token> answers 404 and every poll skill is refused with
 * MODULE_DISABLED. The panel used to render anyway, so the feature looked
 * present and failed on first use — or was never found at all. This says what
 * it is and where it is switched on, the same two facts as ModuleOff.
 */
export function MeetingPollsOff({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card data-module-off="meetingPolls">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <CalendarCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="font-serif text-xl font-semibold text-foreground">Meeting polls is switched off</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Propose several times, let people answer by link without an account, and let a rule pick the
          first time everyone can make. The confirmed time becomes a calendar event, and a booking when the
          meeting is with a customer.
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {isAdmin
            ? 'Switch the module on under Modules: this tab, the public answer page and FlowPilot’s poll skills come on together.'
            : 'An administrator switches it on under Modules.'}
        </p>
        {isAdmin && (
          <Button asChild className="mt-2">
            <Link to="/admin/modules?module=meetingPolls">Open Modules</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
