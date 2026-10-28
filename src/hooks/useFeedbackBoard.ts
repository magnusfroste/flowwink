import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * The feedback board, read and written the way every reader of it is: the
 * public board through content-api (anon, no JWT — the public-block rule), the
 * admin through the module's skills (agent-execute), so a person and an agent
 * run the same code.
 */
export type FeedbackBoard = 'bug' | 'feature' | 'template' | 'question';
export type FeedbackStatus = 'open' | 'planned' | 'in_progress' | 'done' | 'declined';

export interface FeedbackPost {
  id: string;
  board: FeedbackBoard;
  title: string;
  body: string;
  status: FeedbackStatus;
  author_name: string | null;
  author_email?: string | null;
  origin_site_url?: string | null;
  origin?: Record<string, unknown> | null;
  source?: 'board' | 'instance' | 'agent';
  votes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}
export interface FeedbackComment { id: string; author_name: string | null; body: string; is_staff: boolean; created_at: string }
export interface FeedbackInstance {
  instance_id: string; site_url: string | null; app: string; skills_sha: string | null; modules_enabled: string[];
  module_count: number; first_seen_at: string; last_seen_at: string; ping_count: number;
}

const API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api/feedback`;
const anonHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` };

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: anonHeaders });
  if (!res.ok) throw new Error(`Feedback read failed (${res.status})`);
  return (await res.json()) as T;
}
async function publicPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: anonHeaders, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Feedback write failed (${res.status})`);
  return json;
}

/** The device's voter key — a vote per browser per post. Signed-in customers vote as themselves. */
export function voterKey(userId?: string | null): string {
  if (userId) return `user:${userId}`;
  try {
    const k = localStorage.getItem('fw_feedback_voter');
    if (k) return k;
    const fresh = `device:${crypto.randomUUID()}`;
    localStorage.setItem('fw_feedback_voter', fresh);
    return fresh;
  } catch {
    return 'device:anonymous';
  }
}

export function usePublicFeedbackPosts(opts: { board?: string; status?: string; q?: string; sort?: 'newest' | 'top' }) {
  const params = new URLSearchParams();
  if (opts.board) params.set('board', opts.board);
  if (opts.status) params.set('status', opts.status);
  if (opts.q) params.set('q', opts.q);
  if (opts.sort) params.set('sort', opts.sort);
  return useQuery({
    queryKey: ['feedback', 'public', 'posts', params.toString()],
    queryFn: () => publicGet<{ posts: FeedbackPost[] }>(`/posts?${params.toString()}`).then((r) => r.posts),
    staleTime: 30 * 1000,
  });
}

export function usePublicFeedbackPost(id: string | undefined) {
  return useQuery({
    queryKey: ['feedback', 'public', 'post', id],
    enabled: !!id,
    queryFn: () => publicGet<{ post: FeedbackPost; comments: FeedbackComment[] }>(`/post/${id}`),
  });
}

export function usePublicFeedbackWrite() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['feedback'] });
  const create = useMutation({
    mutationFn: (body: { board: FeedbackBoard; title: string; body: string; author_name?: string; author_email?: string; website?: string }) =>
      publicPost<{ id: string }>('', body),
    onSuccess: invalidate,
  });
  const vote = useMutation({
    mutationFn: (body: { post_id: string; voter_key: string; remove?: boolean }) => publicPost<{ votes_count: number; voted: boolean }>('/vote', body),
    onSuccess: invalidate,
  });
  const comment = useMutation({
    mutationFn: (body: { post_id: string; body: string; author_name?: string }) => publicPost<{ id: string }>('/comment', body),
    onSuccess: invalidate,
  });
  return { create, vote, comment };
}

// ── The admin: through the module's skills ─────────────────────────────────
export interface SkillAnswer { success?: boolean; error?: string; status?: string; [k: string]: unknown }

export async function runFeedbackSkill(skillName: string, args: Record<string, unknown>): Promise<SkillAnswer> {
  const { data, error } = await supabase.functions.invoke('agent-execute', {
    body: { skill_name: skillName, arguments: args, agent_type: 'admin_ui' },
  });
  if (error) throw new Error(error.message);
  if (data?.status === 'pending_approval') throw new Error('This action needs approval under Approvals before it runs.');
  const result = (data?.result ?? data) as SkillAnswer;
  if (result && result.success === false) throw new Error(String(result.error ?? 'The skill refused.'));
  return result;
}

export function useReceivedFeedback(filters: { board?: string; status?: string }) {
  return useQuery({
    queryKey: ['feedback', 'received', filters],
    queryFn: async () => {
      const r = await runFeedbackSkill('manage_feedback', { action: 'list', limit: 200, ...filters });
      return (r.posts ?? []) as FeedbackPost[];
    },
    staleTime: 15 * 1000,
  });
}

export function useFeedbackInstances() {
  return useQuery({
    queryKey: ['feedback', 'instances'],
    queryFn: async () => {
      const r = await runFeedbackSkill('manage_feedback', { action: 'instances' });
      return r as unknown as { instances: FeedbackInstance[]; total: number; active_7d: number; versions: Record<string, number> };
    },
    staleTime: 60 * 1000,
  });
}

export function useFeedbackSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skill, args }: { skill: string; args: Record<string, unknown> }) => runFeedbackSkill(skill, args),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback'] }); },
    onError: (e: unknown) => logger.error('[feedback] skill failed:', e),
  });
}
