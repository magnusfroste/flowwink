/**
 * Meeting polls — the staff side.
 *
 * Everything writes through the module's RPCs (the same functions the skills
 * call), so the admin panel and FlowPilot can never disagree about what a poll
 * is. Reads that need the FULL respondent (e-mail included) go to the tables
 * directly — staff RLS (admin or the booking module) allows it; anon has no
 * policy at all and never reaches this hook.
 *
 * The supabase generated types do not yet know these RPCs; the `as never`
 * casts are the repo's idiom for that (see useInventoryV2).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type MeetingPollPolicy = 'first_all' | 'first_quorum' | 'max_attendance';
export type MeetingPollStatus = 'open' | 'resolved' | 'expired' | 'cancelled';

export interface MeetingPollListItem {
  id: string;
  title: string;
  status: MeetingPollStatus;
  policy: MeetingPollPolicy;
  quorum: number | null;
  organizer_email: string;
  organizer_name: string;
  share_path: string;
  expires_at: string | null;
  resolved_slot_id: string | null;
  calendar_event_id: string | null;
  slots: number;
  responses: number;
  created_at: string;
}

export interface MeetingPollSlotRow {
  id: string;
  poll_id: string;
  starts_at: string;
  duration_min: number;
  position: number;
}

export interface MeetingPollResponseRow {
  id: string;
  poll_id: string;
  email: string;
  name: string;
  slot_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface MeetingPollDetail {
  id: string;
  title: string;
  description: string | null;
  organizer_email: string;
  organizer_name: string;
  timezone: string;
  policy: MeetingPollPolicy;
  quorum: number | null;
  status: MeetingPollStatus;
  customer_facing: boolean;
  expires_at: string | null;
  share_token: string;
  resolved_slot_id: string | null;
  resolved_at: string | null;
  calendar_event_id: string | null;
  booking_id: string | null;
  created_at: string;
  slots: MeetingPollSlotRow[];
  responses: MeetingPollResponseRow[];
}

export interface CreateMeetingPollInput {
  title: string;
  description?: string;
  organizer_email: string;
  organizer_name: string;
  timezone: string;
  policy: MeetingPollPolicy;
  quorum?: number | null;
  expires_at?: string | null;
  customer_facing: boolean;
  slots: Array<{ starts_at: string; duration_min: number }>;
}

export interface CreateMeetingPollResult {
  success: boolean;
  poll_id: string;
  share_token: string;
  edit_token: string;
  share_path: string;
  slots: number;
  policy: MeetingPollPolicy;
}

export interface ResolveMeetingPollResult {
  success?: boolean;
  resolved: boolean;
  reason?: string;
  already_resolved?: boolean;
  slot_id?: string;
  starts_at?: string;
  calendar_event_id?: string | null;
  booking_id?: string | null;
  attendees?: number;
  error?: string;
}

const LIST_KEY = ['meeting-polls'] as const;

export function useMeetingPolls(status?: MeetingPollStatus) {
  return useQuery({
    queryKey: [...LIST_KEY, status ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_meeting_polls' as never, {
        p_status: status ?? null,
        p_limit: 200,
      } as never);
      if (error) throw error;
      return ((data ?? []) as unknown) as MeetingPollListItem[];
    },
  });
}

export function useMeetingPoll(pollId: string | null) {
  return useQuery({
    queryKey: [...LIST_KEY, 'detail', pollId],
    enabled: !!pollId,
    queryFn: async (): Promise<MeetingPollDetail> => {
      const [{ data: poll, error: pErr }, { data: slots, error: sErr }, { data: responses, error: rErr }] = await Promise.all([
        supabase.from('meeting_polls' as never).select('*').eq('id', pollId as string).single(),
        supabase.from('meeting_poll_slots' as never).select('*').eq('poll_id', pollId as string).order('starts_at'),
        supabase.from('meeting_poll_responses' as never).select('*').eq('poll_id', pollId as string).order('created_at'),
      ]);
      if (pErr) throw pErr;
      if (sErr) throw sErr;
      if (rErr) throw rErr;
      return {
        ...((poll as unknown) as Omit<MeetingPollDetail, 'slots' | 'responses'>),
        slots: ((slots ?? []) as unknown) as MeetingPollSlotRow[],
        responses: ((responses ?? []) as unknown) as MeetingPollResponseRow[],
      };
    },
  });
}

export function useCreateMeetingPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMeetingPollInput): Promise<CreateMeetingPollResult> => {
      const { data, error } = await supabase.rpc('create_meeting_poll' as never, {
        p_title: input.title,
        p_slots: input.slots,
        p_organizer_email: input.organizer_email,
        p_organizer_name: input.organizer_name,
        p_description: input.description || null,
        p_timezone: input.timezone,
        p_policy: input.policy,
        p_quorum: input.policy === 'first_quorum' ? (input.quorum ?? null) : null,
        p_expires_at: input.expires_at || null,
        p_customer_facing: input.customer_facing,
      } as never);
      if (error) throw error;
      return (data as unknown) as CreateMeetingPollResult;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: LIST_KEY }); },
    onError: (e) => logger.error('create_meeting_poll failed', e),
  });
}

export function useResolveMeetingPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: string): Promise<ResolveMeetingPollResult> => {
      const { data, error } = await supabase.rpc('resolve_meeting_poll' as never, { p_poll_id: pollId } as never);
      if (error) throw error;
      return (data as unknown) as ResolveMeetingPollResult;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: LIST_KEY }); },
    onError: (e) => logger.error('resolve_meeting_poll failed', e),
  });
}

/** Staff closes a poll without a decision. Status only — nothing is deleted. */
export function useCancelMeetingPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: string) => {
      const { error } = await supabase
        .from('meeting_polls' as never)
        .update({ status: 'cancelled', updated_at: new Date().toISOString() } as never)
        .eq('id', pollId)
        .eq('status', 'open');
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: LIST_KEY }); },
    onError: (e) => logger.error('cancel meeting poll failed', e),
  });
}

export interface SendPollInvitesInput {
  poll_id: string;
  emails: string[];
  public_url: string;
  custom_message?: string;
}

export interface CommsSendResult {
  success?: boolean;
  sent?: number;
  failed?: Array<{ to: string; error: string }>;
  skipped?: string;
  error?: string;
}

/** The share link out, through comms-send (kind meeting_poll_invite). */
export function useSendMeetingPollInvites() {
  return useMutation({
    mutationFn: async (input: SendPollInvitesInput): Promise<CommsSendResult> => {
      const { data, error } = await supabase.functions.invoke('comms-send', {
        body: { kind: 'meeting_poll_invite', ...input },
      });
      if (error) throw error;
      return (data ?? {}) as CommsSendResult;
    },
    onError: (e) => logger.error('meeting_poll_invite failed', e),
  });
}

/** The decision back to everyone who can make it (kind meeting_poll_confirmation). */
export function useSendMeetingPollConfirmation() {
  return useMutation({
    mutationFn: async (input: { poll_id: string; public_url: string }): Promise<CommsSendResult> => {
      const { data, error } = await supabase.functions.invoke('comms-send', {
        body: { kind: 'meeting_poll_confirmation', ...input },
      });
      if (error) throw error;
      return (data ?? {}) as CommsSendResult;
    },
    onError: (e) => logger.error('meeting_poll_confirmation failed', e),
  });
}
