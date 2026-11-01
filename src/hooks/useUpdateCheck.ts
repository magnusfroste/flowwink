import { useQuery } from '@tanstack/react-query';
import packageJson from '../../package.json';
import { decideUpdate, UPSTREAM_REPO, type UpdateState } from '@/lib/update-check';

const KIND = typeof __DEPLOY_KIND__ !== 'undefined' ? __DEPLOY_KIND__ : 'source';
const SOURCE_REPO = typeof __SOURCE_REPO__ !== 'undefined' ? __SOURCE_REPO__ : '';
const SHA = typeof __GIT_COMMIT_FULL__ !== 'undefined' ? __GIT_COMMIT_FULL__ : '';
const COMMIT_DATE = typeof __GIT_COMMIT_DATE__ !== 'undefined' ? __GIT_COMMIT_DATE__ : '';
const CACHE_KEY = 'flowwink.update-check.v1';
const CACHE_MS = 6 * 60 * 60 * 1000;

interface Upstream { behindBy: number | null; headDate: string | null; latestRelease: string | null }

async function gh<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}${path}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null; // 404 (sha not upstream's) or the 60/h anonymous limit — no notice, no noise
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchUpstream(): Promise<Upstream> {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { at: number; sha: string; data: Upstream } | null;
    if (cached && cached.sha === SHA && Date.now() - cached.at < CACHE_MS) return cached.data;
  } catch { /* storage unavailable — fetch */ }

  const [compare, head, release] = await Promise.all([
    KIND !== 'docker' && /^[0-9a-f]{40}$/.test(SHA) ? gh<{ ahead_by: number }>(`/compare/${SHA}...main`) : Promise.resolve(null),
    KIND !== 'docker' ? gh<{ commit: { committer: { date: string } } }>('/commits/main') : Promise.resolve(null),
    KIND === 'docker' ? gh<{ tag_name: string }>('/releases/latest') : Promise.resolve(null),
  ]);
  const data: Upstream = {
    behindBy: compare ? compare.ahead_by : null,
    headDate: head?.commit?.committer?.date ?? null,
    latestRelease: release?.tag_name?.replace(/^v/, '') ?? null,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), sha: SHA, data })); } catch { /* fine */ }
  return data;
}

/** The update notice's state for this build (admins only — see UpdateNotice). */
export function useUpdateCheck(enabled: boolean): UpdateState & { sourceRepo: string; compareUrl: string | null; currentVersion: string } {
  const upstreamBuild = SOURCE_REPO.toLowerCase() === UPSTREAM_REPO;
  const { data } = useQuery({
    queryKey: ['flowwink-update-check', SHA],
    queryFn: fetchUpstream,
    enabled: enabled && !upstreamBuild,
    staleTime: CACHE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const state = decideUpdate({
    kind: KIND, sourceRepo: SOURCE_REPO, currentVersion: packageJson.version, buildCommitDate: COMMIT_DATE || null,
    behindBy: data?.behindBy ?? null, upstreamHeadDate: data?.headDate ?? null, latestRelease: data?.latestRelease ?? null,
  });
  return {
    ...state,
    show: enabled && !!data && state.show,
    sourceRepo: SOURCE_REPO,
    compareUrl: /^[0-9a-f]{40}$/.test(SHA) ? `https://github.com/${UPSTREAM_REPO}/compare/${SHA.slice(0, 12)}...main` : null,
    currentVersion: packageJson.version,
  };
}
