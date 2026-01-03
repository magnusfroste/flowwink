import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface BookingService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  is_active: boolean;
  color: string | null;
  sort_order: number | null;
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
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes: string | null;
  internal_notes: string | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
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
      toast({ title: 'Tjänst skapad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte skapa tjänst', variant: 'destructive' });
      console.error(error);
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
      toast({ title: 'Tjänst uppdaterad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte uppdatera tjänst', variant: 'destructive' });
      console.error(error);
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
      toast({ title: 'Tjänst raderad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte radera tjänst', variant: 'destructive' });
      console.error(error);
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
      toast({ title: 'Tillgänglighet tillagd' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte lägga till tillgänglighet', variant: 'destructive' });
      console.error(error);
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
      toast({ title: 'Tillgänglighet uppdaterad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte uppdatera tillgänglighet', variant: 'destructive' });
      console.error(error);
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
      toast({ title: 'Tillgänglighet raderad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte radera tillgänglighet', variant: 'destructive' });
      console.error(error);
    },
  });
}

// Bookings
export function useBookings(filters?: { status?: string; startDate?: Date; endDate?: Date }) {
  return useQuery({
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
    }) => {
      const { data, error } = await supabase
        .from('bookings')
        .insert(booking)
        .select()
        .single();
      if (error) throw error;

      // Trigger confirmation email
      try {
        await supabase.functions.invoke('send-booking-confirmation', {
          body: { bookingId: data.id },
        });
      } catch (e) {
        console.warn('Could not send confirmation email:', e);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: 'Bokning skapad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte skapa bokning', variant: 'destructive' });
      console.error(error);
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<{
      status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
      internal_notes: string | null;
      cancelled_at: string | null;
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
      toast({ title: 'Bokning uppdaterad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte uppdatera bokning', variant: 'destructive' });
      console.error(error);
    },
  });
}

export function useDeleteBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: 'Bokning raderad' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte radera bokning', variant: 'destructive' });
      console.error(error);
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
      toast({ title: 'Blockerat datum tillagt' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte lägga till blockerat datum', variant: 'destructive' });
      console.error(error);
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
      toast({ title: 'Blockerat datum borttaget' });
    },
    onError: (error) => {
      toast({ title: 'Kunde inte ta bort blockerat datum', variant: 'destructive' });
      console.error(error);
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
