import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, Brain, FileText, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AutonomyScheduleSettings } from '@/hooks/useSiteSettings';
import { useBusinessClock } from '@/hooks/useBusinessClock';

const HEARTBEAT_OPTIONS = [
  { value: '0,12', label: 'Twice daily (00:00 & 12:00)', hours: [0, 12] },
  { value: '0,8,16', label: 'Three times daily (00:00, 08:00 & 16:00)', hours: [0, 8, 16] },
  { value: '0,6,12,18', label: 'Every 6 hours', hours: [0, 6, 12, 18] },
  { value: '8', label: 'Once daily (08:00)', hours: [8] },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, '0')}:00`,
}));

interface Props {
  data: AutonomyScheduleSettings;
  onChange: (data: AutonomyScheduleSettings) => void;
}

export function AutonomyScheduleTab({ data, onChange }: Props) {
  const clock = useBusinessClock();
  const heartbeatKey = data.heartbeatHours.join(',');

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          All times are shown in your selected timezone. The system automatically converts to UTC for scheduling. 
          Changes take effect after saving.
        </AlertDescription>
      </Alert>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timezone
          </CardTitle>
          <CardDescription>
            All schedule times below are on the business's clock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* One clock for the business: the schedule follows the time zone set
              under Site settings → Where the business is (docs/architecture/
              locale-and-formatting.md). A second zone here ran FlowPilot on
              Stockholm time for businesses elsewhere. */}
          <p className="text-sm">
            <span className="font-medium">{clock.timeZone}</span>{' '}
            <span className="text-muted-foreground">
              — the business's time zone. Change it in Site settings → Where the business is.
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Heartbeat */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-serif flex items-center gap-2">
                <Zap className="h-5 w-5" />
                FlowPilot Heartbeat
              </CardTitle>
              <CardDescription>
                The autonomous loop that decomposes objectives, advances plans, and executes due automations.
              </CardDescription>
            </div>
            <Switch
              checked={data.heartbeatEnabled}
              onCheckedChange={(v) => onChange({ ...data, heartbeatEnabled: v })}
            />
          </div>
        </CardHeader>
        {data.heartbeatEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={heartbeatKey}
                onValueChange={(v) => {
                  const opt = HEARTBEAT_OPTIONS.find((o) => o.value === v);
                  if (opt) onChange({ ...data, heartbeatHours: opt.hours });
                }}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEARTBEAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap">
              {data.heartbeatHours.map((h) => (
                <Badge key={h} variant="secondary">{String(h).padStart(2, '0')}:00 local</Badge>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Morning Briefing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-serif flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Morning Briefing
              </CardTitle>
              <CardDescription>
                Daily business health report delivered via email and in-app notification.
              </CardDescription>
            </div>
            <Switch
              checked={data.briefingEnabled}
              onCheckedChange={(v) => onChange({ ...data, briefingEnabled: v })}
            />
          </div>
        </CardHeader>
        {data.briefingEnabled && (
          <CardContent>
            <div className="space-y-2">
              <Label>Delivery time</Label>
              <Select
                value={String(data.briefingHour)}
                onValueChange={(v) => onChange({ ...data, briefingHour: parseInt(v, 10) })}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Learning Loop */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-serif flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Nightly Learning
              </CardTitle>
              <CardDescription>
                FlowPilot analyzes patterns, distills insights, and evolves its memory overnight.
              </CardDescription>
            </div>
            <Switch
              checked={data.learnEnabled}
              onCheckedChange={(v) => onChange({ ...data, learnEnabled: v })}
            />
          </div>
        </CardHeader>
        {data.learnEnabled && (
          <CardContent>
            <div className="space-y-2">
              <Label>Run time</Label>
              <Select
                value={String(data.learnHour)}
                onValueChange={(v) => onChange({ ...data, learnHour: parseInt(v, 10) })}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
