import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Phone, MonitorUp, MonitorOff, Copy, Check, Lock, Unlock, Settings2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWebmeet, fetchMeetAccess, type MeetAccess, type MeetAccessError, type RemoteParticipant } from '@/hooks/useWebmeet';
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
 */

interface RoomMeta {
  id: string;
  slug: string;
  name: string | null;
  max_participants: number;
  is_locked: boolean;
}

interface MediaDevice { deviceId: string; label: string }

function ParticipantTile({ participant, label, mirror }: { participant: { stream?: MediaStream | null; displayName: string; videoEnabled: boolean; audioEnabled: boolean }; label?: string; mirror?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && participant.stream) videoRef.current.srcObject = participant.stream;
  }, [participant.stream]);
  return (
    <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border border-border">
      <video ref={videoRef} autoPlay playsInline muted={!!label} className={`w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`} />
      {!participant.videoEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="text-4xl font-medium text-muted-foreground">{participant.displayName.charAt(0).toUpperCase()}</div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-background/70 backdrop-blur px-2 py-1 rounded text-xs">
        <span>{label ?? participant.displayName}</span>
        {!participant.audioEnabled && <MicOff className="h-3 w-3" />}
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

  const webmeet = useWebmeet(room?.slug, name.trim() || t('meet.guest', 'Guest'));

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data, error } = await supabase
        .from('webmeet_rooms')
        .select('id, slug, name, max_participants, is_locked')
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
    if (!room || webmeet.joined || previewRef.current) return;
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
  }, [room, webmeet.joined, t]);

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
      default: return fallback || t('meet.unavailable', 'Could not reach the meeting right now. Try again in a moment.');
    }
  };

  const joinNow = async () => {
    if (!room) return;
    setJoining(true);
    setDoorError(null);
    try {
      const knock = await fetchMeetAccess(room.slug, needsPassword ? password : undefined);
      if (knock.ok === false) {
        const refused: { error: MeetAccessError; message?: string } = knock;
        if (refused.error === 'password_required') { setNeedsPassword(true); setDoorError(null); }
        else setDoorError(doorMessage(refused.error, refused.message));
        return;
      }
      setAccess(knock.access);
      try { localStorage.setItem('webmeet.name', name.trim()); } catch { /* per-viewer convenience only */ }
      const stream = previewRef.current;
      previewRef.current = null; // handed over to the call
      await webmeet.join({
        video: camOn, audio: micOn, videoDeviceId: cameraId || undefined, audioDeviceId: micId || undefined,
        iceServers: knock.access.iceServers, maxParticipants: knock.access.room.max_participants, previewStream: stream,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'room_full') {
        setDoorError(t('meet.full', 'This meeting is full.'));
      } else {
        logger.error('[meet] join failed', err);
        setDoorError(t('meet.joinFailed', 'Could not join. Check your camera and microphone and try again.'));
      }
    } finally {
      setJoining(false);
    }
  };

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

  const endForEveryone = async () => {
    if (!room || !access?.room.is_host) return;
    if (!confirm(t('meet.endConfirm', 'End the meeting for everyone?'))) return;
    const { error } = await supabase.rpc('end_webmeet_room', { p_room_id: room.id });
    if (error) { toast({ title: t('meet.endFailed', 'Could not end the meeting'), description: error.message, variant: 'destructive' }); return; }
    await webmeet.leave();
    setError(t('meet.ended', 'The meeting has ended.'));
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
              <p className="text-sm text-muted-foreground">{t('meet.readyHint', 'Check your camera and microphone, then join.')}</p>
            </div>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); joinNow(); }}>
              <Input placeholder={t('meet.yourName', 'Your name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" />
              {needsPassword && (
                <Input type="password" placeholder={t('meet.password', 'Meeting password')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              )}
              {doorError && <p className="text-sm text-destructive">{doorError}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={!name.trim() || joining || webmeet.connecting}>
                {joining || webmeet.connecting ? t('meet.connecting', 'Connecting…') : t('meet.join', 'Join now')}
              </Button>
            </form>
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

  const tiles: Array<{ key: string; element: JSX.Element }> = [
    {
      key: 'local',
      element: (
        <ParticipantTile
          key="local"
          mirror={!webmeet.isScreenSharing}
          participant={{ stream: webmeet.localStream ?? undefined, displayName: name, videoEnabled: webmeet.videoEnabled || webmeet.isScreenSharing, audioEnabled: webmeet.audioEnabled }}
          label={t('meet.you', 'You')}
        />
      ),
    },
    ...webmeet.participants.map((p: RemoteParticipant) => ({ key: p.peerId, element: <ParticipantTile key={p.peerId} participant={p} /> })),
  ];
  const gridCols = tiles.length <= 1 ? 'grid-cols-1' : tiles.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';
  const isHost = !!access?.room.is_host;

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          {access?.provider === 'cloudflare' && <span title={t('meet.relayOn', 'Relay on — the call gets through firewalls')}><ShieldCheck className="h-3.5 w-3.5" /></span>}
          <span>{webmeet.participants.length + 1} / {room?.max_participants}</span>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 overflow-auto">
        <div className={`grid ${gridCols} gap-3 max-w-6xl mx-auto`}>{tiles.map((tile) => tile.element)}</div>
      </main>

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
        {(cameras.length > 1 || mics.length > 1) && (
          <Select onValueChange={(v) => { const [kind, id] = v.split('|'); webmeet.switchDevice(kind as 'video' | 'audio', id); }}>
            <SelectTrigger className="w-10 h-10 p-0 justify-center [&>svg:last-child]:hidden" aria-label={t('meet.devices', 'Camera and microphone')}><Settings2 className="h-4 w-4" /></SelectTrigger>
            <SelectContent>
              {cameras.map((c) => <SelectItem key={`v${c.deviceId}`} value={`video|${c.deviceId}`}>{c.label}</SelectItem>)}
              {mics.map((m) => <SelectItem key={`a${m.deviceId}`} value={`audio|${m.deviceId}`}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="destructive" size="icon" onClick={() => webmeet.leave()} aria-label={t('meet.leave', 'Leave')}>
          <Phone className="h-4 w-4 rotate-[135deg]" />
        </Button>
        {isHost && (
          <Button variant="ghost" size="sm" onClick={endForEveryone} className="text-destructive">{t('meet.endForAll', 'End for everyone')}</Button>
        )}
      </footer>
    </div>
  );
}
