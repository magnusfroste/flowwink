import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OutboundGuardPanel } from '../OutboundGuardPanel';

/**
 * The panel exists because the guard was invisible: a rule only the database
 * knew about, which blocked a colleague invitation this morning and told the
 * admin nothing but an HTTP status.
 *
 * Its most important job is NOT the on/off switch. The dangerous mistake is the
 * opposite of the one the guard prevents — going live with it still on, so
 * invoices quietly never arrive. So the count of held sends has to be loud, and
 * "go live" has to be one obvious action.
 */

const save = vi.fn();
let allowlist: unknown = null;
let withheld = { rows: [] as Array<Record<string, unknown>>, total: 0 };

vi.mock('@/hooks/useEmailAllowlist', () => ({
  useEmailAllowlist: () => ({ data: allowlist, isLoading: false }),
  useWithheldEmails: () => ({ data: withheld }),
  useUpdateEmailAllowlist: () => ({ mutate: save, isPending: false }),
}));

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OutboundGuardPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  save.mockReset();
  withheld = { rows: [], total: 0 };
  allowlist = { enabled: true, domains: ['optictunnels.eu'], addresses: [], scope: 'customer_facing' };
});

describe('an instance that is holding mail says so', () => {
  it('leads with the state, not with settings', () => {
    show();
    expect(screen.getByText(/This instance is not live yet/i)).toBeInTheDocument();
    // The badge sits inside the title, so both the badge and its parent match.
    expect(screen.getAllByText(/holding mail/i).length).toBeGreaterThan(0);
  });

  it('shows what was actually held — consequence before configuration', () => {
    withheld = {
      total: 4,
      rows: [{
        id: '1', recipient: 'peter@optictunnels.com', subject: 'Invitation',
        source: 'invite-colleague', created_at: '2026-08-10T10:22:00Z',
      }],
    };
    show();
    expect(screen.getByText(/4 sends were held back/i)).toBeInTheDocument();
    expect(screen.getByText('peter@optictunnels.com')).toBeInTheDocument();
    // Nobody should think turning the guard off releases a backlog.
    expect(screen.getByText(/they are not delivered when the guard is turned off/i)).toBeInTheDocument();
  });

  it('offers going live as ONE action, and that action turns it off', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Go live/i }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('warns when the list is empty, because that withholds everything', () => {
    allowlist = { enabled: true, domains: [], addresses: [], scope: 'customer_facing' };
    show();
    expect(screen.getByText(/every send is withheld/i)).toBeInTheDocument();
  });

  it('explains why colleagues still get mail under customer_facing', () => {
    // The false positive that started this: blocking your own team trains
    // people to switch the guard off.
    show();
    expect(screen.getByText(/blocking your own team trains people to switch it off/i)).toBeInTheDocument();
  });
});

describe('an instance that is live says that too', () => {
  beforeEach(() => {
    allowlist = { enabled: false, domains: [], addresses: [], scope: 'customer_facing' };
  });

  it('does not pretend to be guarding', () => {
    show();
    expect(screen.getByText(/^Outbound guard$/)).toBeInTheDocument();
    expect(screen.getByText(/this instance mails anyone/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Go live/i })).not.toBeInTheDocument();
  });

  it('still shows what was held earlier, so history does not vanish on going live', () => {
    withheld = {
      total: 2,
      rows: [{
        id: '1', recipient: 'kund@example.com', subject: 'Invoice',
        source: 'send_invoice', created_at: '2026-08-09T09:00:00Z',
      }],
    };
    show();
    expect(screen.getByText(/2 sends were held back/i)).toBeInTheDocument();
  });
});
