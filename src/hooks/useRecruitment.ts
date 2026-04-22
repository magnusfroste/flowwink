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
    mutationFn: async ({
      id,
      to_stage,
      rejected_reason,
    }: {
      id: string;
      to_stage: ApplicationStage;
      rejected_reason?: string;
    }) => {
      const updates: Partial<Application> = { stage: to_stage };
      if (to_stage === 'rejected' && rejected_reason) updates.rejected_reason = rejected_reason;
      const { data, error } = await supabase
        .from('applications')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      toast({ title: 'Stage updated' });
    },
    onError: (e: Error) => toast({ title: 'Move failed', description: e.message, variant: 'destructive' }),
  });
}

export function useScoreCandidate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (application_id: string) => {
      const { data, error } = await supabase.functions.invoke('score-candidate', {
        body: { application_id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Scoring failed');
      return data.scoring;
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

      // Fire-and-forget: invite employee to portal if no auth user yet
      if (result.employee_id) {
        try {
          await supabase.functions.invoke('invite-employee', {
            body: { employee_id: result.employee_id },
          });
        } catch (e) {
          logger.error('invite-employee failed', e);
        }
      }
      return result;
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['applications', vars.application_id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({
        title: 'Candidate hired',
        description: data.needs_invite
          ? 'Employee record + onboarding created. Portal invite sent.'
          : 'Employee record + onboarding created. Portal access linked.',
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
