import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { Database } from '@/integrations/supabase/types';

export type JobPosting = Database['public']['Tables']['job_postings']['Row'];
export type Application = Database['public']['Tables']['applications']['Row'];
export type ApplicationStage = Database['public']['Enums']['application_stage'];
export type EmploymentKind = Database['public']['Enums']['employment_kind'];

export const APPLICATION_STAGES: ApplicationStage[] = [
  'applied',
  'screened',
  'interview_scheduled',
  'interviewed',
  'offer_sent',
  'hired',
  'rejected',
];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: 'New',
  screened: 'Screened',
  interview_scheduled: 'Interview scheduled',
  interviewed: 'Interviewed',
  offer_sent: 'Offer sent',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

// ── Job postings ───────────────────────────────────────────────

export function useJobPostings() {
  return useQuery({
    queryKey: ['job_postings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_postings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useJobPosting(id: string | undefined) {
  return useQuery({
    queryKey: ['job_postings', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_postings')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateJobPosting() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      slug: string;
      department?: string;
      location?: string;
      employment_type?: EmploymentKind;
      description?: string;
      requirements?: string;
      status?: Database['public']['Enums']['job_posting_status'];
    }) => {
      const { data, error } = await supabase
        .from('job_postings')
        .insert({
          title: input.title,
          slug: input.slug,
          department: input.department ?? null,
          location: input.location ?? null,
          employment_type: input.employment_type ?? 'full_time',
          description: input.description ?? null,
          requirements: input.requirements ?? null,
          status: input.status ?? 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job_postings'] });
      toast({ title: 'Job created' });
    },
    onError: (e: Error) => {
      logger.error('createJobPosting', e);
      toast({ title: 'Failed to create job', description: e.message, variant: 'destructive' });
    },
  });
}

export function useUpdateJobPosting() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<JobPosting> }) => {
      const { data, error } = await supabase
        .from('job_postings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['job_postings'] });
      qc.invalidateQueries({ queryKey: ['job_postings', vars.id] });
      toast({ title: 'Job updated' });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteJobPosting() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('job_postings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job_postings'] });
      toast({ title: 'Job deleted' });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });
}

// ── Applications ───────────────────────────────────────────────

export function useApplications(jobId?: string) {
  return useQuery({
    queryKey: ['applications', jobId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('applications')
        .select('*, job_postings!inner(id, title, slug)')
        .order('created_at', { ascending: false });
      if (jobId) query = query.eq('job_posting_id', jobId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: ['applications', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('*, job_postings(*)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMoveApplicationStage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    // The same function an agent calls (move_application_stage): validated
    // stage, rejected_reason, the recruiter's comment on the history row.
    mutationFn: async ({
      id,
      to_stage,
      rejected_reason,
      comment,
    }: {
      id: string;
      to_stage: ApplicationStage;
      rejected_reason?: string;
      comment?: string;
    }) => {
      const { data, error } = await supabase.rpc('move_application_stage', {
        p_application_id: id,
        p_to_stage: to_stage,
        p_comment: comment ?? null,
        p_rejected_reason: rejected_reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['application', vars.id] });
      qc.invalidateQueries({ queryKey: ['application_stages', vars.id] });
      toast({ title: 'Stage updated' });
    },
    onError: (e: Error) => toast({ title: 'Move failed', description: e.message, variant: 'destructive' }),
  });
}

export interface CandidateNote {
  id: string;
  body: string;
  rating: number | null;
  author_id: string | null;
  created_at: string;
}

/** The team's notes on a candidate — interview feedback and assessments land here too. */
export function useCandidateNotes(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['candidate_notes', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_notes')
        .select('id, body, rating, author_id, created_at')
        .eq('application_id', applicationId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CandidateNote[];
    },
  });
}

export function useAddCandidateNote() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ application_id, body, rating }: { application_id: string; body: string; rating?: number | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('candidate_notes').insert({
        application_id, body, rating: rating ?? null, author_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['candidate_notes', vars.application_id] }),
    onError: (e: Error) => toast({ title: 'Note not saved', description: e.message, variant: 'destructive' }),
  });
}

export interface StageChange {
  id: string;
  from_stage: ApplicationStage | null;
  to_stage: ApplicationStage;
  comment: string | null;
  created_at: string;
}

export function useStageHistory(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['application_stages', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('application_stages')
        .select('id, from_stage, to_stage, comment, created_at')
        .eq('application_id', applicationId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StageChange[];
    },
  });
}

/**
 * A short-lived link to the CV the candidate uploaded — process-job-application
 * signs it for a caller whose own session may read the application.
 */
export function useCvUrl(applicationId: string | undefined, resumeUrl: string | null | undefined) {
  return useQuery({
    queryKey: ['cv_url', applicationId],
    enabled: !!applicationId && !!resumeUrl?.startsWith('form-uploads/applications/'),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-job-application?cv=${encodeURIComponent(applicationId!)}`,
        { headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) throw new Error(body?.error ?? `HTTP ${res.status}`);
      return body.url as string;
    },
  });
}

export function useScoreCandidate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (application_id: string) => {
      const { data, error } = await supabase.functions.invoke('ai-task', {
        body: { task: 'score_candidate', input: { application_id } },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Scoring failed');
      return data.result;
    },
    onSuccess: (_d, application_id) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['applications', application_id] });
      toast({ title: 'Candidate re-scored' });
    },
    onError: (e: Error) => {
      logger.error('scoreCandidate', e);
      toast({ title: 'Scoring failed', description: e.message, variant: 'destructive' });
    },
  });
}

export function useHireCandidate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      application_id: string;
      start_date?: string;
      employment_type?: 'full_time' | 'part_time' | 'contractor';
      department?: string;
    }) => {
      const { data, error } = await supabase.rpc('hire_candidate_from_application', {
        p_application_id: input.application_id,
        p_start_date: input.start_date ?? null,
        p_employment_type: input.employment_type ?? 'full_time',
        p_department: input.department ?? null,
      });
      if (error) throw error;
      const result = data as { success: boolean; employee_id: string; checklist_id: string; user_id: string | null; needs_invite: boolean };

      // Invite the new employee to the portal if no auth user yet. NOT
      // fire-and-forget any more: invite-employee is admin-gated (it mints an
      // auth user), so an HR role granted the recruitment module gets a 403
      // here — and the swallowed catch still let the success toast announce
      // "Portal invite sent." A denial rendered as a success is the worst
      // shape of this class: nobody goes looking. Report what actually
      // happened; the hire itself already succeeded and must not be undone.
      let inviteError: string | null = null;
      if (result.employee_id) {
        try {
          const { data: inviteData, error: inviteErr } = await supabase.functions.invoke('invite-employee', {
            body: { employee_id: result.employee_id },
          });
          if (inviteErr) inviteError = inviteErr.message ?? String(inviteErr);
          // The account and roles exist; the email did not go out. Say so and
          // hand over the activation link rather than announcing a mail nobody got.
          const res = inviteData as { status?: string; reason?: string; action_link?: string } | null;
          if (!inviteErr && res?.status === 'invited_no_mail') {
            inviteError = `Portal invite could not be emailed (${res.reason ?? 'no email provider'}). Activation link to pass on: ${res.action_link ?? '(none)'}`;
          }
        } catch (e) {
          inviteError = e instanceof Error ? e.message : String(e);
        }
        if (inviteError) logger.error('invite-employee failed', inviteError);
      }
      return { ...result, inviteError };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['applications', vars.application_id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({
        title: 'Candidate hired',
        description: data.inviteError
          ? `Employee record + onboarding created, but the portal invite failed: ${data.inviteError}. An administrator can invite them from the employee record.`
          : data.needs_invite
            ? 'Employee record + onboarding created. Portal invite sent.'
            : 'Employee record + onboarding created. Portal access linked.',
        variant: data.inviteError ? 'destructive' : undefined,
      });
    },
    onError: (e: Error) => {
      logger.error('hireCandidate', e);
      toast({ title: 'Hire failed', description: e.message, variant: 'destructive' });
    },
  });
}

export function useCreateApplication() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      job_posting_id: string;
      candidate_name: string;
      candidate_email: string;
      candidate_phone?: string;
      cover_letter?: string;
      linkedin_url?: string;
      source?: string;
    }) => {
      const { data, error } = await supabase
        .from('applications')
        .insert({
          job_posting_id: input.job_posting_id,
          candidate_name: input.candidate_name,
          candidate_email: input.candidate_email,
          candidate_phone: input.candidate_phone ?? null,
          cover_letter: input.cover_letter ?? null,
          linkedin_url: input.linkedin_url ?? null,
          source: input.source ?? 'manual',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      toast({ title: 'Candidate added' });
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });
}

export function useNewApplicationCount() {
  return useQuery({
    queryKey: ['recruitment', 'new-application-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('stage', 'applied');
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}

export interface InterviewRow {
  id: string;
  application_id: string;
  kind: string;
  scheduled_start: string;
  scheduled_end: string;
  interviewer_id: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | string;
  rating: number | null;
  feedback: string | null;
  location: string | null;
  meeting_url: string | null;
}

/** A candidate's interviews — the same list an agent reads (schedule_interview list). */
export function useInterviews(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['interviews', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('schedule_interview' as never, { p_action: 'list', p_application_id: applicationId } as never);
      if (error) throw error;
      return (((data as unknown as { interviews?: InterviewRow[] }) ?? {}).interviews ?? []) as InterviewRow[];
    },
  });
}

const commsSend = async (kind: string, body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke(`comms-send?kind=${kind}`, { body: { ...body, public_url: window.location.origin } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.clone().json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as { success?: boolean; sent?: boolean; simulated?: boolean; error?: string; invite_url?: string };
};

function useInterviewInvalidation() {
  const qc = useQueryClient();
  return (applicationId: string) => {
    qc.invalidateQueries({ queryKey: ['interviews', applicationId] });
    qc.invalidateQueries({ queryKey: ['interview_invitations', applicationId] });
    qc.invalidateQueries({ queryKey: ['application', applicationId] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };
}

/** Book a time directly — a WebMeet room unless a location is given — and mail the candidate. */
export function useScheduleInterview() {
  const invalidate = useInterviewInvalidation();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { application_id: string; start: string; end: string; kind: string; interviewer_id?: string | null; location?: string; notify: boolean }) => {
      const { data, error } = await supabase.rpc('schedule_interview' as never, {
        p_action: 'schedule', p_application_id: input.application_id, p_start: input.start, p_end: input.end,
        p_kind: input.kind, p_interviewer_id: input.interviewer_id ?? null, p_location: input.location || null, p_video: !input.location,
      } as never);
      if (error) throw error;
      const res = data as unknown as { success?: boolean; reason?: string; interview?: { id: string } };
      if (res?.success === false) throw new Error(res.reason === 'interviewer_conflict' ? 'The interviewer already has an interview at that time.' : (res.reason ?? 'Not scheduled'));
      let mail: Awaited<ReturnType<typeof commsSend>> | null = null;
      if (input.notify && res.interview?.id) mail = await commsSend('interview_confirmation', { interview_id: res.interview.id });
      return { mail };
    },
    onSuccess: ({ mail }, vars) => {
      invalidate(vars.application_id);
      toast({ title: 'Interview booked', description: mail ? (mail.sent ? (mail.simulated ? 'Mail simulated — no mail provider configured.' : 'The candidate has the time and the link.') : `Mail not sent: ${mail.error}`) : undefined });
    },
    onError: (e: Error) => toast({ title: 'Not booked', description: e.message, variant: 'destructive' }),
  });
}

export function useInterviewAction() {
  const qc = useQueryClient();
  const invalidate = useInterviewInvalidation();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { application_id: string; interview_id: string; action: 'complete' | 'cancel' | 'no_show'; feedback?: string; rating?: number | null }) => {
      const { error } = await supabase.rpc('schedule_interview' as never, {
        p_action: input.action, p_interview_id: input.interview_id, p_feedback: input.feedback || null, p_rating: input.rating ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidate(vars.application_id);
      // A completed interview with feedback leaves a candidate note.
      qc.invalidateQueries({ queryKey: ['candidate_notes', vars.application_id] });
      qc.invalidateQueries({ queryKey: ['application_stages', vars.application_id] });
    },
    onError: (e: Error) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }),
  });
}

/** Propose times; the candidate picks one at /interview/<token>. */
export function useInviteToInterview() {
  const invalidate = useInterviewInvalidation();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { application_id: string; slots: string[]; duration_minutes: number; kind: string; interviewer_id?: string | null; message?: string }) =>
      commsSend('interview_invitation', input),
    onSuccess: (res, vars) => {
      invalidate(vars.application_id);
      toast({
        title: res?.sent ? 'Invitation sent' : 'Invitation created',
        description: res?.sent ? (res.simulated ? 'Mail simulated — no mail provider configured.' : 'The candidate picks a time from the link in the mail.') : `Mail not sent${res?.error ? `: ${res.error}` : ''} — share the link: ${res?.invite_url ?? ''}`,
      });
    },
    onError: (e: Error) => toast({ title: 'Invitation not sent', description: e.message, variant: 'destructive' }),
  });
}

export interface InterviewInvitationRow {
  id: string;
  token: string;
  status: 'open' | 'booked' | 'cancelled' | 'expired';
  slots: string[];
  duration_minutes: number;
  expires_at: string;
  sent_at: string | null;
  created_at: string;
}

export function useInterviewInvitations(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['interview_invitations', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interview_invitations' as never)
        .select('id, token, status, slots, duration_minutes, expires_at, sent_at, created_at')
        .eq('application_id', applicationId!)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as InterviewInvitationRow[];
    },
  });
}
