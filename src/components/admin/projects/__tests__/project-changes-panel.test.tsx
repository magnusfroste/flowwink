import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ProjectChangesPanel } from '../ProjectChangesPanel';

/**
 * "What changed since last Tuesday" on screen. The digest is the database's
 * (the process battery holds project_changes); what is tested here is that the
 * panel says what the function answered — the deleted task by name, an agent's
 * step apart from a person's question, the quiet projects, and the honest note
 * where history begins before the ledger did.
 */

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('@/hooks/usePlatformFormat', () => ({
  usePlatformFormat: () => ({ formatDateTime: (iso: string) => `at:${iso.slice(0, 10)}`, formatDate: (iso: string) => iso.slice(0, 10) }),
}));

function show(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const empty = { created: [], completed: [], reopened: [], moved: [], reprioritised: [], reassigned: [], rescheduled: [], renamed: [], progressed: [], deleted: [], dependencies: [], milestones: [], comments: [], hours: { total: 0, by_person: [] } };
const zero = { created: 0, completed: 0, reopened: 0, moved: 0, reprioritised: 0, reassigned: 0, rescheduled: 0, renamed: 0, progressed: 0, deleted: 0, dependencies: 0, milestones: 0, comments: 0, hours: 0 };

beforeEach(() => rpc.mockReset());

describe('the changes panel', () => {
  it('lists what happened per project, names the quiet ones, and marks partial history', async () => {
    rpc.mockResolvedValue({ error: null, data: {
      success: true, since: '2026-09-15T00:00:00Z', until: '2026-09-22T12:00:00Z', ledger_started_at: '2026-09-20T00:00:00Z',
      projects: [{
        ...empty, project_id: 'p1', name: 'Legal', sort_order: 1, is_active: true, history_from: '2026-09-20T00:00:00Z', coverage: 'partial',
        counts: { ...zero, completed: 1, deleted: 1, comments: 2, hours: 2.5 },
        completed: [{ task_id: 't1', title: 'Board minutes signed', at: '2026-09-21T10:00:00Z', by: 'Anna' }],
        deleted: [{ task_id: 't9', title: 'Draft the press release', was: 'todo', at: '2026-09-21T11:00:00Z', by: 'agent' }],
        comments: [
          { task_id: 't2', title: 'Register with Bolagsverket', kind: 'question', author_type: 'person', author: 'Peter', body: 'Who signs?', at: '2026-09-21T09:00:00Z' },
          { task_id: 't2', title: 'Register with Bolagsverket', kind: 'step', author_type: 'agent', author: 'FlowPilot', body: 'Waiting for the minutes', at: '2026-09-21T09:30:00Z' },
        ],
        hours: { total: 2.5, by_person: [{ name: 'Anna', hours: 2.5 }] },
      }],
      quiet: [{ project_id: 'p2', name: 'Finland' }, { project_id: 'p3', name: 'Team' }],
      note: '',
    } });
    show(<ProjectChangesPanel projectId={null} />);
    expect(await screen.findByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('1 completed · 1 deleted · 2 comments · 2.5 h logged')).toBeInTheDocument();
    expect(screen.getByText('Board minutes signed')).toBeInTheDocument();
    // A deleted task keeps its name.
    expect(screen.getByText('Draft the press release')).toBeInTheDocument();
    // People and agents are told apart.
    expect(screen.getByText('Said by people')).toBeInTheDocument();
    expect(screen.getByText('Who signs?')).toBeInTheDocument();
    expect(screen.getByText('Done by agents')).toBeInTheDocument();
    // Silence is an answer.
    expect(screen.getByText(/Quiet: Finland, Team/)).toBeInTheDocument();
    // History that begins after the window opened says so.
    expect(screen.getByText(/Recorded from at:2026-09-20\. Before that/)).toBeInTheDocument();
    // The default window is the last 7 days, over the whole portfolio.
    const args = rpc.mock.calls[0][1] as { p_project_id: string | null; p_since: string; p_until: string | null };
    expect(args.p_project_id).toBeNull();
    expect(args.p_until).toBeNull();
    expect(new Date(args.p_since).getTime()).toBeLessThan(Date.now() - 6 * 86400_000);
  });

  it('a project window with nothing in it says so, without a quiet list', async () => {
    rpc.mockResolvedValue({ error: null, data: { success: true, since: '', until: '', ledger_started_at: null, projects: [], quiet: [], note: '' } });
    show(<ProjectChangesPanel projectId="p1" />);
    expect(await screen.findByText('Nothing changed')).toBeInTheDocument();
    expect(screen.queryByText(/Quiet:/)).not.toBeInTheDocument();
    expect((rpc.mock.calls[0][1] as { p_project_id: string }).p_project_id).toBe('p1');
  });
});
