import { useEffect, useState } from 'react';
import { Video, Copy, Check, ExternalLink, Square, SlidersHorizontal, DoorClosed } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useIsIntegrationActive } from '@/hooks/useIntegrations';
import { ShieldAlert } from 'lucide-react';

interface Room {
  id: string;
  slug: string;
  name: string | null;
  max_participants: number;
  waiting_room: boolean;
  expires_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export default function WebmeetPage() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [creating, setCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(false);
  // Optional, not mandatory: without a TURN relay the call still works on open
  // networks, but not into a customer's office. Say so where rooms are made.
  const turn = useIsIntegrationActive('cloudflare_calls');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('webmeet_rooms')
      .select('id, slug, name, max_participants, waiting_room, expires_at, ended_at, created_at')
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    setRooms((data as Room[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  /**
   * One click: a room with the defaults, the link on the clipboard, and you in
   * it. Name, password and cap are for when you need them — "More options".
   */
  const startNow = async () => {
    setStarting(true);
    const { data, error } = await supabase.rpc('create_webmeet_room', {});
    setStarting(false);
    if (error) {
      toast({ title: 'Could not start a meeting', description: error.message, variant: 'destructive' });
      return;
    }
    const slug = (data as { slug: string }).slug;
    await navigator.clipboard.writeText(`${window.location.origin}/meet/${slug}`).catch(() => {});
    toast({ title: 'Meeting started', description: 'Link copied — send it to whoever you are meeting.' });
    navigate(`/meet/${slug}`);
  };

  const createRoom = async () => {
    setCreating(true);
    const { data, error } = await supabase.rpc('create_webmeet_room', {
      p_name: name || null,
      p_password: password.trim() || null,
      p_max_participants: maxParticipants,
      p_waiting_room: waitingRoom,
    });
    setCreating(false);
    if (error) {
      toast({ title: 'Could not create room', description: error.message, variant: 'destructive' });
      return;
    }
    const slug = (data as { slug: string }).slug;
    const url = `${window.location.origin}/meet/${slug}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast({ title: 'Room created', description: 'Link copied to clipboard.' });
    setDialogOpen(false);
    setName('');
    setPassword('');
    setWaitingRoom(false);
    setMaxParticipants(8);
    load();
  };

  const endRoom = async (id: string) => {
    const { error } = await supabase.rpc('end_webmeet_room', { p_room_id: id });
    if (error) {
      toast({ title: 'Could not end room', description: error.message, variant: 'destructive' });
      return;
    }
    load();
  };

  const copyLink = async (slug: string) => {
    const url = `${window.location.origin}/meet/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1500);
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title="WebMeet"
        description="Quick video meetings with a shareable URL — like Google Meet, built in."
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialogOpen(true)} className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            More options
          </Button>
          <Button onClick={startNow} disabled={starting} className="gap-2">
            <Video className="h-4 w-4" />
            {starting ? 'Starting…' : 'Start meeting'}
          </Button>
        </div>
      </AdminPageHeader>

      <AdminPageContainer>
        {!turn.isActive && (
          <Alert className="mb-4">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Calls may fail behind strict firewalls</AlertTitle>
            <AlertDescription>
              WebMeet runs on public STUN only. A guest behind a corporate firewall or symmetric NAT often cannot connect.
              Connect <Link to="/admin/integrations" className="underline">Cloudflare Calls (TURN)</Link> under Integrations — optional, free tier, nothing else changes.
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : rooms.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <Video className="h-12 w-12 mx-auto text-muted-foreground" />
              <div className="text-lg font-medium">No active rooms</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Create a room to get a shareable URL. Anyone with the link can join — no install needed.
              </p>
              <Button onClick={startNow} disabled={starting} className="gap-2">
                <Video className="h-4 w-4" /> {starting ? 'Starting…' : 'Start a meeting'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => {
              const url = `${window.location.origin}/meet/${room.slug}`;
              return (
                <Card key={room.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      <span className="truncate">{room.name || 'Untitled meeting'}</span>
                      {room.waiting_room && <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground shrink-0" title="Guests wait until you let them in"><DoorClosed className="h-3 w-3" /> Waiting room</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground font-mono break-all">/{room.slug}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild className="gap-1">
                        <Link to={`/meet/${room.slug}`}>
                          <ExternalLink className="h-3 w-3" /> Open
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copyLink(room.slug)} className="gap-1">
                        {copiedSlug === room.slug ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => endRoom(room.id)} className="gap-1 ml-auto">
                        <Square className="h-3 w-3" /> End
                      </Button>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{url}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </AdminPageContainer>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input id="name" placeholder="e.g. Weekly sync" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Password (optional)</Label>
              <Input id="pw" type="text" autoComplete="off" placeholder="Guests are asked for it before joining" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="waiting-room">Waiting room</Label>
                <p className="text-xs text-muted-foreground">Guests ask to join and wait until you let them in — for consultations where the previous guest may still be in the room. You can also switch it on inside the call.</p>
              </div>
              <Switch id="waiting-room" checked={waitingRoom} onCheckedChange={setWaitingRoom} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max">Max participants</Label>
              <Input
                id="max"
                type="number"
                min={2}
                max={16}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Math.max(2, Math.min(16, parseInt(e.target.value || '8', 10))))}
              />
              <p className="text-xs text-muted-foreground">Enforced at join. Peer-to-peer works best up to 5; use Webinars for larger broadcasts.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={createRoom} disabled={creating}>{creating ? 'Creating…' : 'Create & copy link'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
