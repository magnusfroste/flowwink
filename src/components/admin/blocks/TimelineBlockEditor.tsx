import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, GitBranch } from "lucide-react";
import { IconPicker } from "../IconPicker";

interface TimelineStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  date?: string;
}

interface TimelineBlockData {
  title?: string;
  subtitle?: string;
  steps?: TimelineStep[];
  variant?: 'vertical' | 'horizontal' | 'alternating';
  showDates?: boolean;
}

interface TimelineBlockEditorProps {
  data: Partial<TimelineBlockData>;
  onChange: (data: TimelineBlockData) => void;
  isEditing?: boolean;
}

export function TimelineBlockEditor({ data, onChange, isEditing }: TimelineBlockEditorProps) {
  const steps = data.steps || [];
  const variant = data.variant || 'vertical';

  // Preview mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || "Timeline"}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {steps.length} step{steps.length !== 1 ? 's' : ''} • {variant} layout
        </p>
        {steps.length > 0 && (
          <div className="mt-4 flex justify-center gap-2">
            {steps.slice(0, 4).map((step, i) => (
              <div key={step.id} className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                {i + 1}
              </div>
            ))}
            {steps.length > 4 && (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs">
                +{steps.length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const addStep = () => {
    const newStep: TimelineStep = {
      id: crypto.randomUUID(),
      icon: 'Circle',
      title: 'New Step',
      description: 'Step description',
      date: '',
    };
    onChange({ ...data, steps: [...steps, newStep] });
  };

  const updateStep = (index: number, updates: Partial<TimelineStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    onChange({ ...data, steps: newSteps });
  };

  const removeStep = (index: number) => {
    onChange({ ...data, steps: steps.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label>Section Title (optional)</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Our Process"
          />
        </div>

        <div>
          <Label>Subtitle (optional)</Label>
          <Input
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="How we deliver results"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Layout Variant</Label>
            <Select value={variant} onValueChange={(v) => onChange({ ...data, variant: v as TimelineBlockData['variant'] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vertical">Vertical</SelectItem>
                <SelectItem value="horizontal">Horizontal</SelectItem>
                <SelectItem value="alternating">Alternating</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.showDates ?? false}
                onChange={(e) => onChange({ ...data, showDates: e.target.checked })}
                className="rounded"
              />
              Show Dates
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Timeline Steps</Label>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-4 w-4 mr-1" />
            Add Step
          </Button>
        </div>

        {steps.map((step, index) => (
          <div key={step.id} className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                Step {index + 1}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeStep(index)}
                disabled={steps.length <= 1}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Icon</Label>
                <IconPicker
                  value={step.icon}
                  onChange={(icon) => updateStep(index, { icon })}
                />
              </div>
              {data.showDates && (
                <div>
                  <Label className="text-xs">Date/Label</Label>
                  <Input
                    value={step.date || ''}
                    onChange={(e) => updateStep(index, { date: e.target.value })}
                    placeholder="2024 or Step 1"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={step.title}
                onChange={(e) => updateStep(index, { title: e.target.value })}
                placeholder="Step title"
              />
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={step.description}
                onChange={(e) => updateStep(index, { description: e.target.value })}
                placeholder="Describe this step..."
                rows={2}
              />
            </div>
          </div>
        ))}

        {steps.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            No steps yet. Add your first step to get started.
          </div>
        )}
      </div>
    </div>
  );
}
