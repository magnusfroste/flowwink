import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoBoxBlockData } from '@/types/cms';
import { Info, CheckCircle, AlertTriangle, Sparkles, icons } from 'lucide-react';

const VARIANT_CONFIG = {
  info: {
    label: 'Information',
    icon: Info,
    className: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-100',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  success: {
    label: 'Framgång',
    icon: CheckCircle,
    className: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-950/50 dark:border-green-800 dark:text-green-100',
    iconClass: 'text-green-600 dark:text-green-400',
  },
  warning: {
    label: 'Varning',
    icon: AlertTriangle,
    className: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-100',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  highlight: {
    label: 'Framhävd',
    icon: Sparkles,
    className: 'bg-primary/5 border-primary/20 text-foreground',
    iconClass: 'text-primary',
  },
};

const ICON_OPTIONS = [
  'Info', 'CheckCircle', 'AlertTriangle', 'Sparkles', 'Heart', 'Phone',
  'Calendar', 'Clock', 'MapPin', 'Mail', 'FileText', 'Users', 'Star', 'Bell'
];

interface InfoBoxBlockEditorProps {
  data: InfoBoxBlockData;
  isEditing: boolean;
  onChange: (data: InfoBoxBlockData) => void;
}

export function InfoBoxBlockEditor({ data, isEditing, onChange }: InfoBoxBlockEditorProps) {
  const variant = data.variant || 'info';
  const config = VARIANT_CONFIG[variant];

  const renderIcon = () => {
    if (data.icon) {
      const LucideIcon = icons[data.icon as keyof typeof icons];
      if (LucideIcon && typeof LucideIcon === 'function') {
        return <LucideIcon className={`h-6 w-6 ${config.iconClass}`} />;
      }
    }
    const DefaultIcon = config.icon;
    return <DefaultIcon className={`h-6 w-6 ${config.iconClass}`} />;
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Variant</Label>
            <Select 
              value={variant} 
              onValueChange={(v) => onChange({ ...data, variant: v as InfoBoxBlockData['variant'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VARIANT_CONFIG).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ikon (valfritt)</Label>
            <Select 
              value={data.icon || ''} 
              onValueChange={(v) => onChange({ ...data, icon: v || undefined })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Standardikon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Standardikon</SelectItem>
                {ICON_OPTIONS.map((icon) => {
                  const LucideIcon = icons[icon as keyof typeof icons];
                  return (
                    <SelectItem key={icon} value={icon}>
                      <div className="flex items-center gap-2">
                        {LucideIcon && typeof LucideIcon === 'function' && (
                          <LucideIcon className="h-4 w-4" />
                        )}
                        <span>{icon}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Rubrik</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Viktig information"
          />
        </div>

        <div>
          <Label>Innehåll</Label>
          <Textarea
            value={data.content || ''}
            onChange={(e) => onChange({ ...data, content: e.target.value })}
            placeholder="Skriv ditt meddelande här..."
            rows={4}
          />
        </div>

        <div className={`border rounded-lg p-4 ${config.className}`}>
          <div className="flex gap-3">
            {renderIcon()}
            <div>
              <h4 className="font-semibold">{data.title || 'Rubrik'}</h4>
              <p className="text-sm mt-1 opacity-90">{data.content || 'Innehåll...'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Preview mode
  return (
    <div className={`border rounded-lg p-6 m-4 ${config.className}`}>
      <div className="flex gap-4">
        {renderIcon()}
        <div>
          <h4 className="font-semibold text-lg">{data.title || 'Viktig information'}</h4>
          <p className="mt-2 opacity-90">{data.content || 'Inget innehåll'}</p>
        </div>
      </div>
    </div>
  );
}
