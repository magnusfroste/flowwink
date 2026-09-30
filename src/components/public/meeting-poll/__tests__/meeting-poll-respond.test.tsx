import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MeetingPollRespond } from '../MeetingPollRespond';

/**
 * The public face of a poll, on screen. The rule and the wall are the
 * battery's (propose-to-meet); what is tested here is that the component
 * says what the RPC answered — the slots with their counts, initials and
 * never an address, the decided time when there is one — and that an answer
 * goes out through respond_to_meeting_poll_by_token with exactly the ticked
 * slot ids. A mistyped link is "not found", not a query.
 */

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const TOKEN = '11111111-2222-4333-8444-555555555555';
const view = (over: Record<string, unknown> = {}) => ({
  id: 'p1', title: 'Kickoff', description: null, organizer_name: 'Anna', timezone: 'Europe/Stockholm',
  policy: 'first_all', quorum: null, status: 'open', expires_at: null, resolved_slot_id: null,
  slots: [
    { id: 's1', starts_at: '2026-10-06T07:00:00Z', duration_min: 60, position: 0, count: 2 },
    { id: 's2', starts_at: '2026-10-07T07:00:00Z', duration_min: 60, position: 1, count: 1 },
  ],
  respondents: [
    { initials: 'BB', name: 'Bo Berg', slot_ids: ['s1', 's2'] },
    { initials: 'CL', name: 'Cia Lund', slot_ids: ['s1'] },
  ],
  response_count: 2,
  ...over,
});

beforeEach(() => rpc.mockReset());

describe('the poll on screen', () => {
  it('shows the slots, the counts and initials — never an e-mail address', async () => {
    rpc.mockResolvedValue({ error: null, data: view() });
    render(<MeetingPollRespond token={TOKEN} />);
    expect(await screen.findByText('Kickoff')).toBeTruthy();
    expect(screen.getAllByText('BB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CL').length).toBe(1);
    expect(screen.queryByText(/@/)).toBeNull();
    expect(rpc).toHaveBeenCalledWith('get_meeting_poll_by_token', { p_token: TOKEN });
  });

  it('sends the ticked slot ids with the visitor\'s name and e-mail', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'get_meeting_poll_by_token'
        ? Promise.resolve({ error: null, data: view() })
        : Promise.resolve({ error: null, data: { success: true, poll: view({ response_count: 3 }) } }));
    render(<MeetingPollRespond token={TOKEN} />);
    await screen.findByText('Kickoff');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dan' } });
    fireEvent.change(screen.getByLabelText('Your e-mail'), { target: { value: 'dan@example.test' } });
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByText('Send my availability'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('respond_to_meeting_poll_by_token', {
      p_token: TOKEN, p_email: 'dan@example.test', p_name: 'Dan', p_slot_ids: ['s2'],
    }));
    expect(await screen.findByText(/your answer is in/i)).toBeTruthy();
  });

  it('shows the decided time and no form once the poll is resolved', async () => {
    rpc.mockResolvedValue({ error: null, data: view({ status: 'resolved', resolved_slot_id: 's1' }) });
    render(<MeetingPollRespond token={TOKEN} />);
    expect(await screen.findByText('The meeting is set')).toBeTruthy();
    expect(screen.queryByText('Send my availability')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('treats a mistyped link as not found without asking the database', async () => {
    render(<MeetingPollRespond token="not-a-uuid" />);
    expect(await screen.findByText(/does not exist/i)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});
