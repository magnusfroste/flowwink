import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FiscalYearSelector } from '../FiscalYearSelector';

/**
 * The selector once asked `accounting_periods` which fiscal years exist. That
 * table gets a row only when a month is CLOSED, so on liteit — 135 posted
 * verifications across 2022–2026, nothing ever closed — it was empty. The
 * selector offered the current year ±1 and badged all three "Upcoming",
 * including the year it had just booked nineteen entries into.
 *
 * Two invariants worth holding forever:
 *   1. The years come from the ledger, not from the closing register.
 *   2. "Upcoming" is a claim about the future. A year holding bookkeeping is
 *      never upcoming, and no data is not a licence to guess.
 */

const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

let selectedYear = 2026;
vi.mock('../FiscalYearContext', () => ({
  useFiscalYear: () => ({ year: selectedYear, setYear: (y: number) => { selectedYear = y; } }),
}));

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FiscalYearSelector />
    </QueryClientProvider>,
  );
}

const LITEIT = [
  { fiscal_year: 2026, entry_count: 19, months_closed: 0, status: 'open', is_current: true },
  { fiscal_year: 2025, entry_count: 33, months_closed: 0, status: 'open', is_current: false },
  { fiscal_year: 2024, entry_count: 41, months_closed: 12, status: 'closed', is_current: false },
  { fiscal_year: 2023, entry_count: 40, months_closed: 12, status: 'closed', is_current: false },
  { fiscal_year: 2022, entry_count: 2, months_closed: 12, status: 'closed', is_current: false },
];

beforeEach(() => {
  rpc.mockReset();
  selectedYear = 2026;
});

describe('the fiscal year selector reads the ledger', () => {
  it('asks list_fiscal_years, not the closing register', async () => {
    rpc.mockResolvedValue({ data: LITEIT, error: null });
    show();
    await screen.findByText('Open');
    expect(rpc).toHaveBeenCalledWith('list_fiscal_years');
  });

  it('does not call a year with bookkeeping in it "Upcoming"', async () => {
    rpc.mockResolvedValue({ data: LITEIT, error: null });
    show();
    // 2026 holds 19 posted entries. The trigger must say so.
    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  });

  it('claims nothing before the answer arrives', () => {
    // A pending query is absence of information. The old code defaulted it to
    // 'upcoming' — rendering "I do not know" as a statement about the future.
    rpc.mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('reports a closed year as closed', async () => {
    selectedYear = 2023;
    rpc.mockResolvedValue({ data: LITEIT, error: null });
    show();
    expect(await screen.findByText('Closed')).toBeInTheDocument();
  });

  it('keeps a year with genuinely nothing in it upcoming', async () => {
    selectedYear = 2027;
    rpc.mockResolvedValue({
      data: [...LITEIT, { fiscal_year: 2027, entry_count: 0, months_closed: 0, status: 'upcoming', is_current: false }],
      error: null,
    });
    show();
    expect(await screen.findByText('Upcoming')).toBeInTheDocument();
  });

  it('still offers the selected year when the ledger has never heard of it', async () => {
    // A stored preference must not become an option that is not in the list.
    selectedYear = 2019;
    rpc.mockResolvedValue({ data: LITEIT, error: null });
    show();
    expect(await screen.findByText('2019')).toBeInTheDocument();
  });
});
