import { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Plus, Trash2, CalendarOff } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  useAvailability,
  useCreateAvailability,
  useDeleteAvailability,
  useBlockedDates,
  useCreateBlockedDate,
  useDeleteBlockedDate,
  useBookingServices,
  type BookingAvailability,
} from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';

const WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const WEEKDAYS_SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

export default function BookingAvailabilityPage() {
  const { data: availability, isLoading: loadingAvailability } = useAvailability();
  const { data: blockedDates, isLoading: loadingBlocked } = useBlockedDates();
  const { data: services } = useBookingServices();
  const createAvailability = useCreateAvailability();
  const deleteAvailability = useDeleteAvailability();
  const createBlockedDate = useCreateBlockedDate();
  const deleteBlockedDate = useDeleteBlockedDate();

  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);
  const [selectedBlockedDate, setSelectedBlockedDate] = useState<Date | undefined>(undefined);
  const [blockedReason, setBlockedReason] = useState('');

  const [availabilityForm, setAvailabilityForm] = useState({
    day_of_week: 1,
    start_time: '09:00',
    end_time: '17:00',
    service_id: '',
  });

  // Group availability by day
  const availabilityByDay = WEEKDAYS.map((day, index) => ({
    day,
    dayIndex: index,
    slots: availability?.filter((a) => a.day_of_week === index) || [],
  }));

  const handleCreateAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAvailability.mutateAsync({
      day_of_week: availabilityForm.day_of_week,
      start_time: availabilityForm.start_time,
      end_time: availabilityForm.end_time,
      service_id: availabilityForm.service_id || null,
      is_active: true,
    });
    setAvailabilityDialogOpen(false);
  };

  const handleCreateBlockedDate = async () => {
    if (!selectedBlockedDate) return;
    await createBlockedDate.mutateAsync({
      date: format(selectedBlockedDate, 'yyyy-MM-dd'),
      reason: blockedReason || null,
      is_all_day: true,
    });
    setBlockedDialogOpen(false);
    setSelectedBlockedDate(undefined);
    setBlockedReason('');
  };

  const timeSlots = Array.from({ length: 28 }, (_, i) => {
    const hour = Math.floor(i / 2) + 6;
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  });

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Tillgänglighet"
        description="Ställ in öppettider och blockera datum"
      />

      <Tabs defaultValue="weekly" className="space-y-6">
        <TabsList>
          <TabsTrigger value="weekly">Veckoschema</TabsTrigger>
          <TabsTrigger value="blocked">Blockerade datum</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAvailabilityDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till tid
            </Button>
          </div>

          {loadingAvailability ? (
            <div className="grid gap-4 md:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-7">
              {availabilityByDay.map(({ day, dayIndex, slots }) => (
                <Card key={dayIndex} className={slots.length === 0 ? 'opacity-50' : ''}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{day}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {slots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Stängd</p>
                    ) : (
                      slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1"
                        >
                          <span>
                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => deleteAvailability.mutate(slot.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="blocked" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setBlockedDialogOpen(true)}>
              <CalendarOff className="h-4 w-4 mr-2" />
              Blockera datum
            </Button>
          </div>

          {loadingBlocked ? (
            <Skeleton className="h-48" />
          ) : blockedDates?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Inga blockerade datum
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {blockedDates?.map((blocked) => (
                <Card key={blocked.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {format(new Date(blocked.date), 'EEEE d MMMM yyyy', { locale: sv })}
                      </p>
                      {blocked.reason && (
                        <p className="text-sm text-muted-foreground">{blocked.reason}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteBlockedDate.mutate(blocked.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Availability Dialog */}
      <Dialog open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till öppettid</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAvailability} className="space-y-4">
            <div className="space-y-2">
              <Label>Veckodag</Label>
              <Select
                value={availabilityForm.day_of_week.toString()}
                onValueChange={(v) =>
                  setAvailabilityForm({ ...availabilityForm, day_of_week: parseInt(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starttid</Label>
                <Select
                  value={availabilityForm.start_time}
                  onValueChange={(v) =>
                    setAvailabilityForm({ ...availabilityForm, start_time: v })
                  }
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

              <div className="space-y-2">
                <Label>Sluttid</Label>
                <Select
                  value={availabilityForm.end_time}
                  onValueChange={(v) =>
                    setAvailabilityForm({ ...availabilityForm, end_time: v })
                  }
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

            {services && services.length > 0 && (
              <div className="space-y-2">
                <Label>Tjänst (valfritt)</Label>
                <Select
                  value={availabilityForm.service_id}
                  onValueChange={(v) =>
                    setAvailabilityForm({ ...availabilityForm, service_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Alla tjänster" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Alla tjänster</SelectItem>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAvailabilityDialogOpen(false)}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={createAvailability.isPending}>
                Lägg till
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Block Date Dialog */}
      <Dialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blockera datum</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedBlockedDate}
                onSelect={setSelectedBlockedDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                className="rounded-md border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Anledning (valfritt)</Label>
              <Input
                id="reason"
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value)}
                placeholder="T.ex. Semester, Helgdag..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBlockedDialogOpen(false)}
              >
                Avbryt
              </Button>
              <Button
                onClick={handleCreateBlockedDate}
                disabled={!selectedBlockedDate || createBlockedDate.isPending}
              >
                Blockera
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
