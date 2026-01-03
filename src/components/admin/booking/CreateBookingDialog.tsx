import { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { useCreateBooking, type BookingService } from '@/hooks/useBookings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: BookingService[];
  initialDate?: Date | null;
}

export function CreateBookingDialog({ open, onOpenChange, services, initialDate }: CreateBookingDialogProps) {
  const createBooking = useCreateBooking();
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    service_id: '',
    date: initialDate || new Date(),
    start_time: '09:00',
    notes: '',
  });

  const selectedService = services.find((s) => s.id === formData.service_id);
  const duration = selectedService?.duration_minutes || 60;

  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const startDateTime = new Date(formData.date);
    const [startHours, startMinutes] = formData.start_time.split(':').map(Number);
    startDateTime.setHours(startHours, startMinutes, 0, 0);

    const endTime = calculateEndTime(formData.start_time, duration);
    const endDateTime = new Date(formData.date);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    endDateTime.setHours(endHours, endMinutes, 0, 0);

    await createBooking.mutateAsync({
      customer_name: formData.customer_name,
      customer_email: formData.customer_email,
      customer_phone: formData.customer_phone || null,
      service_id: formData.service_id || null,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      notes: formData.notes || null,
      status: 'confirmed',
    });

    onOpenChange(false);
    setFormData({
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      service_id: '',
      date: new Date(),
      start_time: '09:00',
      notes: '',
    });
  };

  const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour = Math.floor(i / 2) + 8;
    const minute = (i % 2) * 30;
    if (hour >= 20) return null;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }).filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny bokning</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Namn *</Label>
            <Input
              id="customer_name"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_email">E-post *</Label>
            <Input
              id="customer_email"
              type="email"
              value={formData.customer_email}
              onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_phone">Telefon</Label>
            <Input
              id="customer_phone"
              type="tel"
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
            />
          </div>

          {services.length > 0 && (
            <div className="space-y-2">
              <Label>Tjänst</Label>
              <Select
                value={formData.service_id}
                onValueChange={(v) => setFormData({ ...formData, service_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj tjänst" />
                </SelectTrigger>
                <SelectContent>
                  {services.filter((s) => s.is_active).map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} ({service.duration_minutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Datum *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !formData.date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? format(formData.date, 'PPP', { locale: sv }) : 'Välj datum'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={(date) => date && setFormData({ ...formData, date })}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Starttid *</Label>
              <Select
                value={formData.start_time}
                onValueChange={(v) => setFormData({ ...formData, start_time: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedService && (
            <p className="text-sm text-muted-foreground">
              Sluttid: {calculateEndTime(formData.start_time, duration)} ({duration} minuter)
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Anteckningar</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Valfria anteckningar..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={createBooking.isPending}>
              {createBooking.isPending ? 'Skapar...' : 'Skapa bokning'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
