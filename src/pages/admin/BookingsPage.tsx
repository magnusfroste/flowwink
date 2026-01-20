import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday, isSameMonth } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, User, Mail, Phone, Filter, LayoutGrid, List, Check, X, MoreHorizontal, Settings, CalendarClock } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { StatCard } from '@/components/admin/StatCard';
import { useBookings, useBookingServices, useUpdateBooking, useDeleteBooking, useBookingStats, type Booking } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CreateBookingDialog } from '@/components/admin/booking/CreateBookingDialog';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/10 text-warning dark:bg-warning/20',
  confirmed: 'bg-success/10 text-success dark:bg-success/20',
  cancelled: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  completed: 'bg-primary/10 text-primary dark:bg-primary/20',
};

export default function BookingsPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: bookings, isLoading } = useBookings({
    startDate: startOfWeek(monthStart, { weekStartsOn: 1 }),
    endDate: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });
  const { data: stats } = useBookingStats();
  const { data: services } = useBookingServices();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();

  const calendarDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthStart, monthEnd]);

  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    let filtered = bookings;
    if (statusFilter !== 'all') {
      filtered = filtered.filter((b) => b.status === statusFilter);
    }
    if (selectedDate) {
      filtered = filtered.filter((b) => isSameDay(new Date(b.start_time), selectedDate));
    }
    return filtered;
  }, [bookings, statusFilter, selectedDate]);

  const getBookingsForDate = (date: Date) => {
    return bookings?.filter((b) => isSameDay(new Date(b.start_time), date)) || [];
  };

  const handleStatusChange = async (booking: Booking, newStatus: string) => {
    await updateBooking.mutateAsync({
      id: booking.id,
      status: newStatus as Booking['status'],
      ...(newStatus === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}),
    });
    setSelectedBooking(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this booking?')) {
      await deleteBooking.mutateAsync(id);
      setSelectedBooking(null);
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
        title="Bookings"
        description="Manage bookings and view calendar overview"
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/bookings/services">
              <Settings className="h-4 w-4 mr-2" />
              Services
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/bookings/availability">
              <CalendarClock className="h-4 w-4 mr-2" />
              Availability
            </Link>
          </Button>
        </div>
      </AdminPageHeader>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="This Month"
          value={stats?.total || 0}
          icon={CalendarIcon}
          variant="default"
        />
        <StatCard
          label="Upcoming"
          value={stats?.upcoming || 0}
          icon={Clock}
          variant="success"
        />
        <StatCard
          label="Pending"
          value={stats?.pending || 0}
          icon={Clock}
          variant="warning"
        />
        <StatCard
          label="Cancelled"
          value={stats?.cancelled || 0}
          icon={X}
          variant="destructive"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[160px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Booking
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : viewMode === 'calendar' ? (
        <Card>
          <CardContent className="p-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dayBookings = getBookingsForDate(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={cn(
                      'min-h-[80px] p-2 text-left rounded-md border transition-colors',
                      !isSameMonth(day, currentMonth) && 'opacity-40',
                      isToday(day) && 'border-primary',
                      isSelected && 'bg-primary/10 border-primary',
                      !isSelected && 'hover:bg-muted/50'
                    )}
                  >
                    <div className={cn(
                      'text-sm font-medium mb-1',
                      isToday(day) && 'text-primary'
                    )}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayBookings.slice(0, 2).map((booking) => (
                        <div
                          key={booking.id}
                          className={cn(
                            'text-xs px-1.5 py-0.5 rounded truncate',
                            booking.service?.color ? `bg-opacity-20` : STATUS_COLORS[booking.status]
                          )}
                          style={booking.service?.color ? { 
                            backgroundColor: `${booking.service.color}20`,
                            color: booking.service.color 
                          } : undefined}
                        >
                          {format(new Date(booking.start_time), 'HH:mm')} {booking.customer_name.split(' ')[0]}
                        </div>
                      ))}
                      {dayBookings.length > 2 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayBookings.length - 2} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {filteredBookings.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No bookings to display
              </div>
            ) : (
              <div className="divide-y">
                {filteredBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="p-4 flex items-center gap-4 hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedBooking(booking)}
                  >
                    <div
                      className="w-1 h-12 rounded-full"
                      style={{ backgroundColor: booking.service?.color || '#3b82f6' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{booking.customer_name}</span>
                        <Badge className={STATUS_COLORS[booking.status]} variant="secondary">
                          {STATUS_LABELS[booking.status]}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          {format(new Date(booking.start_time), 'PPP')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(booking.start_time), 'HH:mm')} - {format(new Date(booking.end_time), 'HH:mm')}
                        </span>
                        {booking.service && (
                          <span>{booking.service.name}</span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleStatusChange(booking, 'confirmed')}>
                          <Check className="h-4 w-4 mr-2" />
                          Confirm
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(booking, 'completed')}>
                          Mark Completed
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleStatusChange(booking, 'cancelled')}
                          className="text-destructive"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected date bookings panel */}
      {selectedDate && viewMode === 'calendar' && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">
              {format(selectedDate, 'EEEE, MMMM d')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getBookingsForDate(selectedDate).length === 0 ? (
              <p className="text-muted-foreground">No bookings on this day</p>
            ) : (
              <div className="space-y-3">
                {getBookingsForDate(selectedDate).map((booking) => (
                  <div
                    key={booking.id}
                    onClick={() => setSelectedBooking(booking)}
                    className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {format(new Date(booking.start_time), 'HH:mm')} - {format(new Date(booking.end_time), 'HH:mm')}
                        </span>
                      </div>
                      <Badge className={STATUS_COLORS[booking.status]} variant="secondary">
                        {STATUS_LABELS[booking.status]}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {booking.customer_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {booking.customer_email}
                      </span>
                      {booking.customer_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {booking.customer_phone}
                        </span>
                      )}
                    </div>
                    {booking.service && (
                      <div className="mt-2">
                        <Badge variant="outline">{booking.service.name}</Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Booking detail dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Booking Details</DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Customer</Label>
                  <p className="font-medium">{selectedBooking.customer_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Select
                    value={selectedBooking.status}
                    onValueChange={(v) => handleStatusChange(selectedBooking, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p>{selectedBooking.customer_email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p>{selectedBooking.customer_phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p>{format(new Date(selectedBooking.start_time), 'PPP')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Time</Label>
                  <p>
                    {format(new Date(selectedBooking.start_time), 'HH:mm')} - {format(new Date(selectedBooking.end_time), 'HH:mm')}
                  </p>
                </div>
                {selectedBooking.service && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Service</Label>
                    <p>{selectedBooking.service.name}</p>
                  </div>
                )}
              </div>
              {selectedBooking.notes && (
                <div>
                  <Label className="text-muted-foreground">Customer Notes</Label>
                  <p className="text-sm">{selectedBooking.notes}</p>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground">Internal Notes</Label>
                <Textarea
                  placeholder="Add internal notes..."
                  defaultValue={selectedBooking.internal_notes || ''}
                  onBlur={(e) => {
                    if (e.target.value !== selectedBooking.internal_notes) {
                      updateBooking.mutate({
                        id: selectedBooking.id,
                        internal_notes: e.target.value,
                      });
                    }
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => selectedBooking && handleDelete(selectedBooking.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create booking dialog */}
      <CreateBookingDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        services={services || []}
        initialDate={selectedDate}
      />
      </AdminPageContainer>
    </AdminLayout>
  );
}
