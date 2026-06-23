import { useEffect, useState } from 'react';
import { Video, Plus, Copy, Check, ExternalLink, Square } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

interface Room {
  id: string;
  slug: string;
  name: string | null;
  max_participants: number;
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

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('webmeet_rooms')
      .select('id, slug, name, max_participants, expires_at, ended_at, created_at')
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    setRooms((data as Room[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createRoom = async () => {
    setCreating(true);
    const { data, error } = await supabase.rpc('create_webmeet_room', {
      p_name: name || null,
      p_max_participants: maxParticipants,
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
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New meeting
        </Button>
      </AdminPageHeader>

      <AdminPageContainer>
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
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Start a meeting
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
                      {room.name || 'Untitled meeting'}
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
              <Label htmlFor="max">Max participants</Label>
              <Input
                id="max"
                type="number"
                min={2}
                max={16}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Math.max(2, Math.min(16, parseInt(e.target.value || '8', 10))))}
              />
              <p className="text-xs text-muted-foreground">P2P mesh works best up to 6. Use Webinars for larger broadcasts.</p>
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
