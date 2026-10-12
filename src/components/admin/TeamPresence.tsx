import { useEffect, useRef, useState } from 'react';
import { Video, Phone, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useTeamPresence, type Presence } from '@/hooks/useTeamPresence';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * "Here now" — the colleagues with FlowWink open, as a row of small avatars in
 * the sidebar. Tap one to ring them on video. Nothing more: no status text, no
 * schedule. Away after five minutes of silence, gone when the tab closes.
 */

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

function Avatar({ p, size = 'h-7 w-7 text-[11px]' }: { p: Presence; size?: string }) {
  return p.avatarUrl ? (
    <img src={p.avatarUrl} alt="" className={`${size} rounded-full object-cover`} />
  ) : (
    <div className={`${size} rounded-full bg-sidebar-accent text-sidebar-accent-foreground font-medium flex items-center justify-center`}>{initials(p.name)}</div>
  );
}

export function TeamPresence({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const { here, hidden, ring, calling } = useTeamPresence();
  const others = here.filter((p) => p.userId !== user?.id);

  // Caller feedback: declined / unanswered.
  useEffect(() => {
    const onAnswered = (e: Event) => {
      const d = (e as CustomEvent<{ slug: string; accepted: boolean }>).detail;
      if (!d.accepted) toast(`They declined the call`);
    };
    const onUnanswered = (e: Event) => {
      const d = (e as CustomEvent<{ slug: string; name: string }>).detail;
      toast(`${d.name} did not answer — the link is in River`);
    };
    window.addEventListener('team-presence:answered', onAnswered);
    window.addEventListener('team-presence:unanswered', onUnanswered);
    return () => {
      window.removeEventListener('team-presence:answered', onAnswered);
      window.removeEventListener('team-presence:unanswered', onUnanswered);
    };
  }, []);

  if (hidden) return null;

  const call = async (p: Presence) => {
    const slug = await ring(p);
    if (!slug) { toast.error('Could not start a call'); return; }
    window.open(`/meet/${slug}`, '_blank', 'noopener');
  };

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex justify-center py-1" aria-label={`${others.length} here now`}>
              <span className="relative inline-flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full rounded-full ${others.length ? 'bg-emerald-500' : 'bg-sidebar-foreground/30'}`} />
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{others.length ? `Here now: ${others.map((p) => p.name).join(', ')}` : 'Nobody else is here right now'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="px-2 py-1.5" data-testid="team-presence">
      <div className="text-[11px] uppercase tracking-wide text-sidebar-foreground/50 mb-1.5">Here now</div>
      {others.length === 0 ? (
        <p className="text-xs text-sidebar-foreground/60">Just you</p>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-wrap gap-1.5">
            {others.map((p) => (
              <Tooltip key={p.userId}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => call(p)}
                    disabled={!!calling}
                    aria-label={`Ring ${p.name}`}
                    className="relative rounded-full ring-2 ring-emerald-500/70 hover:ring-primary focus:outline-none focus:ring-primary transition disabled:opacity-60"
                  >
                    <Avatar p={p} />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-sidebar flex items-center justify-center"><Video className="h-2.5 w-2.5" /></span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{calling?.to.userId === p.userId ? `Ringing ${p.name}…` : `Ring ${p.name}`}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

/** Two soft beeps every two seconds while a ring waits; stops with the dialog. */
function useRingTone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let stopped = false;
    const beep = (at: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.15, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      o.start(at); o.stop(at + 0.3);
    };
    const cycle = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      beep(t); beep(t + 0.4);
      timer = window.setTimeout(cycle, 2000);
    };
    let timer = window.setTimeout(cycle, 0);
    return () => { stopped = true; window.clearTimeout(timer); ctx.close().catch(() => { /* already closed */ }); };
  }, [active]);
}

/** The callee's side: name, Answer, Decline. Mounted once in the admin shell. */
export function RingDialog() {
  const { incoming, answer, decline } = useTeamPresence();
  const [open, setOpen] = useState(false);
  const titleRef = useRef<string>('');
  useEffect(() => { setOpen(!!incoming); if (incoming) titleRef.current = incoming.fromName; }, [incoming]);
  useRingTone(open);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) decline(); }}>
      <DialogContent className="sm:max-w-sm" data-testid="ring-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Video className="h-5 w-5" /> {titleRef.current} is calling</DialogTitle>
          <DialogDescription>Video call. Answering opens the meeting in a new tab.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={decline} className="gap-2"><PhoneOff className="h-4 w-4" /> Decline</Button>
          <Button onClick={answer} className="gap-2"><Phone className="h-4 w-4" /> Answer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
