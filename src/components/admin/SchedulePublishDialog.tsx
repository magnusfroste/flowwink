import { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SchedulePublishDialogProps {
  scheduledAt: string | null;
  onSchedule: (date: Date | null) => void;
  disabled?: boolean;
}

export function SchedulePublishDialog({ 
  scheduledAt, 
  onSchedule, 
  disabled 
}: SchedulePublishDialogProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(
    scheduledAt ? new Date(scheduledAt) : undefined
  );
  const [hour, setHour] = useState<string>(
    scheduledAt ? format(new Date(scheduledAt), 'HH') : '09'
  );
  const [minute, setMinute] = useState<string>(
    scheduledAt ? format(new Date(scheduledAt), 'mm') : '00'
  );

  const handleSchedule = () => {
    if (date) {
      const scheduled = new Date(date);
      scheduled.setHours(parseInt(hour), parseInt(minute), 0, 0);
      onSchedule(scheduled);
      setOpen(false);
    }
  };

  const handleClear = () => {
    onSchedule(null);
    setDate(undefined);
    setOpen(false);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Clock className="h-4 w-4 mr-2" />
          {scheduledAt 
            ? format(new Date(scheduledAt), 'd MMM HH:mm', { locale: sv })
            : 'Schemalägg'
          }
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-serif">Schemalägg publicering</DialogTitle>
          <DialogDescription>
            Välj datum och tid för automatisk publicering. Sidan måste skickas för granskning först.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Datum</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP', { locale: sv }) : 'Välj datum'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date()}
                  initialFocus
                  className="p-3 pointer-events-auto"
                  locale={sv}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tid</label>
            <div className="flex gap-2">
              <Select value={hour} onValueChange={setHour}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Timme" />
                </SelectTrigger>
                <SelectContent>
                  {hours.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="flex items-center text-lg">:</span>
              <Select value={minute} onValueChange={setMinute}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Minut" />
                </SelectTrigger>
                <SelectContent>
                  {minutes.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {scheduledAt && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-2" />
              Ta bort schemaläggning
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSchedule} disabled={!date}>
            {scheduledAt ? 'Uppdatera' : 'Schemalägg'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}