import { useState } from 'react';
import { CalendarClock, CalendarPlus, Copy, Plus, Star, Trash2, Video, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTeamProfiles } from '@/hooks/useFlowtable';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useToast } from '@/hooks/use-toast';
import {
  useInterviewAction, useInterviewInvitations, useInterviews, useInviteToInterview, useScheduleInterview,
  type InterviewRow,
} from '@/hooks/useRecruitment';

const KINDS = [
  ['interview', 'Interview'], ['phone_screen', 'Phone screen'], ['technical', 'Technical'],
  ['culture', 'Culture fit'], ['onsite', 'On site'], ['final', 'Final'],
] as const;

/** A local "YYYY-MM-DDTHH:mm" input value → ISO with the browser's offset. */
const toIso = (local: string) => new Date(local).toISOString();

/**
 * Interviews on video, the candidate's way: book a time directly (a WebMeet
 * room with a waiting room, the candidate mailed the link), or propose a few
 * times and let the candidate pick at /interview/<token>. The same RPC and
 * comms the agent uses (schedule_interview, invite_candidate_to_interview).
 */
export function CandidateInterviewsCard({ applicationId, closed }: { applicationId: string; closed: boolean }) {
  const { data: interviews = [] } = useInterviews(applicationId);
  const { data: invitations = [] } = useInterviewInvitations(applicationId);
  const { formatDateTime, formatTime } = usePlatformFormat();
  const { toast } = useToast();
  const [mode, setMode] = useState<null | 'book' | 'invite'>(null);
  const [completing, setCompleting] = useState<InterviewRow | null>(null);
  const action = useInterviewAction();
  const openInvite = invitations.find((i) => i.status === 'open' && new Date(i.expires_at) > new Date());

  const copyInvite = (token: string) => {
    const url = `${window.location.origin}/interview/${token}`;
    void navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: url });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> Interviews</CardTitle>
        {!closed && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode('invite')}><CalendarPlus className="mr-1 h-4 w-4" /> Let them pick</Button>
            <Button size="sm" onClick={() => setMode('book')}><Plus className="mr-1 h-4 w-4" /> Book</Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {openInvite && (
          <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2">
            <span className="text-muted-foreground">
              Waiting for the candidate to pick one of {openInvite.slots.length} times{openInvite.sent_at ? '' : ' (mail not sent)'}
            </span>
            <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => copyInvite(openInvite.token)}><Copy className="h-3.5 w-3.5" /> Link</Button>
          </div>
        )}
        {interviews.length === 0 && !openInvite && <p className="text-muted-foreground">No interviews yet.</p>}
        {interviews.map((iv) => (
          <div key={iv.id} className="space-y-1 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{formatDateTime(iv.scheduled_start)}–{formatTime(iv.scheduled_end)}</span>
              <Badge variant={iv.status === 'scheduled' ? 'default' : 'secondary'}>{iv.status.replace('_', ' ')}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{KINDS.find(([k]) => k === iv.kind)?.[1] ?? iv.kind}</span>
              {iv.location && <span>{iv.location}</span>}
              {iv.rating != null && <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {iv.rating}/5</span>}
            </div>
            {iv.status === 'scheduled' && (
              <div className="flex flex-wrap gap-2 pt-1">
                {iv.meeting_url && (
                  <Button size="sm" variant="secondary" className="h-7 gap-1" asChild>
                    <a href={iv.meeting_url} target="_blank" rel="noreferrer"><Video className="h-3.5 w-3.5" /> Join</a>
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7" onClick={() => setCompleting(iv)}>Done — feedback</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => action.mutate({ application_id: applicationId, interview_id: iv.id, action: 'no_show' })}>No-show</Button>
                <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => action.mutate({ application_id: applicationId, interview_id: iv.id, action: 'cancel' })}><X className="h-3.5 w-3.5" /> Cancel</Button>
              </div>
            )}
            {iv.feedback && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{iv.feedback}</p>}
          </div>
        ))}
      </CardContent>
      {mode === 'book' && <BookInterviewDialog applicationId={applicationId} onClose={() => setMode(null)} />}
      {mode === 'invite' && <InviteDialog applicationId={applicationId} onClose={() => setMode(null)} />}
      {completing && <CompleteDialog applicationId={applicationId} interview={completing} onClose={() => setCompleting(null)} />}
    </Card>
  );
}

function InterviewerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: team = [] } = useTeamProfiles();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Interviewer" /></SelectTrigger>
      <SelectContent>
        {team.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function BookInterviewDialog({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const { user } = useAuth();
  const schedule = useScheduleInterview();
  const [start, setStart] = useState('');
  const [minutes, setMinutes] = useState(45);
  const [kind, setKind] = useState('interview');
  const [interviewer, setInterviewer] = useState(user?.id ?? '');
  const [onSite, setOnSite] = useState(false);
  const [location, setLocation] = useState('');
  const [notify, setNotify] = useState(true);

  const submit = () => {
    const s = new Date(start);
    schedule.mutate({
      application_id: applicationId, start: s.toISOString(), end: new Date(s.getTime() + minutes * 60_000).toISOString(),
      kind, interviewer_id: interviewer || null, location: onSite ? location.trim() : undefined, notify,
    }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book an interview</DialogTitle>
          <DialogDescription>A video interview gets its own WebMeet room with a waiting room — you let the candidate in.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Start</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label>Minutes</Label><Input type="number" min={10} max={480} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 45)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Interviewer</Label><InterviewerSelect value={interviewer} onChange={setInterviewer} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={onSite} onCheckedChange={setOnSite} /> On site instead of video</label>
          {onSite && <Input placeholder="Address or room" value={location} onChange={(e) => setLocation(e.target.value)} />}
          <label className="flex items-center gap-2 text-sm"><Switch checked={notify} onCheckedChange={setNotify} /> Mail the candidate the time and link</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!start || schedule.isPending || (onSite && !location.trim())}>Book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const { user } = useAuth();
  const invite = useInviteToInterview();
  const [slots, setSlots] = useState<string[]>(['', '', '']);
  const [minutes, setMinutes] = useState(45);
  const [kind, setKind] = useState('interview');
  const [interviewer, setInterviewer] = useState(user?.id ?? '');
  const [message, setMessage] = useState('');
  const chosen = slots.filter(Boolean);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Let the candidate pick a time</DialogTitle>
          <DialogDescription>Propose a few times. The candidate gets a link, books one, and the video interview is on your calendar at once.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label>Proposed times</Label>
            {slots.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="datetime-local" value={v} onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? e.target.value : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove time" onClick={() => setSlots((s) => s.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {slots.length < 10 && <Button type="button" variant="outline" size="sm" onClick={() => setSlots((s) => [...s, ''])}><Plus className="mr-1 h-4 w-4" /> Add a time</Button>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Minutes</Label><Input type="number" min={10} max={480} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 45)} /></div>
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Interviewer</Label><InterviewerSelect value={interviewer} onChange={setInterviewer} /></div>
          </div>
          <div className="space-y-1">
            <Label>A personal line (optional, in the candidate's language)</Label>
            <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={chosen.length === 0 || invite.isPending}
            onClick={() => invite.mutate({
              application_id: applicationId, slots: chosen.map(toIso), duration_minutes: minutes, kind,
              interviewer_id: interviewer || null, message: message.trim() || undefined,
            }, { onSuccess: onClose })}
          >
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ applicationId, interview, onClose }: { applicationId: string; interview: InterviewRow; onClose: () => void }) {
  const action = useInterviewAction();
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How did it go?</DialogTitle>
          <DialogDescription>The feedback lands in the candidate's notes; the candidate moves to Interviewed.</DialogDescription>
        </DialogHeader>
        <Textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Strengths, concerns, what to check next…" />
        <div className="flex items-center gap-1" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(rating === n ? null : n)} aria-label={`${n} of 5`}>
              <Star className={cn('h-5 w-5', rating && n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate({ application_id: applicationId, interview_id: interview.id, action: 'complete', feedback: feedback.trim() || undefined, rating }, { onSuccess: onClose })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
