/**
 * The careers page's client half: open roles, the CV upload and the ONE call
 * that turns a candidate into an application (process-job-application). The
 * rule the server holds the application to — consent, screening answers —
 * is the same module the edge function imports (application-intake.ts).
 */
import { supabase } from '@/integrations/supabase/client';
export {
  assessApplication,
  screeningQuestionsOf,
  type ScreeningQuestion,
} from '../../supabase/functions/_shared/recruitment/application-intake';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-job-application`;
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

export interface OpenRole {
  id: string;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  remote_policy: string | null;
  description: string | null;
  created_at: string;
}

export async function fetchOpenRoles(): Promise<OpenRole[]> {
  const { data, error } = await supabase
    .from('job_postings')
    .select('id, title, slug, department, location, employment_type, remote_policy, description, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OpenRole[];
}

/** How long an application is kept — the server's own number. */
export async function fetchRetentionMonths(): Promise<number> {
  try {
    const res = await fetch(FN, { method: 'GET', headers });
    const body = await res.json();
    const n = Number(body?.retention_months);
    return Number.isFinite(n) && n > 0 ? n : 12;
  } catch {
    return 12;
  }
}

export const CV_MAX_BYTES = 10 * 1024 * 1024;
export const CV_ACCEPT = '.pdf,.doc,.docx,.txt';

/** Uploads the CV to the careers area of form-uploads; returns the path the server reads. */
export async function uploadCv(file: File, postingId: string): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const path = `applications/${postingId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from('form-uploads')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return `form-uploads/${path}`;
}

export interface ApplicationInput {
  job_posting_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  linkedin_url?: string;
  cover_letter?: string;
  resume_text?: string;
  storage_path?: string;
  screening_answers: Record<string, string>;
  consent: boolean;
  lang?: string;
}

export type ApplicationResult =
  | { success: true; application_id: string; duplicate?: boolean }
  | { success: false; code?: string; error: string };

export async function submitApplication(input: ApplicationInput): Promise<ApplicationResult> {
  const res = await fetch(FN, { method: 'POST', headers, body: JSON.stringify(input) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    return { success: false, code: body?.code, error: body?.error ?? `HTTP ${res.status}` };
  }
  return { success: true, application_id: body.application_id, duplicate: body.duplicate };
}
