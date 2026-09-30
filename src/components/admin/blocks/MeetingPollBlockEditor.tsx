/**
 * Meeting Poll block editor.
 *
 * Preview (isEditing=false) IS the public block. Settings pick which poll the
 * block shows — from the polls this instance has (list_meeting_polls), or by
 * pasting a share token — plus the section copy. Nothing about the poll itself
 * is edited here; that happens under Bookings → Meeting polls.
 *
 * No local copy of `data` (no-frozen-block-editors): every change goes straight
 * to onChange and the parent hands the block back.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MeetingPollBlock } from '@/components/public/blocks/MeetingPollBlock';
import { useMeetingPolls } from '@/hooks/useMeetingPolls';
import type { MeetingPollBlockData } from '@/types/cms';

interface MeetingPollBlockEditorProps {
  data: MeetingPollBlockData;
  onChange: (data: MeetingPollBlockData) => void;
  isEditing?: boolean;
}

const tokenOf = (sharePath: string) => sharePath.replace(/^\/poll\//, '');

export function MeetingPollBlockEditor({ data, onChange, isEditing }: MeetingPollBlockEditorProps) {
  const { data: polls = [] } = useMeetingPolls();

  if (!isEditing) {
    return <MeetingPollBlock data={data} />;
  }

  const set = (field: keyof MeetingPollBlockData, value: unknown) => onChange({ ...data, [field]: value });
  const current = polls.find((p) => tokenOf(p.share_path) === (data.shareToken ?? ''));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mp-block-title">Title</Label>
        <Input id="mp-block-title" value={data.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="When can we meet?" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mp-block-description">Description</Label>
        <Textarea id="mp-block-description" rows={2} value={data.description || ''} onChange={(e) => set('description', e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Poll</Label>
        <Select
          value={current ? tokenOf(current.share_path) : (data.shareToken ? '__custom' : '__none')}
          onValueChange={(v) => {
            if (v === '__none') set('shareToken', '');
            else if (v !== '__custom') set('shareToken', v);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Pick a poll" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— none —</SelectItem>
            {polls.map((p) => (
              <SelectItem key={p.id} value={tokenOf(p.share_path)}>
                {p.title} · {p.status} · {p.responses} answer{p.responses === 1 ? '' : 's'}
              </SelectItem>
            ))}
            {data.shareToken && !current && <SelectItem value="__custom">Pasted token</SelectItem>}
          </SelectContent>
        </Select>
        <Input
          value={data.shareToken || ''}
          onChange={(e) => set('shareToken', e.target.value.trim())}
          placeholder="…or paste the share token from the /poll/<token> link"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Polls are created under Bookings → Meeting polls, or by FlowPilot. The block only shows one.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label>Show who answered</Label>
          <p className="text-xs text-muted-foreground">Initials per slot. E-mail addresses are never shown publicly either way.</p>
        </div>
        <Switch checked={data.showRespondents ?? true} onCheckedChange={(v) => set('showRespondents', v)} />
      </div>
    </div>
  );
}
