import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { UsageDialog } from '../UsageDialog';
import { CohortRetentionCard } from '../CohortRetentionCard';
import type { Subscription } from '@/hooks/useSubscriptions';

/**
 * The admin surface of two capabilities added 2026-09-19: usage-based billing
 * and cohort retention. The numbers come from the database functions (the
 * process battery holds those); what is tested here is that the screen says
 * what the function answered — and says nothing where the function said nothing.
 */

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function show(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const sub = { id: 'sub-1', customer_name: 'Acme', customer_email: 'a@acme.test', currency: 'SEK', quantity: 1, unit_amount_cents: 100_000 } as unknown as Subscription;

beforeEach(() => rpc.mockReset());

describe('usage on a subscription', () => {
  it('shows each meter with what is unbilled and what the next invoice will carry', async () => {
    rpc.mockResolvedValue({ data: { success: true, meters: [{ metric: 'api_calls', unit_label: 'calls', unit_amount_cents: 50, included_quantity: 1000, is_active: true, unbilled_quantity: 1500, billable_quantity: 500, unbilled_amount_cents: 25_000 }] }, error: null });
    show(<UsageDialog open onOpenChange={() => {}} sub={sub} />);
    expect(await screen.findByText('api_calls')).toBeInTheDocument();
    expect(screen.getByText(/Usage on the next invoice/i)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('subscription_usage_summary', { p_subscription_id: 'sub-1' });
  });

  it('records usage through the function, against the meter that exists', async () => {
    rpc.mockResolvedValue({ data: { success: true, meters: [{ metric: 'api_calls', unit_label: null, unit_amount_cents: 50, included_quantity: 0, is_active: true, unbilled_quantity: 0, billable_quantity: 0, unbilled_amount_cents: 0 }] }, error: null });
    show(<UsageDialog open onOpenChange={() => {}} sub={sub} />);
    await screen.findByText('api_calls');
    fireEvent.change(screen.getByLabelText('Quantity used'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record usage' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('record_subscription_usage', { p_subscription_id: 'sub-1', p_metric: 'api_calls', p_quantity: 40 }));
  });

  it('a subscription without meters offers to add one, and cannot record usage yet', async () => {
    rpc.mockResolvedValue({ data: { success: true, meters: [] }, error: null });
    show(<UsageDialog open onOpenChange={() => {}} sub={sub} />);
    expect(await screen.findByText(/No meters yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record usage' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save meter' })).toBeDisabled();
  });
});

describe('cohort retention', () => {
  it('leaves months that have not happened empty — the future is not 100 %', async () => {
    rpc.mockResolvedValue({ data: { success: true, cohorts: [
      { cohort: '2026-07', started: 4, retained: [{ month: 0, active: 4, pct: 100 }, { month: 1, active: 3, pct: 75 }, { month: 2, active: 2, pct: 50 }] },
      { cohort: '2026-09', started: 2, retained: [{ month: 0, active: 2, pct: 100 }] },
    ] }, error: null });
    show(<CohortRetentionCard />);
    expect(await screen.findByText('2026-07')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    // Two cohorts, four known cells in total: 100, 75, 50 and 100. Nothing else is drawn.
    expect(screen.getAllByText(/^\d+%$/)).toHaveLength(4);
  });

  it('says so when nothing started', async () => {
    rpc.mockResolvedValue({ data: { success: true, cohorts: [] }, error: null });
    show(<CohortRetentionCard />);
    expect(await screen.findByText(/No subscriptions started/i)).toBeInTheDocument();
  });
});
