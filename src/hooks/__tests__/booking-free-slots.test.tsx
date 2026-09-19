import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAvailableSlots, useBookingFreeSlots } from '../useBookings';

/**
 * The booking widget's free times come from ONE reader, the database function
 * booking_free_slots. The hook used to read `bookings` in the browser — which
 * an anonymous visitor may not — and rebuilt the start time from "HH:MM" in the
 * visitor's own timezone. It now asks the function and hands the exact instant on.
 */

const rpc = vi.fn();
const from = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args), from: (...args: unknown[]) => from(...args) },
}));

function Probe({ date, serviceId }: { date: string; serviceId: string }) {
  const free = useBookingFreeSlots(date, serviceId);
  const times = useAvailableSlots(date, serviceId);
  if (free.isLoading) return <p>loading</p>;
  if (free.error) return <p>error: {(free.error as Error).message}</p>;
  return (
    <div>
      <p data-testid="times">{(times.data ?? []).join(',')}</p>
      <p data-testid="instants">{(free.data?.slots ?? []).map((s) => s.starts_at).join(',')}</p>
      <p data-testid="places">{(free.data?.slots ?? []).map((s) => s.places_left).join(',')}</p>
      <p data-testid="capacity">{free.data?.capacity}</p>
    </div>
  );
}

function show(date = '2026-10-06', serviceId = 'svc-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Probe date={date} serviceId={serviceId} /></QueryClientProvider>);
}

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('free times in the booking widget', () => {
  it('asks the one reader — and never reads the bookings table itself', async () => {
    rpc.mockResolvedValue({ data: { success: true, timezone: 'Europe/Stockholm', capacity: 2, slots: [
      { time: '09:00', starts_at: '2026-10-06T07:00:00+00:00', places_left: 2 },
      { time: '10:00', starts_at: '2026-10-06T08:00:00+00:00', places_left: 1 },
    ] }, error: null });
    show();
    expect(await screen.findByTestId('times')).toHaveTextContent('09:00,10:00');
    expect(rpc).toHaveBeenCalledWith('booking_free_slots', { p_service_id: 'svc-1', p_date: '2026-10-06' });
    expect(from).not.toHaveBeenCalled();
  });

  it('hands on the exact instant of each slot, and the places left in a class', async () => {
    rpc.mockResolvedValue({ data: { success: true, timezone: 'Europe/Stockholm', capacity: 2, slots: [
      { time: '09:00', starts_at: '2026-10-06T07:00:00+00:00', places_left: 2 },
    ] }, error: null });
    show();
    // 09:00 in Stockholm is 07:00 UTC — whatever timezone the visitor's browser is in.
    expect(await screen.findByTestId('instants')).toHaveTextContent('2026-10-06T07:00:00+00:00');
    expect(screen.getByTestId('places')).toHaveTextContent('2');
    expect(screen.getByTestId('capacity')).toHaveTextContent('2');
  });

  it('says why when the reader refuses, instead of showing an empty day', async () => {
    rpc.mockResolvedValue({ data: { success: false, error: 'Service not found or not active' }, error: null });
    show();
    expect(await screen.findByText(/Service not found or not active/)).toBeInTheDocument();
  });
});
