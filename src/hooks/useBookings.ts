import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface BookingService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  /** Minutes kept free before / after each booking; both count as taken in booking_free_slots. */
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  /** How many may book the same time: 1 for an appointment, more for a class. */
  capacity?: number;
  price_cents: number;
  currency: string;
  is_active: boolean;
  color: string | null;
  sort_order: number | null;
  product_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface BookingAvailability {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  service_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  service_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  notes: string | null;
  internal_notes: string | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  assigned_employee_id: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  service?: BookingService;
}

export interface BlockedDate {
  id: string;
  date: string;
  reason: string | null;
  is_all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  created_by: string | null;
}

// Services
export function useBookingServices() {
  return useQuery({
    queryKey: ['booking-services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_services')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as BookingService[];
    },
  });
}

export function useActiveBookingServices() {
  return useQuery({
    queryKey: ['booking-services', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as BookingService[];
    },
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (service: Partial<Omit<BookingService, 'id' | 'created_at' | 'updated_at' | 'created_by'>> & { name: string }) => {
      const { data, error } = await supabase
        .from('booking_services')
        .insert(service)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-services'] });
      toast({ title: 'Service created' });
    },
    onError: (error) => {
      toast({ title: 'Could not create service', variant: 'destructive' });
      logger.error(error);
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BookingService> & { id: string }) => {
      const { data, error } = await supabase
        .from('booking_services')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-services'] });
      toast({ title: 'Service updated' });
    },
    onError: (error) => {
      toast({ title: 'Could not update service', variant: 'destructive' });
      logger.error(error);
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('booking_services').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-services'] });
      toast({ title: 'Service deleted' });
    },
    onError: (error) => {
      toast({ title: 'Could not delete service', variant: 'destructive' });
      logger.error(error);
    },
  });
}

// Availability
export function useAvailability() {
  return useQuery({
    queryKey: ['booking-availability'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_availability')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data as BookingAvailability[];
    },
  });
}

export function useCreateAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (availability: Omit<BookingAvailability, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('booking_availability')
        .insert(availability)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-availability'] });
      toast({ title: 'Availability added' });
    },
    onError: (error) => {
      toast({ title: 'Could not add availability', variant: 'destructive' });
      logger.error(error);
    },
  });
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BookingAvailability> & { id: string }) => {
      const { data, error } = await supabase
        .from('booking_availability')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-availability'] });
      toast({ title: 'Availability updated' });
    },
    onError: (error) => {
      toast({ title: 'Could not update availability', variant: 'destructive' });
      logger.error(error);
    },
  });
}

export function useDeleteAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('booking_availability').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-availability'] });
      toast({ title: 'Availability deleted' });
    },
    onError: (error) => {
      toast({ title: 'Could not delete availability', variant: 'destructive' });
      logger.error(error);
    },
  });
}

// Bookings
export function useBookings(filters?: { status?: string; startDate?: Date; endDate?: Date }) {
  return useQuery({
    refetchInterval: 30_000,
    queryKey: ['bookings', filters],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          *,
          service:booking_services(*)
        `)
        .order('start_time', { ascending: true });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.startDate) {
        query = query.gte('start_time', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('start_time', filters.endDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Booking[];
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (booking: {
      customer_name: string;
      customer_email: string;
      customer_phone?: string | null;
      service_id?: string | null;
      start_time: string;
      end_time: string;
      notes?: string | null;
      status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
      assigned_employee_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('bookings')
        .insert(booking)
        .select()
        .single();
      if (error) throw error;

      // Trigger confirmation email
      try {
        await supabase.functions.invoke('comms-send', { body: { kind: 'booking_confirmation',  bookingId: data.id },
        });
      } catch (e) {
        logger.warn('Could not send confirmation email:', e);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: 'Booking created' });
    },
    onError: (error) => {
      toast({ title: 'Could not create booking', variant: 'destructive' });
      logger.error(error);
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<{
      status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
      internal_notes: string | null;
      cancelled_at: string | null;
      assigned_employee_id: string | null;
    }>) => {
      const { data, error } = await supabase
        .from('bookings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: 'Booking updated' });
    },
    onError: (error) => {
      toast({ title: 'Could not update booking', variant: 'destructive' });
      logger.error(error);
    },
  });
}

export function useDeleteBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // RLS-denied deletes return success with 0 rows — count them or lie.
      const { data, error } = await supabase.from('bookings').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was deleted — you may not have permission, or it is already gone.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: 'Booking deleted' });
    },
    onError: (error) => {
      toast({ title: 'Could not delete booking', variant: 'destructive' });
      logger.error(error);
    },
  });
}

// Blocked Dates
export function useBlockedDates() {
  return useQuery({
    queryKey: ['blocked-dates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_blocked_dates')
        .select('*')
        .order('date', { ascending: true });
      if (error) throw error;
      return data as BlockedDate[];
    },
  });
}

export function useCreateBlockedDate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (blockedDate: { date: string; reason?: string | null; is_all_day: boolean }) => {
      const { data, error } = await supabase
        .from('booking_blocked_dates')
        .insert(blockedDate)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-dates'] });
      toast({ title: 'Blocked date added' });
    },
    onError: (error) => {
      toast({ title: 'Could not add blocked date', variant: 'destructive' });
      logger.error(error);
    },
  });
}

export function useDeleteBlockedDate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('booking_blocked_dates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-dates'] });
      toast({ title: 'Blocked date removed' });
    },
    onError: (error) => {
      toast({ title: 'Could not remove blocked date', variant: 'destructive' });
      logger.error(error);
    },
  });
}

// Booking stats
export function useBookingStats() {
  return useQuery({
    queryKey: ['booking-stats'],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('status, start_time')
        .gte('start_time', startOfMonth.toISOString())
        .lte('start_time', endOfMonth.toISOString());

      if (error) throw error;

      const stats = {
        total: bookings?.length || 0,
        pending: bookings?.filter((b) => b.status === 'pending').length || 0,
        confirmed: bookings?.filter((b) => b.status === 'confirmed').length || 0,
        completed: bookings?.filter((b) => b.status === 'completed').length || 0,
        cancelled: bookings?.filter((b) => b.status === 'cancelled').length || 0,
        upcoming: bookings?.filter(
          (b) => new Date(b.start_time) > now && b.status !== 'cancelled'
        ).length || 0,
      };

      return stats;
    },
  });
}

// Available slots for smart booking
export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface FreeSlot {
  /** Wall-clock time in the PLATFORM timezone, "HH:MM" — what the visitor reads. */
  time: string;
  /** The exact instant. Send THIS to request_booking: building a Date from `time` in the
   *  browser books the visitor's own timezone, not the business's. */
  starts_at: string;
  /** Places left at this time (1 for an ordinary service, more for a class). */
  places_left: number;
}

export interface FreeSlotsAnswer {
  slots: FreeSlot[];
  timezone: string | null;
  capacity: number;
}

/**
 * Free times for a service and day. ONE reader: the database function
 * booking_free_slots, which applies exactly what the table's booking_rules
 * refuses — opening hours, blocked days, the platform timezone, the past,
 * buffers and capacity. This hook used to compute slots in the browser by
 * reading `bookings`; an anonymous visitor may not read that table, so the
 * widget saw no bookings at all and offered every taken time.
 */
export function useBookingFreeSlots(date: string | null, serviceId: string | null) {
  return useQuery({
    queryKey: ['booking-free-slots', date, serviceId],
    enabled: !!date,
    queryFn: async (): Promise<FreeSlotsAnswer> => {
      if (!date) return { slots: [], timezone: null, capacity: 1 };
      const { data, error } = await supabase.rpc('booking_free_slots' as never, {
        p_service_id: serviceId, p_date: date,
      } as never);
      if (error) throw error;
      const answer = (data ?? {}) as { success?: boolean; error?: string; slots?: FreeSlot[]; timezone?: string; capacity?: number };
      if (answer.success === false) throw new Error(answer.error ?? 'Could not read free times');
      return { slots: answer.slots ?? [], timezone: answer.timezone ?? null, capacity: answer.capacity ?? 1 };
    },
  });
}

/** Free times as "HH:MM" strings — kept for callers that only list them. */
export function useAvailableSlots(date: string | null, serviceId: string | null) {
  const query = useBookingFreeSlots(date, serviceId);
  return { ...query, data: query.data?.slots.map((s) => s.time) };
}
