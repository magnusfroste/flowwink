import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Phone, MonitorUp, MonitorOff, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWebmeet, RemoteParticipant } from '@/hooks/useWebmeet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface RoomMeta {
  id: string;
  slug: string;
  name: string | null;
  max_participants: number;
}

function ParticipantTile({ participant, label }: { participant: { stream?: MediaStream | null; displayName: string; videoEnabled: boolean; audioEnabled: boolean }; label?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border border-border">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!!label /* local tile muted */}
        className="w-full h-full object-cover"
      />
      {!participant.videoEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="text-4xl font-medium text-muted-foreground">
            {participant.displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-background/70 backdrop-blur px-2 py-1 rounded text-xs">
        <span>{label ?? participant.displayName}</span>
        {!participant.audioEnabled && <MicOff className="h-3 w-3" />}
      </div>
    </div>
  );
}

export default function MeetRoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);

  const webmeet = useWebmeet(room?.slug, name || 'Guest');

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data, error } = await supabase
        .from('webmeet_rooms')
        .select('id, slug, name, max_participants')
        .eq('slug', slug)
        .is('ended_at', null)
        .maybeSingle();
      if (error || !data) {
        setError('Meeting room not found or has ended.');
      } else {
        setRoom(data as RoomMeta);
      }
      setLoading(false);
    })();
  }, [slug]);

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [room]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: 'Link copied', description: 'Share it with anyone you want to invite.' });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-medium">{error}</h1>
          <Button asChild variant="outline"><Link to="/">Go home</Link></Button>
        </div>
      </div>
    );
  }

  if (!webmeet.joined) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{room?.name || 'Meeting'}</h1>
            <p className="text-sm text-muted-foreground">Enter your name to join</p>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Button
              className="w-full"
              size="lg"
              disabled={!name.trim() || webmeet.connecting}
              onClick={() => webmeet.join({ video: true, audio: true })}
            >
              {webmeet.connecting ? 'Connecting…' : 'Join with video & audio'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              disabled={!name.trim() || webmeet.connecting}
              onClick={() => webmeet.join({ video: false, audio: true })}
            >
              Join with audio only
            </Button>
          </div>

          <div className="pt-4 border-t">
            <div className="text-xs text-muted-foreground mb-2">Share this meeting</div>
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} className="text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
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
          participant={{
            stream: webmeet.localStream ?? undefined,
            displayName: name,
            videoEnabled: webmeet.videoEnabled || webmeet.isScreenSharing,
            audioEnabled: webmeet.audioEnabled,
          }}
          label="You"
        />
      ),
    },
    ...webmeet.participants.map((p: RemoteParticipant) => ({
      key: p.peerId,
      element: <ParticipantTile key={p.peerId} participant={p} />,
    })),
  ];

  const gridCols = tiles.length <= 1 ? 'grid-cols-1' : tiles.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="font-medium">{room?.name || 'Meeting'}</div>
          <Button size="sm" variant="outline" onClick={copyLink} className="gap-2">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            Copy link
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {webmeet.participants.length + 1} / {room?.max_participants}
        </div>
      </header>

      <main className="flex-1 p-4 overflow-auto">
        <div className={`grid ${gridCols} gap-3 max-w-6xl mx-auto`}>
          {tiles.map((t) => t.element)}
        </div>
      </main>

      <footer className="border-t px-4 py-3 flex items-center justify-center gap-2">
        <Button variant={webmeet.audioEnabled ? 'secondary' : 'destructive'} size="icon" onClick={webmeet.toggleAudio}>
          {webmeet.audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button variant={webmeet.videoEnabled ? 'secondary' : 'destructive'} size="icon" onClick={webmeet.toggleVideo}>
          {webmeet.videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        <Button variant={webmeet.isScreenSharing ? 'default' : 'secondary'} size="icon" onClick={webmeet.toggleScreenShare}>
          {webmeet.isScreenSharing ? <MonitorOff className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
        </Button>
        <Button variant="destructive" size="icon" onClick={() => webmeet.leave()}>
          <Phone className="h-4 w-4 rotate-[135deg]" />
        </Button>
      </footer>
    </div>
  );
}
