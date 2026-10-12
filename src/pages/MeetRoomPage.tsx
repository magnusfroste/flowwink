import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Phone, MonitorUp, MonitorOff, Copy, Check, Lock, Unlock, Settings2, ShieldCheck, MessageSquare, SwitchCamera, Send, X, Loader2, DoorOpen, DoorClosed } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWebmeet, fetchMeetAccess, type MeetAccess, type MeetAccessError, type MeetDoorAnswer, type RemoteParticipant } from '@/hooks/useWebmeet';
import { useLobbyGuest, useLobbyHost, useKnockChime, LOBBY_POLL_MS } from '@/hooks/useMeetLobby';
import { WaitingList } from '@/components/meet/WaitingList';
import { useAudioLevel, SPEAKING_LEVEL } from '@/hooks/useAudioLevel';
import { useUiText } from '@/lib/ui-text';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

/**
 * /meet/<slug> — one link, no account. The guest sees their own camera, picks a
 * microphone, types a name and is in. The door (`webmeet-ice`) decides whether
 * the room is open, whether a password is needed, who the host is, and which
 * relays (Cloudflare TURN or plain STUN) carry the call. The host locks, unlocks
 * and ends the meeting from inside it.
 *
 * With the waiting room on, the door answers "wait" instead: the guest stands in
 * the lobby with their camera still on, the host sees "Anna wants to join" above
 * the stage and lets her in (or not) between two consultations. The door is
 * asked again when the host answers — and every few seconds regardless — so a
 * missed broadcast costs seconds, not the appointment.
 */

interface RoomMeta {
  id: string;
  slug: string;
  name: string | null;
  max_participants: number;
  is_locked: boolean;
  waiting_room: boolean;
}

interface MediaDevice { deviceId: string; label: string }

type Translate = (key: string, fallback: string) => string;

interface TileParticipant { stream?: MediaStream | null; displayName: string; videoEnabled: boolean; audioEnabled: boolean; connection?: RTCPeerConnectionState }

/** What a tile says while the video is not (yet) flowing — instead of a black box. */
function connectionNote(p: TileParticipant, t: Translate): string | null {
  const who = p.displayName;
  switch (p.connection) {
    case 'new':
    case 'connecting': return t('meet.connectingTo', 'Connecting to {name}…').replace('{name}', who);
    case 'disconnected': return t('meet.reconnecting', 'Reconnecting…');
    case 'failed': return t('meet.couldNotReach', 'Could not reach {name}. They may be behind a strict firewall.').replace('{name}', who);
    default: return null;
  }
}

/**
 * One face. `fill` takes the stage (the other person in a 1:1), `pip` is the
 * small self-view in the corner, `grid` is a tile among several. A ring shows
 * who is speaking; a line says what is happening when the connection is not up.
 */
function ParticipantTile({ participant, label, mirror, variant = 'grid', t }: { participant: TileParticipant; label?: string; mirror?: boolean; variant?: 'grid' | 'fill' | 'pip'; t: Translate }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && participant.stream) videoRef.current.srcObject = participant.stream;
  }, [participant.stream]);
  const level = useAudioLevel(participant.stream, participant.audioEnabled);
  const speaking = level > SPEAKING_LEVEL;
  const note = label ? null : connectionNote(participant, t);
  const shape = variant === 'fill' ? 'h-full w-full rounded-xl' : variant === 'pip' ? 'aspect-video w-32 sm:w-48 rounded-lg shadow-lg' : 'aspect-video rounded-lg';
  return (
    <div className={`relative ${shape} bg-muted overflow-hidden border transition-[box-shadow,border-color] duration-150 ${speaking ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>
      <video ref={videoRef} autoPlay playsInline muted={!!label} className={`w-full h-full ${variant === 'fill' ? 'object-contain bg-muted' : 'object-cover'} ${mirror ? 'scale-x-[-1]' : ''}`} />
      {!participant.videoEnabled && !note && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className={`${variant === 'pip' ? 'text-xl' : 'text-4xl'} font-medium text-muted-foreground`}>{participant.displayName.charAt(0).toUpperCase()}</div>
        </div>
      )}
      {note && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 px-4 text-center text-sm text-muted-foreground">
          {participant.connection !== 'failed' && <Loader2 className="h-5 w-5 animate-spin" />}
          <span>{note}</span>
        </div>
      )}
      <div className={`absolute bottom-2 left-2 flex items-center gap-2 bg-background/70 backdrop-blur px-2 py-1 rounded ${variant === 'pip' ? 'text-[10px]' : 'text-xs'}`}>
        <span>{label ?? participant.displayName}</span>
        {!participant.audioEnabled && <MicOff className="h-3 w-3" />}
      </div>
    </div>
  );
}

/** The microphone meter on the pre-join screen: the quickest proof that the mic works. */
function MicMeter({ level, label }: { level: number; label: string }) {
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
    </div>
  );
}

/** Lists cameras/microphones once permission exists; labels are empty before that. */
function useMediaDevices(enabled: boolean) {
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [mics, setMics] = useState<MediaDevice[]>([]);
  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })));
      setMics(all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })));
    } catch (err) {
      logger.warn('[meet] enumerateDevices failed', err);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
  }, [enabled, refresh]);
  return { cameras, mics, refresh };
}

export default function MeetRoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const t = useUiText();
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(() => { try { return localStorage.getItem('webmeet.name') ?? ''; } catch { return ''; } });
  const [copied, setCopied] = useState(false);

  // Pre-join: own preview, device choice, the switches the guest walks in with.
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const previewRef = useRef<MediaStream | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraId, setCameraId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const { cameras, mics, refresh: refreshDevices } = useMediaDevices(!!preview);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // The door.
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [doorError, setDoorError] = useState<string | null>(null);
  const [access, setAccess] = useState<MeetAccess | null>(null);
  const [joining, setJoining] = useState(false);
  const [locking, setLocking] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  // The waiting room: my place in the queue while the host has not answered.
  const [knockId, setKnockId] = useState<string | null>(null);
  const enteringRef = useRef(false);
  // Signed in → probably the host, whose own door never makes them wait; the
  // button says "Join now" and the door still has the last word.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session)); }, []);
  const asksToJoin = !!room?.waiting_room && !signedIn;

  // In the call.
  const [left, setLeft] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [seen, setSeen] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const displayName = name.trim() || t('meet.guest', 'Guest');
  const webmeet = useWebmeet(room?.slug, displayName);
  const micLevel = useAudioLevel(preview, micOn);
  const isHost = !!access?.room.is_host;
  const lobby = useLobbyHost(room?.slug, webmeet.joined && isHost && !!room?.waiting_room);
  useKnockChime(lobby.waiting.length);
  const unread = chatOpen ? 0 : Math.max(0, webmeet.messages.filter((m) => !m.mine).length - seen);

  useEffect(() => {
    if (chatOpen) {
      setSeen(webmeet.messages.filter((m) => !m.mine).length);
      chatEndRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [chatOpen, webmeet.messages]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data, error } = await supabase
        .from('webmeet_rooms')
        .select('id, slug, name, max_participants, is_locked, waiting_room')
        .eq('slug', slug)
        .is('ended_at', null)
        .maybeSingle();
      if (error || !data) setError(t('meet.notFound', 'This meeting does not exist or has ended.'));
      else setRoom(data as RoomMeta);
      setLoading(false);
    })();
  }, [slug, t]);

  // Open the preview as soon as the room is known; a denied camera is a message, not a wall.
  useEffect(() => {
    if (!room || webmeet.joined || left || previewRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        previewRef.current = stream;
        setPreview(stream);
        setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '');
        setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? '');
      } catch (err) {
        logger.warn('[meet] camera/mic preview unavailable', err);
        setPreviewError(t('meet.previewBlocked', 'Camera or microphone is blocked. Allow access in the browser, or join with audio off.'));
        setCamOn(false);
      }
    })();
    return () => { cancelled = true; };
  }, [room, webmeet.joined, left, t]);

  useEffect(() => {
    if (previewVideoRef.current && preview) previewVideoRef.current.srcObject = preview;
  }, [preview]);

  // Stop the preview when the page goes away (joining hands the stream over instead).
  useEffect(() => () => { previewRef.current?.getTracks().forEach((tr) => tr.stop()); }, []);

  const swapPreviewDevice = async (kind: 'video' | 'audio', deviceId: string) => {
    const cur = previewRef.current;
    if (!cur) return;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: { deviceId: { exact: deviceId } } } : { audio: { deviceId: { exact: deviceId } } });
      const newTrack = kind === 'video' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
      const old = kind === 'video' ? cur.getVideoTracks()[0] : cur.getAudioTracks()[0];
      if (old) { cur.removeTrack(old); old.stop(); }
      if (newTrack) cur.addTrack(newTrack);
      const next = new MediaStream(cur.getTracks());
      previewRef.current = next;
      setPreview(next);
      if (kind === 'video') setCameraId(deviceId); else setMicId(deviceId);
      refreshDevices();
    } catch (err) {
      logger.warn('[meet] could not switch device', err);
    }
  };

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), []);
  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: t('meet.linkCopied', 'Link copied'), description: t('meet.linkCopiedHint', 'Anyone with the link can join — no account needed.') });
  };

  const doorMessage = (code: MeetAccessError, fallback?: string): string => {
    switch (code) {
      case 'room_not_found': return t('meet.notFound', 'This meeting does not exist or has ended.');
      case 'room_locked': return t('meet.locked', 'The host has locked this meeting. Ask them to let you in.');
      case 'password_required': return t('meet.passwordRequired', 'This meeting needs a password.');
      case 'password_wrong': return t('meet.passwordWrong', 'That password is not right.');
      case 'knock_denied': return t('meet.notLetIn', 'The host could not let you in right now.');
      case 'knock_expired': return t('meet.queueLost', 'Your place in the queue was lost. Ask to join again.');
      // The server's own words ('Worker failed to boot…') are for the log, not the guest.
      default: logger.warn('[meet] door unavailable', fallback); return t('meet.unavailable', 'Could not reach the meeting right now. Try again in a moment.');
    }
  };

  /** The door said yes: hand the preview over and go in. */
  const enterWith = async (access: MeetAccess) => {
    setAccess(access);
    try { localStorage.setItem('webmeet.name', name.trim()); } catch { /* per-viewer convenience only */ }
    const stream = previewRef.current;
    previewRef.current = null; // handed over to the call
    try {
      await webmeet.join({
        video: camOn, audio: micOn, videoDeviceId: cameraId || undefined, audioDeviceId: micId || undefined,
        iceServers: access.iceServers, maxParticipants: access.room.max_participants, previewStream: stream,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'room_full') {
        setDoorError(t('meet.full', 'This meeting is full.'));
      } else {
        logger.error('[meet] join failed', err);
        setDoorError(t('meet.joinFailed', 'Could not join. Check your camera and microphone and try again.'));
      }
    }
  };

  /** What the door answered: in, wait, or no. */
  const takeAnswer = async (knock: MeetDoorAnswer) => {
    if (knock.ok === false) {
      const refused: { error: MeetAccessError; message?: string } = knock;
      setKnockId(null);
      if (refused.error === 'password_required') { setNeedsPassword(true); setDoorError(null); }
      else setDoorError(doorMessage(refused.error, refused.message));
      return;
    }
    if (knock.ok === 'waiting') {
      setRoom((r) => (r ? { ...r, waiting_room: true } : r));
      setKnockId(knock.knockId);
      return;
    }
    if (enteringRef.current) return;
    enteringRef.current = true;
    try { await enterWith(knock.access); } finally { enteringRef.current = false; setKnockId(null); }
  };

  const joinNow = async () => {
    if (!room) return;
    setJoining(true);
    setDoorError(null);
    try {
      const knock = await fetchMeetAccess(room.slug, { password: needsPassword ? password : undefined, name: name.trim() });
      await takeAnswer(knock);
    } finally {
      setJoining(false);
    }
  };

  // While waiting: ask the door again with my knock id — at once when the host
  // answers over the lobby channel, and every few seconds regardless.
  const askAgain = useCallback(async () => {
    if (!room || !knockId || enteringRef.current) return;
    const knock = await fetchMeetAccess(room.slug, { password: needsPassword ? password : undefined, name: name.trim(), knockId });
    await takeAnswer(knock);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- takeAnswer closes over the same state; the ref below keeps the latest
  }, [room, knockId, needsPassword, password, name]);
  const askAgainRef = useRef(askAgain);
  askAgainRef.current = askAgain;
  useEffect(() => {
    if (!knockId) return;
    const id = window.setInterval(() => { askAgainRef.current(); }, LOBBY_POLL_MS);
    return () => window.clearInterval(id);
  }, [knockId]);
  const { hostPresent } = useLobbyGuest(room?.slug, knockId, displayName, (admitted) => {
    if (admitted) askAgainRef.current();
    else { setKnockId(null); setDoorError(t('meet.notLetIn', 'The host could not let you in right now.')); }
  });
  const leaveQueue = () => { setKnockId(null); setDoorError(null); };

  const toggleLock = async () => {
    if (!room || !access?.room.is_host) return;
    setLocking(true);
    const next = !room.is_locked;
    const { error } = await supabase.from('webmeet_rooms').update({ is_locked: next }).eq('id', room.id);
    setLocking(false);
    if (error) { toast({ title: t('meet.lockFailed', 'Could not change the lock'), description: error.message, variant: 'destructive' }); return; }
    setRoom({ ...room, is_locked: next });
    toast({ title: next ? t('meet.lockedToast', 'Meeting locked — nobody else can join') : t('meet.unlockedToast', 'Meeting unlocked') });
  };

  const toggleWaitingRoom = async () => {
    if (!room || !access?.room.is_host) return;
    const next = !room.waiting_room;
    const { error } = await supabase.from('webmeet_rooms').update({ waiting_room: next }).eq('id', room.id);
    if (error) { toast({ title: t('meet.waitingRoomFailed', 'Could not change the waiting room'), description: error.message, variant: 'destructive' }); return; }
    setRoom({ ...room, waiting_room: next });
    toast({ title: next ? t('meet.waitingRoomOn', 'Waiting room on — you let each person in') : t('meet.waitingRoomOff', 'Waiting room off — the link goes straight in') });
  };

  const endForEveryone = async () => {
    if (!room || !access?.room.is_host) return;
    if (!confirm(t('meet.endConfirm', 'End the meeting for everyone?'))) return;
    const { error } = await supabase.rpc('end_webmeet_room', { p_room_id: room.id });
    if (error) { toast({ title: t('meet.endFailed', 'Could not end the meeting'), description: error.message, variant: 'destructive' }); return; }
    await webmeet.leave();
    setError(t('meet.ended', 'The meeting has ended.'));
  };

  const leaveCall = async () => {
    await webmeet.leave();
    setChatOpen(false);
    setLeft(true);
  };

  const send = () => {
    if (!draft.trim()) return;
    webmeet.sendMessage(draft);
    setDraft('');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{t('common.loading', 'Loading…')}</div>;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-medium">{error}</h1>
          <Button asChild variant="outline"><Link to="/">{t('common.goHome', 'Go home')}</Link></Button>
        </div>
      </div>
    );
  }

  if (left) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="max-w-sm w-full text-center space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t('meet.youLeft', 'You left the meeting')}</h1>
            <p className="text-sm text-muted-foreground">{room?.name || t('meet.defaultTitle', 'Meeting')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => window.location.reload()}>{t('meet.rejoin', 'Rejoin')}</Button>
            <Button variant="outline" asChild><Link to="/">{t('common.goHome', 'Go home')}</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  if (!webmeet.joined) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-background">
        <div className="w-full max-w-3xl grid gap-6 md:grid-cols-[3fr_2fr] items-start">
          <div className="space-y-3">
            <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-muted">
              {preview && camOn ? (
                <video ref={previewVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm px-6 text-center">
                  {previewError ?? t('meet.cameraOff', 'Camera is off')}
                </div>
              )}
              <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2">
                <Button type="button" variant={micOn ? 'secondary' : 'destructive'} size="icon" onClick={() => setMicOn((v) => !v)} aria-label={t('meet.toggleMic', 'Toggle microphone')} disabled={!preview}>
                  {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
                <Button type="button" variant={camOn ? 'secondary' : 'destructive'} size="icon" onClick={() => setCamOn((v) => !v)} aria-label={t('meet.toggleCamera', 'Toggle camera')} disabled={!preview}>
                  {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="secondary" size="icon" onClick={() => setShowDevices((v) => !v)} aria-label={t('meet.devices', 'Camera and microphone')} disabled={!preview}>
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {preview && micOn && <MicMeter level={micLevel} label={t('meet.micLevel', 'Microphone level')} />}
            {showDevices && preview && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={cameraId} onValueChange={(v) => swapPreviewDevice('video', v)}>
                  <SelectTrigger aria-label={t('meet.camera', 'Camera')}><SelectValue placeholder={t('meet.camera', 'Camera')} /></SelectTrigger>
                  <SelectContent>{cameras.map((c) => <SelectItem key={c.deviceId} value={c.deviceId}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={micId} onValueChange={(v) => swapPreviewDevice('audio', v)}>
                  <SelectTrigger aria-label={t('meet.microphone', 'Microphone')}><SelectValue placeholder={t('meet.microphone', 'Microphone')} /></SelectTrigger>
                  <SelectContent>{mics.map((m) => <SelectItem key={m.deviceId} value={m.deviceId}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{room?.name || t('meet.defaultTitle', 'Meeting')}</h1>
              {knockId ? (
                <p className="text-sm text-muted-foreground">{t('meet.youAreInQueue', 'You are in the queue, {name}.').replace('{name}', displayName)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{asksToJoin ? t('meet.waitingRoomHint', 'The host lets people in one at a time. Check your camera and microphone, then ask to join.') : t('meet.readyHint', 'Check your camera and microphone, then join.')}</p>
              )}
            </div>
            {knockId ? (
              <div className="space-y-4" data-testid="in-queue" role="status" aria-live="polite">
                <div className="rounded-xl border border-border bg-muted/40 p-4 flex items-start gap-3">
                  <Loader2 className="h-5 w-5 animate-spin shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="space-y-1">
                    <div className="font-medium">{hostPresent ? t('meet.waitingForHost', 'Waiting for the host to let you in') : t('meet.hostNotHereYet', 'The host has not arrived yet')}</div>
                    <p className="text-sm text-muted-foreground">{hostPresent ? t('meet.waitingForHostHint', 'They can see you are here. Keep this page open — you will be let in when they are ready.') : t('meet.hostNotHereYetHint', 'Keep this page open. You will be let in as soon as they are ready.')}</p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={leaveQueue}>{t('meet.leaveQueue', 'Leave the queue')}</Button>
              </div>
            ) : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); joinNow(); }}>
              <Input placeholder={t('meet.yourName', 'Your name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" />
              {needsPassword && (
                <Input type="password" placeholder={t('meet.password', 'Meeting password')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              )}
              {doorError && <p className="text-sm text-destructive">{doorError}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={!name.trim() || joining || webmeet.connecting}>
                {joining || webmeet.connecting ? t('meet.connecting', 'Connecting…') : asksToJoin ? t('meet.askToJoin', 'Ask to join') : t('meet.join', 'Join now')}
              </Button>
            </form>
            )}
            <div className="pt-4 border-t space-y-2">
              <div className="text-xs text-muted-foreground">{t('meet.shareThis', 'Share this meeting')}</div>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink} aria-label={t('meet.copyLink', 'Copy link')}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const others = webmeet.participants;
  const self = (variant: 'grid' | 'pip') => (
    <ParticipantTile
      key="local"
      t={t}
      variant={variant}
      mirror={!webmeet.isScreenSharing && webmeet.facingUser}
      participant={{ stream: webmeet.localStream ?? undefined, displayName: name, videoEnabled: webmeet.videoEnabled || webmeet.isScreenSharing, audioEnabled: webmeet.audioEnabled }}
      label={t('meet.you', 'You')}
    />
  );

  // Alone: the link, big — that is the moment the host wonders whether it works.
  // One other: them on the stage, you in the corner, like a phone call with faces.
  // Three or more: a grid.
  let stage: JSX.Element;
  if (others.length === 0) {
    stage = (
      <div className="relative h-full flex items-center justify-center">
        <div className="absolute inset-0 opacity-40">{self('grid')}</div>
        <div className="relative max-w-md w-full rounded-xl border border-border bg-background/95 backdrop-blur p-6 space-y-4 text-center shadow-lg">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t('meet.waitingTitle', 'Waiting for others to join')}</h2>
            <p className="text-sm text-muted-foreground">{t('meet.waitingHint', 'Send them this link. They need no account — just a browser.')}</p>
          </div>
          <div className="flex gap-2">
            <Input readOnly value={shareUrl} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copyLink} className="gap-2 shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {t('meet.copy', 'Copy')}
            </Button>
          </div>
        </div>
      </div>
    );
  } else if (others.length === 1) {
    stage = (
      <div className="relative h-full">
        <ParticipantTile t={t} variant="fill" participant={others[0]} />
        <div className="absolute bottom-3 right-3">{self('pip')}</div>
      </div>
    );
  } else {
    const count = others.length + 1;
    const gridCols = count <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';
    stage = (
      <div className={`grid ${gridCols} gap-3 max-w-6xl mx-auto content-center h-full`}>
        {self('grid')}
        {others.map((p: RemoteParticipant) => <ParticipantTile key={p.peerId} t={t} participant={p} />)}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background relative">
      <header className="border-b px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-medium truncate">{room?.name || t('meet.defaultTitle', 'Meeting')}</div>
          <Button size="sm" variant="outline" onClick={copyLink} className="gap-2 shrink-0">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span className="hidden sm:inline">{t('meet.copyLink', 'Copy link')}</span>
          </Button>
          {isHost && (
            <Button size="sm" variant={room?.is_locked ? 'default' : 'outline'} onClick={toggleLock} disabled={locking} className="gap-2 shrink-0" title={room?.is_locked ? t('meet.unlock', 'Unlock — let more people in') : t('meet.lock', 'Lock — nobody else can join')}>
              {room?.is_locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              <span className="hidden sm:inline">{room?.is_locked ? t('meet.lockedShort', 'Locked') : t('meet.lockShort', 'Lock')}</span>
            </Button>
          )}
          {isHost && (
            <Button size="sm" variant={room?.waiting_room ? 'default' : 'outline'} onClick={toggleWaitingRoom} className="gap-2 shrink-0" data-testid="toggle-waiting-room" title={room?.waiting_room ? t('meet.waitingRoomIsOn', 'Waiting room on — you let each person in. Click to turn off.') : t('meet.waitingRoomIsOff', 'Waiting room off — the link goes straight in. Click to turn on.')}>
              {room?.waiting_room ? <DoorClosed className="h-3 w-3" /> : <DoorOpen className="h-3 w-3" />}
              <span className="hidden sm:inline">{t('meet.waitingRoom', 'Waiting room')}</span>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          {access?.provider === 'cloudflare' && <span title={t('meet.relayOn', 'Relay on — the call gets through firewalls')}><ShieldCheck className="h-3.5 w-3.5" /></span>}
          <span>{t('meet.inCall', '{n} in the call').replace('{n}', String(webmeet.participants.length + 1))}</span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 p-3 sm:p-4 min-h-0 overflow-auto flex flex-col gap-3">
          {isHost && room?.waiting_room && <WaitingList waiting={lobby.waiting} onAdmit={lobby.admit} onDeny={lobby.deny} t={t} />}
          <div className="flex-1 min-h-0">{stage}</div>
        </main>
        {chatOpen && (
          <aside className="w-full sm:w-80 border-l flex flex-col bg-background absolute inset-0 sm:static z-10">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div>
                <div className="text-sm font-medium">{t('meet.messages', 'Messages')}</div>
                <div className="text-[11px] text-muted-foreground">{t('meet.messagesEphemeral', 'Only for this call — nothing is saved.')}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)} aria-label={t('common.close', 'Close')}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {webmeet.messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">{t('meet.noMessages', 'Paste a link or say something everyone can read.')}</p>}
              {webmeet.messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                  {!m.mine && <span className="text-[11px] text-muted-foreground px-1">{m.name}</span>}
                  <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{m.text}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="p-2 border-t flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('meet.messagePlaceholder', 'Message everyone')} autoFocus />
              <Button type="submit" size="icon" disabled={!draft.trim()} aria-label={t('meet.send', 'Send')}><Send className="h-4 w-4" /></Button>
            </form>
          </aside>
        )}
      </div>

      <footer className="border-t px-4 py-3 flex items-center justify-center gap-2 flex-wrap">
        <Button variant={webmeet.audioEnabled ? 'secondary' : 'destructive'} size="icon" onClick={webmeet.toggleAudio} aria-label={t('meet.toggleMic', 'Toggle microphone')}>
          {webmeet.audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button variant={webmeet.videoEnabled ? 'secondary' : 'destructive'} size="icon" onClick={webmeet.toggleVideo} aria-label={t('meet.toggleCamera', 'Toggle camera')}>
          {webmeet.videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        <Button variant={webmeet.isScreenSharing ? 'default' : 'secondary'} size="icon" onClick={webmeet.toggleScreenShare} aria-label={t('meet.shareScreen', 'Share screen')} className="hidden sm:inline-flex">
          {webmeet.isScreenSharing ? <MonitorOff className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
        </Button>
        {cameras.length > 1 && (
          <Button variant="secondary" size="icon" onClick={webmeet.flipCamera} aria-label={t('meet.flipCamera', 'Switch camera')} className="sm:hidden">
            <SwitchCamera className="h-4 w-4" />
          </Button>
        )}
        <Button variant={chatOpen ? 'default' : 'secondary'} size="icon" onClick={() => setChatOpen((v) => !v)} aria-label={t('meet.messages', 'Messages')} className="relative">
          <MessageSquare className="h-4 w-4" />
          {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center">{unread}</span>}
        </Button>
        {(cameras.length > 1 || mics.length > 1) && (
          <Select onValueChange={(v) => { const [kind, id] = v.split('|'); webmeet.switchDevice(kind as 'video' | 'audio', id); }}>
            <SelectTrigger className="w-10 h-10 p-0 justify-center [&>svg:last-child]:hidden" aria-label={t('meet.devices', 'Camera and microphone')}><Settings2 className="h-4 w-4" /></SelectTrigger>
            <SelectContent>
              {cameras.map((c) => <SelectItem key={`v${c.deviceId}`} value={`video|${c.deviceId}`}>{c.label}</SelectItem>)}
              {mics.map((m) => <SelectItem key={`a${m.deviceId}`} value={`audio|${m.deviceId}`}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="destructive" size="icon" onClick={leaveCall} aria-label={t('meet.leave', 'Leave')}>
          <Phone className="h-4 w-4 rotate-[135deg]" />
        </Button>
        {isHost && (
          <Button variant="ghost" size="sm" onClick={endForEveryone} className="text-destructive">{t('meet.endForAll', 'End for everyone')}</Button>
        )}
      </footer>
    </div>
  );
}
