import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CountdownBlockData } from '@/components/public/blocks/CountdownBlock';

interface CountdownBlockEditorProps {
  data: CountdownBlockData;
  onChange: (data: CountdownBlockData) => void;
  isEditing: boolean;
}

export function CountdownBlockEditor({ data, onChange, isEditing }: CountdownBlockEditorProps) {
  if (!isEditing) {
    const variant = data.variant || 'default';
    const size = data.size || 'md';
    const sizeClasses = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-xl' : 'text-3xl';
    const boxSize = size === 'lg' ? 'w-20 h-20' : size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';
    const labelSize = size === 'lg' ? 'text-xs' : 'text-[10px]';
    const units = [
      { value: 12, label: data.labels?.days || 'Days', show: data.showDays !== false },
      { value: 8, label: data.labels?.hours || 'Hours', show: data.showHours !== false },
      { value: 34, label: data.labels?.minutes || 'Minutes', show: data.showMinutes !== false },
      { value: 56, label: data.labels?.seconds || 'Seconds', show: data.showSeconds !== false },
    ].filter(u => u.show);

    return (
      <div className="py-6 text-center">
        {data.title && <h3 className="font-serif text-2xl font-bold mb-1">{data.title}</h3>}
        {data.subtitle && <p className="text-sm text-muted-foreground mb-4">{data.subtitle}</p>}
        <div className="flex items-center justify-center gap-3">
          {units.map((unit, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={cn(
                'flex flex-col items-center justify-center',
                variant === 'cards' && `${boxSize} rounded-xl border bg-card shadow-sm`,
                variant === 'hero' && `${boxSize} rounded-xl bg-primary text-primary-foreground`,
              )}>
                <span className={cn('font-bold tabular-nums', sizeClasses)}>
                  {String(unit.value).padStart(2, '0')}
                </span>
                {variant !== 'minimal' && (
                  <span className={cn(labelSize, 'text-muted-foreground uppercase tracking-wider',
                    variant === 'hero' && 'text-primary-foreground/70'
                  )}>{unit.label}</span>
                )}
              </div>
              {i < units.length - 1 && variant === 'minimal' && (
                <span className={cn('font-bold', sizeClasses)}>:</span>
              )}
            </div>
          ))}
        </div>
        {variant === 'minimal' && (
          <div className="flex justify-center gap-12 mt-1">
            {units.map((unit, i) => (
              <span key={i} className={cn(labelSize, 'text-muted-foreground uppercase tracking-wider')}>{unit.label}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="title">Rubrik (valfri)</Label>
          <Input
            id="title"
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Räkna ner till..."
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="subtitle">Underrubrik (valfri)</Label>
          <Input
            id="subtitle"
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="Beskrivning..."
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="targetDate">Måldatum och tid *</Label>
          <Input
            id="targetDate"
            type="datetime-local"
            value={data.targetDate ? data.targetDate.slice(0, 16) : ''}
            onChange={(e) =>
              onChange({ ...data, targetDate: new Date(e.target.value).toISOString() })
            }
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="expiredMessage">Meddelande när tiden gått ut</Label>
          <Input
            id="expiredMessage"
            value={data.expiredMessage || ''}
            onChange={(e) => onChange({ ...data, expiredMessage: e.target.value })}
            placeholder="Tiden har gått ut!"
          />
        </div>
      </div>

      {/* Style Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Variant</Label>
          <Select
            value={data.variant || 'default'}
            onValueChange={(value: 'default' | 'cards' | 'minimal' | 'hero') =>
              onChange({ ...data, variant: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Standard</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="hero">Hero</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Size</Label>
          <Select
            value={data.size || 'md'}
            onValueChange={(value: 'sm' | 'md' | 'lg') =>
              onChange({ ...data, size: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Liten</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Stor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Unit Toggles */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Visa enheter</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={data.showDays !== false}
              onCheckedChange={(checked) => onChange({ ...data, showDays: checked })}
            />
            <Label>Dagar</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={data.showHours !== false}
              onCheckedChange={(checked) => onChange({ ...data, showHours: checked })}
            />
            <Label>Timmar</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={data.showMinutes !== false}
              onCheckedChange={(checked) => onChange({ ...data, showMinutes: checked })}
            />
            <Label>Minuter</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={data.showSeconds !== false}
              onCheckedChange={(checked) => onChange({ ...data, showSeconds: checked })}
            />
            <Label>Sekunder</Label>
          </div>
        </div>
      </div>

      {/* Custom Labels */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Anpassa etiketter (valfritt)</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Dagar</Label>
            <Input
              value={data.labels?.days || ''}
              onChange={(e) =>
                onChange({
                  ...data,
                  labels: { ...data.labels, days: e.target.value },
                })
              }
              placeholder="Dagar"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Timmar</Label>
            <Input
              value={data.labels?.hours || ''}
              onChange={(e) =>
                onChange({
                  ...data,
                  labels: { ...data.labels, hours: e.target.value },
                })
              }
              placeholder="Timmar"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Minuter</Label>
            <Input
              value={data.labels?.minutes || ''}
              onChange={(e) =>
                onChange({
                  ...data,
                  labels: { ...data.labels, minutes: e.target.value },
                })
              }
              placeholder="Minuter"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Sekunder</Label>
            <Input
              value={data.labels?.seconds || ''}
              onChange={(e) =>
                onChange({
                  ...data,
                  labels: { ...data.labels, seconds: e.target.value },
                })
              }
              placeholder="Sekunder"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
