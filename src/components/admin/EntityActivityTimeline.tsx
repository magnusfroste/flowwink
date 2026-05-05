import { useState } from 'react';
import { format } from 'date-fns';
import { Check, Clock, FileText, Mail, MessageSquare, Phone, Trash2, Users } from 'lucide-react';
import {
  EntityActivityType,
  useCreateEntityActivity,
  useDeleteEntityActivity,
  useEntityActivities,
  useToggleActivityDone,
} from '@/hooks/useEntityActivities';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const TYPE_META: Record<EntityActivityType, { label: string; icon: typeof FileText }> = {
  note: { label: 'Note', icon: FileText },
  call: { label: 'Call', icon: Phone },
  meeting: { label: 'Meeting', icon: Users },
  todo: { label: 'To-do', icon: Clock },
  email: { label: 'Email', icon: Mail },
  status_change: { label: 'Status', icon: MessageSquare },
};

export interface EntityActivityTimelineProps {
  entityType: string;
  entityId: string;
  title?: string;
  compact?: boolean;
}

export function EntityActivityTimeline({ entityType, entityId, title = 'Activity', compact }: EntityActivityTimelineProps) {
  const { data: items = [], isLoading } = useEntityActivities(entityType, entityId);
  const create = useCreateEntityActivity();
  const toggle = useToggleActivityDone();
  const del = useDeleteEntityActivity();

  const [type, setType] = useState<EntityActivityType>('note');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');

  const handleAdd = async () => {
    if (!subject.trim() && !body.trim()) return;
    await create.mutateAsync({
      entity_type: entityType,
      entity_id: entityId,
      activity_type: type,
      subject: subject.trim() || null,
      body: body.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setSubject('');
    setBody('');
    setDueAt('');
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary">{items.length}</Badge>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={type} onValueChange={(v) => setType(v as EntityActivityType)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          {(type === 'todo' || type === 'meeting' || type === 'call') && (
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-52" />
          )}
        </div>
        {!compact && (
          <Textarea placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} rows={2} />
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Tip: type <code className="px-1 rounded bg-muted">@name</code> to auto-follow teammates.
          </p>
          <Button size="sm" onClick={handleAdd} disabled={create.isPending}>Add</Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
        )}
        {items.map((a) => {
          const Icon = TYPE_META[a.activity_type]?.icon ?? FileText;
          const isOpen = !a.done_at && (a.activity_type === 'todo' || a.activity_type === 'call' || a.activity_type === 'meeting');
          return (
            <div key={a.id} className="flex gap-3 border-l-2 border-border pl-3 py-2 group">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${a.done_at ? 'text-muted-foreground' : 'text-primary'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-medium ${a.done_at ? 'line-through text-muted-foreground' : ''}`}>
                    {a.subject || TYPE_META[a.activity_type]?.label}
                  </span>
                  {a.due_at && (
                    <Badge variant={isOpen ? 'default' : 'outline'} className="text-xs">
                      {format(new Date(a.due_at), 'MMM d HH:mm')}
                    </Badge>
                  )}
                </div>
                {a.body && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(a.created_at), 'MMM d, yyyy HH:mm')}
                </p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                {(a.activity_type === 'todo' || a.activity_type === 'call' || a.activity_type === 'meeting') && (
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: a.id, done: !a.done_at })}>
                    <Check className="h-3 w-3" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => del.mutate({ id: a.id, entity_type: entityType, entity_id: entityId })}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
