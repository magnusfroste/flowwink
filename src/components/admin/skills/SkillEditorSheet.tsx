import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CodeEditor } from '@/components/admin/CodeEditor';
import type { AgentSkill } from '@/types/agent';
import { Trash2 } from 'lucide-react';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
  category: z.enum(['content', 'crm', 'communication', 'automation', 'search', 'analytics']),
  scope: z.enum(['internal', 'external', 'both']),
  handler: z.string().min(1, 'Required'),
  requires_approval: z.boolean(),
  enabled: z.boolean(),
  tool_definition_json: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface SkillEditorSheetProps {
  skill: AgentSkill | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<AgentSkill> & { name: string; handler: string }) => void;
  onDelete?: (id: string) => void;
}

export function SkillEditorSheet({ skill, open, onClose, onSave, onDelete }: SkillEditorSheetProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      category: 'content',
      scope: 'internal',
      handler: '',
      requires_approval: false,
      enabled: true,
      tool_definition_json: '{}',
    },
  });

  useEffect(() => {
    if (skill) {
      form.reset({
        name: skill.name,
        description: skill.description ?? '',
        category: skill.category,
        scope: skill.scope,
        handler: skill.handler,
        requires_approval: skill.requires_approval,
        enabled: skill.enabled,
        tool_definition_json: JSON.stringify(skill.tool_definition, null, 2),
      });
    } else {
      form.reset({
        name: '',
        description: '',
        category: 'content',
        scope: 'internal',
        handler: '',
        requires_approval: false,
        enabled: true,
        tool_definition_json: '{}',
      });
    }
  }, [skill, open]);

  const handleSubmit = (values: FormValues) => {
    let toolDef: any = {};
    try {
      toolDef = JSON.parse(values.tool_definition_json);
    } catch {
      form.setError('tool_definition_json', { message: 'Invalid JSON' });
      return;
    }

    onSave({
      id: skill?.id,
      name: values.name,
      description: values.description || null,
      category: values.category,
      scope: values.scope,
      handler: values.handler,
      requires_approval: values.requires_approval,
      enabled: values.enabled,
      tool_definition: toolDef,
    });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{skill ? 'Edit Skill' : 'New Skill'}</SheetTitle>
          <SheetDescription>
            {skill ? 'Modify skill configuration and tool definition.' : 'Create a new agent skill.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register('name')} placeholder="e.g. search_web" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              placeholder="What does this skill do?"
              rows={2}
            />
          </div>

          {/* Category + Scope */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.watch('category')}
                onValueChange={(v: any) => form.setValue('category', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="crm">CRM</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="automation">Automation</SelectItem>
                  <SelectItem value="search">Search</SelectItem>
                  <SelectItem value="analytics">Analytics</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select
                value={form.watch('scope')}
                onValueChange={(v: any) => form.setValue('scope', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Handler */}
          <div className="space-y-1.5">
            <Label htmlFor="handler">Handler</Label>
            <Input
              id="handler"
              {...form.register('handler')}
              placeholder="e.g. edge:agent-execute, module:blog, db:bookings, webhook:n8n"
            />
            <p className="text-[11px] text-muted-foreground">
              Format: edge:name | module:name | db:table | webhook:name
            </p>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.watch('requires_approval')}
                onCheckedChange={(v) => form.setValue('requires_approval', v)}
              />
              Requires approval
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.watch('enabled')}
                onCheckedChange={(v) => form.setValue('enabled', v)}
              />
              Enabled
            </label>
          </div>

          {/* Tool definition JSON */}
          <div className="space-y-1.5">
            <Label>Tool Definition (JSON)</Label>
            <CodeEditor
              value={form.watch('tool_definition_json')}
              onChange={(v) => form.setValue('tool_definition_json', v)}
              placeholder='{"type":"function","function":{...}}'
              minHeight="200px"
            />
            {form.formState.errors.tool_definition_json && (
              <p className="text-xs text-destructive">
                {form.formState.errors.tool_definition_json.message}
              </p>
            )}
          </div>

          <SheetFooter className="flex gap-2 pt-2">
            {skill && onDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => { onDelete(skill.id); onClose(); }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
