/**
 * Meeting polls — the organizer's desk, under Bookings.
 *
 * List, create, see the answers (full e-mail addresses — this is staff), send
 * the link, and press the rule. The panel never decides anything itself: the
 * decision is resolve_meeting_poll, the same RPC FlowPilot calls, and it
 * answers `resolved: false` when no slot qualifies — shown here as a state, not
 * an error. "Realtime" is a refetch every REFRESH_MS while a poll is open.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Copy, Link2, Loader2, Mail, Plus, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  useCancelMeetingPoll,
  useCreateMeetingPoll,
  useMeetingPoll,
  useMeetingPolls,
  useResolveMeetingPoll,
  useSendMeetingPollConfirmation,
  useSendMeetingPollInvites,
  type MeetingPollListItem,
  type MeetingPollPolicy,
  type MeetingPollStatus,
} from '@/hooks/useMeetingPolls';

const REFRESH_MS = 15_000;

const POLICY_LABEL: Record<MeetingPollPolicy, string> = {
  first_all: 'First time everyone can make',
  first_quorum: 'First time with enough people',
  max_attendance: 'Most people (earliest on a tie)',
};

const STATUS_VARIANT: Record<MeetingPollStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'default',
  resolved: 'secondary',
  expired: 'outline',
  cancelled: 'destructive',
};

const browserZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

function fmtSlot(iso: string, minutes: number, timeZone: string) {
  const start = new Date(iso);
  const end = new Date(start.getTime() + minutes * 60_000);
  const day = new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(start);
  const time = new Intl.DateTimeFormat(undefined, { timeZone, hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time.format(start)}–${time.format(end)}`;
}

const pollUrl = (sharePath: string) => `${window.location.origin}${sharePath}`;

export default function MeetingPollsPanel() {
  const [statusFilter, setStatusFilter] = useState<MeetingPollStatus | 'all'>('all');
  const { data: polls, isLoading, refetch } = useMeetingPolls(statusFilter === 'all' ? undefined : statusFilter);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Open polls change under us as people answer.
  useEffect(() => {
    if (!polls?.some((p) => p.status === 'open')) return;
    const id = window.setInterval(() => { void refetch(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [polls, refetch]);

  const copyLink = async (p: MeetingPollListItem) => {
    await navigator.clipboard.writeText(pollUrl(p.share_path));
    toast.success('Link copied');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MeetingPollStatus | 'all')}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Decided</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New poll
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !polls?.length ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground space-y-2">
            <Users className="h-8 w-8 mx-auto opacity-50" />
            <p>No meeting polls yet.</p>
            <p className="text-sm">Propose a few times, share the link, and let the rule pick the first time everyone can make.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {polls.map((p) => (
            <Card key={p.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <button type="button" className="flex-1 min-w-[200px] text-left" onClick={() => setSelectedId(p.id)}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant={STATUS_VARIANT[p.status]}>{p.status === 'resolved' ? 'decided' : p.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {POLICY_LABEL[p.policy]}{p.policy === 'first_quorum' && p.quorum ? ` (${p.quorum})` : ''} · {p.slots} slot{p.slots === 1 ? '' : 's'} · {p.responses} answer{p.responses === 1 ? '' : 's'} · {p.organizer_name}
                  </p>
                </button>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void copyLink(p)} title="Copy share link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedId(p.id)}>Open</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreatePollDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => { setCreateOpen(false); setSelectedId(id); }} />
      <PollDetailSheet pollId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

// ─── Create ─────────────────────────────────────────────────────────────────

interface DraftSlot { starts_at: string; duration_min: number }

function CreatePollDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (pollId: string) => void }) {
  const create = useCreateMeetingPoll();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [policy, setPolicy] = useState<MeetingPollPolicy>('first_all');
  const [quorum, setQuorum] = useState(2);
  const [customerFacing, setCustomerFacing] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [slotWhen, setSlotWhen] = useState('');
  const [slotMinutes, setSlotMinutes] = useState(60);
  const timezone = useMemo(browserZone, []);

  // Organizer defaults from the signed-in user — editable, never required to match.
  useEffect(() => {
    if (!open) return;
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setOrganizerEmail((v) => v || u.email || '');
      const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
      setOrganizerName((v) => v || meta.full_name || meta.name || (u.email ? u.email.split('@')[0] : ''));
    });
  }, [open]);

  const addSlot = () => {
    if (!slotWhen) return;
    const iso = new Date(slotWhen).toISOString();
    if (slots.some((s) => s.starts_at === iso)) { toast.error('That time is already proposed'); return; }
    setSlots((prev) => [...prev, { starts_at: iso, duration_min: slotMinutes }].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    setSlotWhen('');
  };

  const reset = () => {
    setTitle(''); setDescription(''); setPolicy('first_all'); setQuorum(2); setCustomerFacing(false); setExpiresAt(''); setSlots([]); setSlotWhen('');
  };

  const canSubmit = title.trim() && organizerName.trim() && /.+@.+\..+/.test(organizerEmail) && slots.length > 0
    && (policy !== 'first_quorum' || quorum >= 1) && !create.isPending;

  const submit = async () => {
    try {
      const res = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        organizer_email: organizerEmail.trim(),
        organizer_name: organizerName.trim(),
        timezone,
        policy,
        quorum: policy === 'first_quorum' ? quorum : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        customer_facing: customerFacing,
        slots,
      });
      toast.success('Poll created — copy the link and send it');
      reset();
      onCreated(res.poll_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the poll');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New meeting poll</DialogTitle>
          <DialogDescription>Propose a few times. People answer by link, no account. The rule picks.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mp-title">Title</Label>
            <Input id="mp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kickoff with the Acme team" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mp-desc">Description (optional)</Label>
            <Textarea id="mp-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mp-org-name">Organizer name</Label>
              <Input id="mp-org-name" value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mp-org-email">Organizer e-mail</Label>
              <Input id="mp-org-email" type="email" value={organizerEmail} onChange={(e) => setOrganizerEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Proposed times <span className="text-muted-foreground font-normal">({timezone})</span></Label>
            <div className="flex flex-wrap gap-2">
              <Input type="datetime-local" value={slotWhen} onChange={(e) => setSlotWhen(e.target.value)} className="w-auto" />
              <Select value={String(slotMinutes)} onValueChange={(v) => setSlotMinutes(Number(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60, 90, 120, 180].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addSlot} disabled={!slotWhen}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
            {slots.length > 0 && (
              <ul className="rounded-md border divide-y">
                {slots.map((s) => (
                  <li key={s.starts_at} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{fmtSlot(s.starts_at, s.duration_min, timezone)}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSlots((prev) => prev.filter((x) => x.starts_at !== s.starts_at))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Tip: ask FlowPilot "find a time for us next week" — it reads the calendar's gaps and creates the poll for you.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Rule</Label>
              <Select value={policy} onValueChange={(v) => setPolicy(v as MeetingPollPolicy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(POLICY_LABEL) as MeetingPollPolicy[]).map((p) => <SelectItem key={p} value={p}>{POLICY_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {policy === 'first_quorum' ? (
              <div className="space-y-2">
                <Label htmlFor="mp-quorum">Enough people = at least</Label>
                <Input id="mp-quorum" type="number" min={1} value={quorum} onChange={(e) => setQuorum(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="mp-expires">Stops taking answers (optional)</Label>
                <Input id="mp-expires" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            )}
          </div>
          {policy === 'first_quorum' && (
            <div className="space-y-2">
              <Label htmlFor="mp-expires-q">Stops taking answers (optional)</Label>
              <Input id="mp-expires-q" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Customer-facing</Label>
              <p className="text-xs text-muted-foreground">The respondents are customers: deciding also creates a booking, not only a calendar event.</p>
            </div>
            <Switch checked={customerFacing} onCheckedChange={setCustomerFacing} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail ─────────────────────────────────────────────────────────────────

function PollDetailSheet({ pollId, onClose }: { pollId: string | null; onClose: () => void }) {
  const { data: poll, isLoading, refetch } = useMeetingPoll(pollId);
  const resolve = useResolveMeetingPoll();
  const cancel = useCancelMeetingPoll();
  const sendInvites = useSendMeetingPollInvites();
  const sendConfirmation = useSendMeetingPollConfirmation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [noSlotReason, setNoSlotReason] = useState<string | null>(null);

  useEffect(() => { setNoSlotReason(null); }, [pollId]);

  useEffect(() => {
    if (!poll || poll.status !== 'open') return;
    const id = window.setInterval(() => { void refetch(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [poll, refetch]);

  const sharePath = poll ? `/poll/${poll.share_token}` : '';
  const url = poll ? pollUrl(sharePath) : '';

  const onResolve = async () => {
    if (!poll) return;
    try {
      const r = await resolve.mutateAsync(poll.id);
      if (r.resolved) {
        setNoSlotReason(null);
        toast.success(r.already_resolved ? 'Already decided' : 'Decided — on the calendar');
        void refetch();
        if (!r.already_resolved) {
          const c = await sendConfirmation.mutateAsync({ poll_id: poll.id, public_url: url });
          if (c.success && (c.sent ?? 0) > 0) toast.success(`Confirmation sent to ${c.sent}`);
          else if (c.skipped) toast.message(`Confirmation not sent: ${c.skipped}`);
        }
      } else {
        setNoSlotReason(r.reason || 'No slot qualifies yet.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resolve');
    }
  };

  const onCancel = async () => {
    if (!poll) return;
    try { await cancel.mutateAsync(poll.id); toast.success('Poll cancelled'); void refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not cancel'); }
  };

  const onSendInvites = async () => {
    if (!poll) return;
    const emails = Array.from(new Set(inviteEmails.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /.+@.+\..+/.test(s))));
    if (!emails.length) { toast.error('No valid e-mail addresses'); return; }
    try {
      const r = await sendInvites.mutateAsync({ poll_id: poll.id, emails, public_url: url, custom_message: inviteMessage.trim() || undefined });
      if (r.success) {
        toast.success(`Invitation sent to ${r.sent ?? emails.length}${r.failed?.length ? `, ${r.failed.length} failed` : ''}`);
        setInviteOpen(false); setInviteEmails(''); setInviteMessage('');
      } else {
        toast.error(r.error || r.skipped || 'Could not send');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send');
    }
  };

  const resolvedSlot = poll?.slots.find((s) => s.id === poll.resolved_slot_id);

  return (
    <Sheet open={!!pollId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {isLoading || !poll ? (
          <div className="space-y-3 pt-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>{poll.title}</SheetTitle>
                <Badge variant={STATUS_VARIANT[poll.status]}>{poll.status === 'resolved' ? 'decided' : poll.status}</Badge>
              </div>
              <SheetDescription>
                {POLICY_LABEL[poll.policy]}{poll.policy === 'first_quorum' && poll.quorum ? ` (${poll.quorum})` : ''} · {poll.timezone} · {poll.organizer_name} &lt;{poll.organizer_email}&gt;
                {poll.customer_facing && ' · customer-facing'}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-4">
              {poll.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{poll.description}</p>}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(url); toast.success('Link copied'); }}>
                  <Link2 className="h-4 w-4 mr-2" />Copy link
                </Button>
                <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)} disabled={poll.status !== 'open'}>
                  <Mail className="h-4 w-4 mr-2" />Send invitations
                </Button>
                {poll.status === 'open' && (
                  <>
                    <Button size="sm" onClick={() => void onResolve()} disabled={resolve.isPending || poll.responses.length === 0}>
                      {resolve.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarCheck2 className="h-4 w-4 mr-2" />}Decide now
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void onCancel()} disabled={cancel.isPending}>
                      <X className="h-4 w-4 mr-2" />Cancel poll
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs font-mono text-muted-foreground break-all">{url}</p>

              {noSlotReason && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium">No time qualifies yet</p>
                  <p className="text-muted-foreground">{noSlotReason} The poll stays open.</p>
                </div>
              )}

              {resolvedSlot && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex items-start gap-3">
                  <CalendarCheck2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Decided: {fmtSlot(resolvedSlot.starts_at, resolvedSlot.duration_min, poll.timezone)}</p>
                    <p className="text-muted-foreground">
                      {poll.calendar_event_id ? 'On the calendar. ' : ''}{poll.booking_id ? 'Booking created. ' : ''}
                      {poll.responses.filter((r) => r.slot_ids.includes(resolvedSlot.id)).length} attendee(s).
                    </p>
                  </div>
                </div>
              )}

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Times</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {poll.slots.map((s) => {
                      const who = poll.responses.filter((r) => r.slot_ids.includes(s.id));
                      const everyone = poll.responses.length > 0 && who.length === poll.responses.length;
                      return (
                        <li key={s.id} className={cn('px-4 py-3 text-sm', s.id === poll.resolved_slot_id && 'bg-primary/5')}>
                          <div className="flex items-center justify-between gap-3">
                            <span className={cn(everyone && 'font-medium')}>{fmtSlot(s.starts_at, s.duration_min, poll.timezone)}</span>
                            <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                              <Users className="h-3.5 w-3.5" />{who.length}/{poll.responses.length}
                            </span>
                          </div>
                          {who.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">{who.map((r) => r.name).join(', ')}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Answers ({poll.responses.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {poll.responses.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nobody has answered yet. Send the link.</p>
                  ) : (
                    <ul className="divide-y">
                      {poll.responses.map((r) => (
                        <li key={r.id} className="px-4 py-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{r.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                              {r.slot_ids.length === 0 ? 'none work' : `${r.slot_ids.length}/${poll.slots.length} work`}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send the link</DialogTitle>
                  <DialogDescription>One e-mail per recipient with the poll link. Goes through the site's e-mail provider.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="mp-invite-emails">Recipients</Label>
                    <Textarea id="mp-invite-emails" rows={3} value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} placeholder="anna@example.com, bo@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mp-invite-msg">Message (optional)</Label>
                    <Textarea id="mp-invite-msg" rows={3} value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                  <Button onClick={() => void onSendInvites()} disabled={sendInvites.isPending}>
                    {sendInvites.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
