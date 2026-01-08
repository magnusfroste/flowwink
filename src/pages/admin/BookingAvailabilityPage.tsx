import { useState } from 'react';
import { format } from 'date-fns';
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

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
        title="Availability"
        description="Set opening hours and block dates"
      />

      <Tabs defaultValue="weekly" className="space-y-6">
        <TabsList>
          <TabsTrigger value="weekly">Weekly Schedule</TabsTrigger>
          <TabsTrigger value="blocked">Blocked Dates</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAvailabilityDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Time Slot
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
                      <p className="text-xs text-muted-foreground">Closed</p>
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
              Block Date
            </Button>
          </div>

          {loadingBlocked ? (
            <Skeleton className="h-48" />
          ) : blockedDates?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No blocked dates
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {blockedDates?.map((blocked) => (
                <Card key={blocked.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {format(new Date(blocked.date), 'EEEE, MMMM d, yyyy')}
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
            <DialogTitle>Add Time Slot</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAvailability} className="space-y-4">
            <div className="space-y-2">
              <Label>Weekday</Label>
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
                <Label>Start Time</Label>
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
                <Label>End Time</Label>
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
                <Label>Service (optional)</Label>
                <Select
                  value={availabilityForm.service_id}
                  onValueChange={(v) =>
                    setAvailabilityForm({ ...availabilityForm, service_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All services</SelectItem>
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
                Cancel
              </Button>
              <Button type="submit" disabled={createAvailability.isPending}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Block Date Dialog */}
      <Dialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Date</DialogTitle>
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
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value)}
                placeholder="e.g., Vacation, Holiday..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBlockedDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateBlockedDate}
                disabled={!selectedBlockedDate || createBlockedDate.isPending}
              >
                Block
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
