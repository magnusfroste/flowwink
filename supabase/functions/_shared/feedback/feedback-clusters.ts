/**
 * The receiving board's triage read: the same defect reported from several
 * instances is one problem, not five posts. Every operator in the fleet files
 * what works badly with submit_feedback; the endpoint (www.flowwink.com) groups
 * the posts by the same normalised title the sender's cadence uses, so the
 * maintainer (or the endpoint's own FlowPilot) reads "seen on 4 instances, on
 * these versions" first. Pure — manage_feedback `clusters` feeds it rows.
 */
import { feedbackKey } from './feedback-cadence.ts';

export interface BoardPost {
  id: string;
  title: string;
  board: string;
  status: string;
  origin_site_url: string | null;
  origin: { skills_sha?: string | null; migration_head?: string | null } | null;
  created_at: string;
}

export interface ReportCluster {
  key: string;
  title: string;
  board: string;
  posts: number;
  instances: string[];
  versions: string[];
  statuses: Record<string, number>;
  first_at: string;
  last_at: string;
  post_ids: string[];
}

export function clusterReports(posts: BoardPost[]): ReportCluster[] {
  const byKey = new Map<string, ReportCluster>();
  for (const p of [...posts].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = `${p.board}:${feedbackKey(p.title)}`;
    const c = byKey.get(key) ?? {
      key, title: p.title, board: p.board, posts: 0, instances: [], versions: [], statuses: {},
      first_at: p.created_at, last_at: p.created_at, post_ids: [],
    };
    c.posts += 1;
    c.title = p.title;
    c.last_at = p.created_at;
    c.post_ids.push(p.id);
    c.statuses[p.status] = (c.statuses[p.status] ?? 0) + 1;
    const site = p.origin_site_url ?? 'unknown';
    if (!c.instances.includes(site)) c.instances.push(site);
    const sha = p.origin?.skills_sha ? String(p.origin.skills_sha).slice(0, 12) : null;
    if (sha && !c.versions.includes(sha)) c.versions.push(sha);
    byKey.set(key, c);
  }
  return [...byKey.values()].sort((a, b) =>
    b.instances.length - a.instances.length || b.posts - a.posts || b.last_at.localeCompare(a.last_at));
}
