import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function NewCalendarEventDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [attendeesText, setAttendeesText] = useState('');

  const reset = () => {
    setTitle(''); setStart(''); setEnd(''); setAllDay(false);
    setLocation(''); setAttendeesText('');
  };

  const create = useMutation({
    mutationFn: async () => {
      const attendees = attendeesText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((email) => ({ email }));

      const { error } = await supabase.rpc('manage_calendar_event' as any, {
        p_action: 'create',
        p_title: title,
        p_starts_at: start ? new Date(start).toISOString() : null,
        p_ends_at: end ? new Date(end).toISOString() : null,
        p_all_day: allDay,
        p_location: location || null,
        p_attendees: attendees.length ? attendees : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('Event created');
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New calendar event</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Team standup" />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>All day</Label>
            <Switch checked={allDay} onCheckedChange={setAllDay} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type={allDay ? 'date' : 'datetime-local'} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input type={allDay ? 'date' : 'datetime-local'} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </div>

          <div className="space-y-2">
            <Label>Attendees</Label>
            <Textarea
              value={attendeesText}
              onChange={(e) => setAttendeesText(e.target.value)}
              placeholder="One email per line or comma-separated"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!title || !start || create.isPending}>
            {create.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
