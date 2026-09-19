import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { CashFlowTab } from '../CashFlowTab';
import { ConsolidationTab } from '../ConsolidationTab';

/**
 * The admin surfaces of cash_flow_forecast and consolidation_report. The answers
 * below have the shape the functions return (read off the local stack); what is
 * tested is that the tab says what the function answered, including what it
 * leaves out.
 */

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

function show(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => rpc.mockReset());

describe('cash flow', () => {
  it('shows the weeks, the lowest point and what the forecast leaves out', async () => {
    rpc.mockResolvedValue({ data: {
      success: true, currency: 'SEK', from: '2026-09-14', weeks: 2,
      opening_cents: 6_971_800, closing_cents: 14_971_800,
      lowest: { week_start: '2026-09-21', closing_cents: -250_000 },
      overdue_receivables_cents: 8_000_000, overdue_payables_cents: 0,
      by_week: [
        { week_start: '2026-09-14', receivables_cents: 8_000_000, subscriptions_cents: 0, payables_cents: 0, net_cents: 8_000_000, closing_cents: 14_971_800 },
        { week_start: '2026-09-21', receivables_cents: 0, subscriptions_cents: 0, payables_cents: 15_221_800, net_cents: -15_221_800, closing_cents: -250_000 },
      ],
      largest_items: [{ kind: 'receivable', ref: 'INV-1', counterparty: 'Acme', due: '2026-09-14', amount_cents: 8_000_000, overdue: true }],
      not_converted_currencies: ['EUR'],
      not_included: ['payroll and employer taxes', 'VAT and tax payments'],
    }, error: null });
    show(<CashFlowTab />);
    expect(await screen.findByText('In the bank now')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + two weeks
    expect(screen.getByText(/payroll and employer taxes/)).toBeInTheDocument();
    expect(screen.getByText(/Items in EUR are left out/)).toBeInTheDocument();
    expect(screen.getByText('overdue')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('cash_flow_forecast', { p_weeks: 13, p_include_subscriptions: true });
  });

  it('says why when the function refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Requires the accounting module' } });
    show(<CashFlowTab />);
    expect(await screen.findByText(/Requires the accounting module/)).toBeInTheDocument();
  });
});

describe('consolidation', () => {
  it('shows each entity with its rate, and warns about missing rates', async () => {
    rpc.mockResolvedValue({ data: {
      success: true, as_of: '2026-09-19', method: 'closing-rate translation of net per account (trial-balance level)',
      presentation_currency: 'SEK', consolidated_net_cents: 0, missing_rates: ['NO-SUB'],
      entities: [{ code: 'HQ', name: 'Headquarters (base ledger)', currency: 'SEK', closing_rate: 1, net_local_cents: 0, net_translated_cents: 0,
        accounts: [{ account_code: '1930', account_name: 'Företagskonto', net_local_cents: 115_779_650, net_translated_cents: 115_779_650 }] }],
    }, error: null });
    show(<ConsolidationTab />);
    expect(await screen.findByText(/Headquarters \(base ledger\)/)).toBeInTheDocument();
    expect(screen.getByText(/rate 1/)).toBeInTheDocument();
    expect(screen.getByText('1930')).toBeInTheDocument();
    expect(screen.getByText(/No exchange rate on or before 2026-09-19 for: NO-SUB/)).toBeInTheDocument();
  });
});
