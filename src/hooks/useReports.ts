import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Reports — read through RLS (the reports module, narrowed by each report's
 * audience_module), changed by a person through the report_person_*
 * functions. Agents publish through publish_report (agent-execute).
 */

export interface ReportCard {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  audience_module: string | null;
  subject_type: string | null;
  subject_id: string | null;
  status: 'active' | 'archived';
  current_version: number;
  locked_fields: string[];
  created_by: string | null;
  requested_by_user_id: string | null;
  updated_at: string;
}

export interface ReportVersion {
  version: number;
  title: string;
  format: 'markdown' | 'html';
  content: string;
  note: string | null;
  published_by: string;
  published_by_kind: string;
  requested_by: string | null;
  created_at: string;
}

const REPORTS = ['reports'] as const;

export function useReports(includeArchived: boolean) {
  return useQuery({
    queryKey: [...REPORTS, 'list', includeArchived],
    queryFn: async (): Promise<ReportCard[]> => {
      let q = supabase.from('reports' as never)
        .select('id, slug, title, description, category, tags, audience_module, subject_type, subject_id, status, current_version, locked_fields, created_by, requested_by_user_id, updated_at')
        .order('updated_at', { ascending: false });
      if (!includeArchived) q = q.eq('status', 'active');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ReportCard[];
    },
  });
}

export function useReportVersions(reportId: string | undefined) {
  return useQuery({
    queryKey: [...REPORTS, 'versions', reportId],
    enabled: !!reportId,
    queryFn: async (): Promise<ReportVersion[]> => {
      const { data, error } = await supabase.from('report_versions' as never)
        .select('version, title, format, content, note, published_by, published_by_kind, requested_by, created_at')
        .eq('report_id', reportId!)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReportVersion[];
    },
  });
}

function usePersonAction<T>(fn: string, success: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: T) => {
      const { data, error } = await (supabase.rpc as unknown as (f: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { toast.success(success); qc.invalidateQueries({ queryKey: REPORTS }); },
    onError: (e: Error) => { logger.error(`[reports] ${fn}`, e); toast.error(e.message); },
  });
}

export const useArchiveReport = () =>
  usePersonAction<{ p_slug: string; p_archived: boolean }>('report_person_archive', 'Report updated');
export const useRestoreReportVersion = () =>
  usePersonAction<{ p_slug: string; p_version: number }>('report_person_restore_version', 'Restored as the newest version');
export const useSetReportDetails = () =>
  usePersonAction<{ p_slug: string; p_title?: string; p_description?: string; p_category?: string; p_unlock?: string[] }>('report_person_set_details', 'Details saved — agents keep what you set');

/**
 * The reports about one thing in the business (a company, a deal, a project)
 * — shown on that thing's page. RLS decides as everywhere: a role without the
 * reports module, or outside a report's audience, gets none and sees nothing.
 */
export function useSubjectReports(subjectType: string, subjectId: string | undefined) {
  return useQuery({
    queryKey: [...REPORTS, 'subject', subjectType, subjectId],
    enabled: !!subjectId,
    queryFn: async (): Promise<ReportCard[]> => {
      const { data, error } = await supabase.from('reports' as never)
        .select('id, slug, title, description, category, tags, audience_module, subject_type, subject_id, status, current_version, locked_fields, created_by, requested_by_user_id, updated_at')
        .eq('subject_type', subjectType)
        .eq('subject_id', subjectId!)
        .eq('status', 'active')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReportCard[];
    },
  });
}
